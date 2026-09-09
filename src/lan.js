import { startMatch } from './game.js';
import { applyDamage } from './combat.js';
import { createEntity } from './entities.js';

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
      // 对战参与方计数（观战端不计入）：host 据此判断能否开赛
      game.lan.playerCount = role === 'spectator' ? 0 : 1;
      setStatus(role === 'spectator' ? '已以观战身份加入房间 ' + room + '，等待房主开赛…'
        : role === 'host' ? '房间 ' + room + ' 已创建，等待玩家加入…' : '已加入房间 ' + room + '，等待房主开赛…');
      setConn('wait');
      if (role === 'host') {
        const sb = $('lanStartBtn');
        if (sb) sb.textContent = '等待玩家加入';
      }
    } else if (msg.type === 'peer') {
      game.lan.peerCount = msg.count || 1;
      const roleLabel = (c) => c.role === 'host' ? '房主' : (c.role === 'spectator' ? '观战' : '玩家');
      const players = (msg.clients || []).filter((c) => c.role !== 'spectator');
      if (players.length) game.lan.playerCount = players.length;
      if (msg.clients) {
        const guest = msg.clients.find((c) => c.role === 'guest');
        if (guest) game.lan.guestName = guest.name;
        const hostCli = msg.clients.find((c) => c.role === 'host');
        if (hostCli) game.lan.hostName = hostCli.name;
      }
      if (game.lan.role === 'host' && msg.clients) {
        const guest = msg.clients.find((c) => c.role !== 'host' && c.role !== 'spectator');
        if (guest) game.lan.remoteName = guest.name;
      }
      setStatus('房间 ' + room + ' · 在线 ' + msg.count + ' 人：' + (msg.clients || []).map((c) => c.name + '(' + roleLabel(c) + ')').join('、'));
      // 只有对战双方到齐才允许开赛：观战端加入不计入（不占对战槽）
      if (game.lan.role === 'host' && game.lan.playerCount >= 2) {
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
      game.lan = game.lan || {};
      if (game.lan.role === 'spectator') { startSpectate(msg); return; }
      Object.assign(game.opts, {
        mode: 'lan', seed: msg.seed, mapId: msg.mapId, team: msg.team,
        remoteTeam: msg.remoteTeam, remoteName: msg.name, lan: game.lan || {}
      });
      game.seed = msg.seed;
      game.mode = 'lan';
      // 双方各收到 start 广播：仅首次赋值，防止 host 侧 role 被广播的 guestRole 覆盖
      if (!game.lan.role) game.lan.role = msg.guestRole === 'guest' ? 'guest' : 'host';
      game.lan.remoteTeam = msg.remoteTeam;
      if (!game.lan.remoteName) game.lan.remoteName = msg.hostName;
      game.lan.spectating = false;
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
  // 按消息 team 路由到对应 remote 代理：双人对战只有一个 remote（行为不变），
  // 观战端有两个（host 代理 + guest 代理，各占一队的一个真人席位）
  const e = game.entities.find((x) => x.netRole === 'remote' && x.team === msg.team);
  if (!e) return;
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

// 观战端进局：本地模拟与对战端同结构（每队 1 真人 + N bot），两名真人各由一队 bot 代理，
// 位置/血量经 input/snapshot 快照驱动（applyRemote 按 team 路由）；本地 player 常驻死亡，
// 复用阵亡观战镜头（左键/Q/E 切换观战目标），不参与操控与伤害结算（applyRemoteHit 自动忽略）。
function startSpectate(msg) {
  const guestName = game.lan.guestName || '玩家';
  Object.assign(game.opts, {
    mode: 'lan', seed: msg.seed, mapId: msg.mapId, team: 'ct', remoteTeam: 't',
    remoteName: guestName, lan: game.lan || {}
  });
  // 同步房主 bot 数：保证观战端阵容规模与对战端一致（旧版 start 消息无 bots 字段时沿用本地值）
  if (msg.bots) game.opts.bots = msg.bots;
  game.seed = msg.seed;
  game.mode = 'lan';
  game.lan.remoteTeam = 't';
  game.lan.remoteName = guestName; // lanStart 用 remoteName 命名 T 队 guest 代理
  game.lan.spectating = true;
  const panel = $('lanPanel');
  if (panel) panel.style.display = 'none';
  startMatch(game);
  // lanStart 已把 T 队一个 bot 标记为 guest 代理（netRole remote）；这里补上 host 代理（CT 队）
  const hostEnt = game.entities.find((e) => e.bot && e.team === 'ct' && !e.netRole);
  if (hostEnt) {
    hostEnt.netControlled = true;
    hostEnt.netRole = 'remote';
    hostEnt.name = msg.hostName || game.lan.hostName || '房主';
  }
  // 真人席位被代理占用后每队少一个 AI：各补 1 个 bot，使回合存活计数（团灭判定）与对战端 1+N 阵容一致
  const diffParams = game.opts.diffParams || {};
  for (const team of ['t', 'ct']) {
    const extra = createEntity(team, true);
    extra.aiParams = { ...diffParams };
    game.entities.push(extra);
  }
  // 本地玩家常驻死亡：进入观战镜头（回合重生会复位 dead，由 smoothRemote 每帧维持）
  if (game.player) game.player.dead = true;
}

// 渲染插值：按快照间隔（~33ms）在上一目标与当前目标间线性平滑远程实体位置。
// 遍历所有 remote 代理：双人对战仅一个（行为不变），观战端 host/guest 两个代理都平滑。
export function smoothRemote(gameRef, dt) {
  if (gameRef && gameRef.lan && gameRef.lan.spectating && gameRef.mode === 'lan') {
    // 观战端每帧维持本地玩家死亡：回合重生（spawnEntity）会把 dead 复位，需立即压回以保持观战镜头
    const p = gameRef.player;
    if (p && !p.dead) p.dead = true;
  }
  if (!gameRef || !gameRef.entities) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (const e of gameRef.entities) {
    if (e.netRole !== 'remote' || e._netPx === undefined || e._netTx === undefined) continue;
    const span = Math.max(1, now - e._netT0);
    const t = Math.min(1, span / 33);
    e.x = e._netPx + (e._netTx - e._netPx) * t;
    e.y = e._netPy + (e._netTy - e._netPy) * t;
  }
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

// 第三方观战：只收不发（服务端忽略观战端的 relay 类消息），进局后由快照驱动观战画面
function startSpectator() {
  const room = ($('lanRoom') && $('lanRoom').value || '').trim().toUpperCase();
  const name = $('lanName') && $('lanName').value ? $('lanName').value : '观战';
  if (!room) { setStatus('请输入 4-8 位房间码'); return; }
  connect(game, 'spectator', room, name);
}

function hostStartMatch() {
  const players = game.lan && game.lan.playerCount !== undefined ? game.lan.playerCount : (game.lan ? game.lan.peerCount : 0);
  if (!game.lan || players < 2) return;
  const seed = Math.floor(Math.random() * 0x7fffffff);
  const msg = {
    type: 'start', seed, mapId: game.opts.mapId || 'dust2',
    team: 't', remoteTeam: 'ct', guestRole: 'guest', hostName: $('lanName') ? $('lanName').value : '房主',
    bots: game.opts.bots
  };
  send(msg);
  Object.assign(game.opts, { mode: 'lan', seed, mapId: msg.mapId, team: 'ct', remoteTeam: 't' });
  game.seed = seed;
  game.mode = 'lan';
  game.lan = game.lan || {};
  game.lan.remoteTeam = 't';
  game.lan.spectating = false;
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
  const specBtn = $('lanSpectateBtn');
  if (hostBtn) hostBtn.onclick = () => startHost();
  if (joinBtn) joinBtn.onclick = () => startGuest();
  if (specBtn) specBtn.onclick = () => startSpectator();
  if (startBtn) startBtn.onclick = () => hostStartMatch();
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    if (!game || !game.lan || !game.lan.connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    // 观战端只收不发：仅发保活心跳，不上报 input
    if (game.lan.spectating) { send({ type: 'ping' }); return; }
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
  if (game && game.lan) game.lan.spectating = false;
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (ws) {
    ws._suppressReconnect = true;
    try { ws.close(); } catch (err) { /* ignore */ } }
  ws = null;
}

export function hostStartMatchNow() { hostStartMatch(); }
