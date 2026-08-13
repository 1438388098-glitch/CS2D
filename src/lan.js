import { startMatch } from './game.js';
import { applyDamage } from './combat.js';

let ws = null;
let game = null;
let heartbeat = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let closedByUser = false;

export function reconnectDelayMs(attempt) {
  return attempt * 3000;
}

function $(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }

function setStatus(text) {
  const el = $('lanStatus');
  if (el) el.textContent = text;
}

function setConn(state) {
  const btn = $('lanStartBtn');
  if (btn) btn.disabled = state !== 'ready';
  const st = $('lanStatus');
  if (st) st.className = state || '';
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function connect(gameRef, role, room, name, isReconnect = false) {
  clearReconnectTimer();
  if (ws) {
    ws._suppressReconnect = true;
    try { ws.close(); } catch (err) { /* ignore */ }
    ws = null;
  }
  if (!isReconnect) reconnectAttempts = 0;
  closedByUser = false;
  game = gameRef;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(proto + '://' + location.host + '/ws?room=' + encodeURIComponent(room) + '&role=' + role);
  socket._suppressReconnect = false;
  ws = socket;
  socket.onopen = () => {
    send({ type: 'hello', role, room, name: name || (role === 'host' ? '房主' : '玩家') });
  };
  socket.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (err) { return; }
    if (msg.type === 'welcome') {
      game.lan = game.lan || {};
      Object.assign(game.lan, { role, room, ws, connected: true, peerCount: msg.count || 1, send });
      setStatus(role === 'host' ? '房间 ' + room + ' 已创建，等待玩家加入…' : '已加入房间 ' + room + '，等待房主开赛…');
      setConn('wait');
      if (role === 'host') {
        const sb = $('lanStartBtn');
        if (sb) sb.textContent = '等待玩家加入';
      }
    } else if (msg.type === 'peer') {
      game.lan.peerCount = msg.count || 1;
      if (game.lan.role === 'host' && msg.clients) {
        const guest = msg.clients.find((c) => c.role !== 'host');
        if (guest) game.lan.remoteName = guest.name;
      }
      setStatus('房间 ' + room + ' · 在线 ' + msg.count + ' 人：' + (msg.clients || []).map((c) => c.name + '(' + (c.role === 'host' ? '房主' : '玩家') + ')').join('、'));
      if (game.lan.role === 'host' && msg.count >= 2) {
        setConn('ready');
        const sb = $('lanStartBtn');
        if (sb) sb.textContent = '开始局域网对战';
      }
    } else if (msg.type === 'hostLeft') {
      // 房主离开：引导玩家返回主菜单重新建房
      setStatus('房主已离开，请返回主菜单重新建房');
      setConn('');
      const sb = $('lanStartBtn');
      if (sb) sb.textContent = '房主已离开';
      game.lan.connected = false;
      game.lan.hostLeft = true;
      try { if (ws) ws.close(); } catch (err) { /* ignore */ }
      showHostLeftRecovery();
    } else if (msg.type === 'start') {
      Object.assign(game.opts, {
        mode: 'lan', seed: msg.seed, mapId: msg.mapId, team: msg.team,
        remoteTeam: msg.remoteTeam, remoteName: msg.name, lan: game.lan || {}
      });
      game.seed = msg.seed;
      game.mode = 'lan';
      game.lan = game.lan || {};
      // 双方各收到 start 广播：仅首次赋值，防止 host 侧 role 被广播的 guestRole 覆盖
      if (!game.lan.role) game.lan.role = msg.guestRole === 'guest' ? 'guest' : 'host';
      game.lan.remoteTeam = msg.remoteTeam;
      if (!game.lan.remoteName) game.lan.remoteName = msg.hostName;
      const panel = $('lanPanel');
      if (panel) panel.style.display = 'none';
      startMatch(game);
    } else if (msg.type === 'hit') {
      applyRemoteHit(msg);
    } else if (msg.type === 'input' || msg.type === 'snapshot') {
      applyRemote(msg);
    }
  };
  socket.onclose = () => {
    if (socket._suppressReconnect) return;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (game && game.lan) game.lan.connected = false;
    if (game && game.lan && game.lan.hostLeft) {
      setStatus('房主已离开，请返回主菜单重新建房');
      showHostLeftRecovery();
    } else {
      if (!closedByUser && reconnectAttempts < 3) {
        reconnectAttempts++;
        setStatus('连接断开，' + (reconnectAttempts * 3) + ' 秒后自动重连（' + reconnectAttempts + '/3）…');
        reconnectTimer = setTimeout(() => connect(game, role, room, name, true), reconnectDelayMs(reconnectAttempts));
      } else {
        setStatus(closedByUser ? '局域网连接已关闭' : '局域网连接已断开');
      }
    }
    setConn('');
  };
  socket.onerror = () => setStatus('连接失败，正在自动重连…');
}

function showHostLeftRecovery() {
  if (typeof document === 'undefined') return;
  let btn = document.getElementById('lanBackBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'lanBackBtn';
    btn.className = 'btn';
    btn.textContent = '返回主菜单';
    btn.onclick = () => {
      const panel = $('lanPanel');
      if (panel) panel.style.display = 'none';
      if (game && game.ui) game.ui.showMenu();
      closeLan();
    };
    const status = $('lanStatus');
    if (status && status.parentNode) status.parentNode.insertBefore(btn, status.nextSibling);
  }
  btn.style.display = 'inline-block';
}

// 联机伤害结算：对方命中了我（我在对方视角是 remote 实体），
// 这里对自己 player 权威应用伤害（killer 用本地的 remote 实体，即对方玩家）。
function applyRemoteHit(msg) {
  if (!game || !game.player || game.player.dead) return;
  const remote = game.entities && game.entities.find((x) => x.netRole === 'remote');
  applyDamage(game.player, msg.dmg, { killer: remote || null, weapon: msg.weapon, head: !!msg.head }, game);
}

function applyRemote(msg) {
  if (!game || !game.entities) return;
  const e = game.entities.find((x) => x.netRole === 'remote');
  if (!e) return;
  if (msg.team !== e.team) return;
  // 位置插值：新快照到来时把上一目标位置存为插值起点，新位置为目标，渲染层在两者间平滑
  if (e._netTx !== undefined && (msg.x !== e._netTx || msg.y !== e._netTy)) {
    e._netPx = e._netTx;
    e._netPy = e._netTy;
    e._netT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  } else if (e._netPx === undefined) {
    e._netPx = msg.x; e._netPy = msg.y;
    e._netT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
  e._netTx = msg.x; e._netTy = msg.y;
  e.angle = msg.angle; e.hp = msg.hp;
  e.vx = msg.vx || 0; e.vy = msg.vy || 0; e.dead = !!msg.dead;
  if (msg.weapon) {
    e.weapons.primary = msg.weapon;
    e.slot = 'primary';
  }
  if (msg.ammo !== undefined) e.ammoMap[msg.weapon || e.weapons.primary || 'glock'] = msg.ammo;
}

// 渲染插值：按快照间隔（~33ms）在上一目标与当前目标间线性平滑远程实体位置
export function smoothRemote(gameRef, dt) {
  if (!gameRef) return;
  const e = gameRef.entities && gameRef.entities.find((x) => x.netRole === 'remote');
  if (!e || e._netPx === undefined || e._netTx === undefined) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const span = Math.max(1, now - e._netT0);
  const t = Math.min(1, span / 33);
  e.x = e._netPx + (e._netTx - e._netPx) * t;
  e.y = e._netPy + (e._netTy - e._netPy) * t;
}

// 6 位强随机房间码（去易混淆字符），优先用 Web Crypto，避免 Math.random 短码被撞房/抢房
function randomRoom() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function startHost() {
  const room = randomRoom();
  const name = $('lanName') && $('lanName').value ? $('lanName').value : '房主';
  game.opts.team = 'ct';
  game.opts.remoteTeam = 't';
  connect(game, 'host', room, name);
}

function startGuest() {
  const room = ($('lanRoom') && $('lanRoom').value || '').trim().toUpperCase();
  const name = $('lanName') && $('lanName').value ? $('lanName').value : '玩家';
  if (!room) { setStatus('请输入 4-8 位房间码'); return; }
  game.opts.team = 't';
  game.opts.remoteTeam = 'ct';
  connect(game, 'guest', room, name);
}

function hostStartMatch() {
  if (!game.lan || game.lan.peerCount < 2) return;
  const seed = Math.floor(Math.random() * 0x7fffffff);
  const msg = {
    type: 'start', seed, mapId: game.opts.mapId || 'dust2',
    team: 't', remoteTeam: 'ct', guestRole: 'guest', hostName: $('lanName') ? $('lanName').value : '房主'
  };
  send(msg);
  Object.assign(game.opts, { mode: 'lan', seed, mapId: msg.mapId, team: 'ct', remoteTeam: 't' });
  game.seed = seed;
  game.mode = 'lan';
  game.lan = game.lan || {};
  game.lan.remoteTeam = 't';
  const panel = $('lanPanel');
  if (panel) panel.style.display = 'none';
  startMatch(game);
}

export function initLan(gameRef) {
  game = gameRef;
  if (typeof document === 'undefined') return;
  const hostBtn = $('lanHostBtn');
  const joinBtn = $('lanJoinBtn');
  const startBtn = $('lanStartBtn');
  if (hostBtn) hostBtn.onclick = () => startHost();
  if (joinBtn) joinBtn.onclick = () => startGuest();
  if (startBtn) startBtn.onclick = () => hostStartMatch();
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    if (!game || !game.lan || !game.lan.connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    const p = game.player;
    // 等待开赛期间发保活心跳，避免服务端 90s 空闲清理误拆房间
    if (!p) { send({ type: 'ping' }); return; }
    send({ type: 'input', team: p.team, x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, hp: p.hp, dead: p.dead, weapon: p.weapons.primary, ammo: p.ammoMap[p.weapons.primary || p.weapons.secondary || 'glock'] });
  }, 33);
  // 页面卸载时清理心跳与连接
  if (typeof window !== 'undefined') window.addEventListener('pagehide', closeLan);
}

export function closeLan() {
  closedByUser = true;
  clearReconnectTimer();
  reconnectAttempts = 0;
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (ws) {
    ws._suppressReconnect = true;
    try { ws.close(); } catch (err) { /* ignore */ } }
  ws = null;
}

export function hostStartMatchNow() { hostStartMatch(); }
