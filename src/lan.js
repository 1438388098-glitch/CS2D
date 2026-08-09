import { startMatch } from './game.js';

let ws = null;
let game = null;
let heartbeat = null;

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

function connect(gameRef, role, room, name) {
  game = gameRef;
  if (ws) { try { ws.close(); } catch (err) { /* ignore */ } }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws?room=' + encodeURIComponent(room) + '&role=' + role);
  ws.onopen = () => {
    send({ type: 'hello', role, room, name: name || (role === 'host' ? '房主' : '玩家') });
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (err) { return; }
    if (msg.type === 'welcome') {
      game.lan = game.lan || {};
      Object.assign(game.lan, { role, room, ws, connected: true, peerCount: msg.count || 1 });
      setStatus(role === 'host' ? '房间 ' + room + ' 已创建，等待玩家加入…' : '已加入房间 ' + room + '，等待房主开赛…');
      setConn('wait');
      if (role === 'host') $('lanStartBtn').textContent = '等待玩家加入';
    } else if (msg.type === 'peer') {
      game.lan.peerCount = msg.count || 1;
      setStatus('房间 ' + room + ' · 在线 ' + msg.count + ' 人：' + (msg.clients || []).map((c) => c.name + '(' + (c.role === 'host' ? '房主' : '玩家') + ')').join('、'));
      if (game.lan.role === 'host' && msg.count >= 2) {
        setConn('ready');
        $('lanStartBtn').textContent = '开始局域网对战';
      }
    } else if (msg.type === 'start') {
      Object.assign(game.opts, {
        mode: 'lan', seed: msg.seed, mapId: msg.mapId, team: msg.team,
        remoteTeam: msg.remoteTeam, remoteName: msg.name, lan: game.lan || {}
      });
      game.seed = msg.seed;
      game.mode = 'lan';
      game.lan = game.lan || {};
      game.lan.role = msg.guestRole === 'guest' ? 'guest' : 'host';
      game.lan.remoteTeam = msg.remoteTeam;
      game.lan.remoteName = msg.hostName;
      const panel = $('lanPanel');
      if (panel) panel.style.display = 'none';
      startMatch(game);
    } else if (msg.type === 'input' || msg.type === 'snapshot') {
      applyRemote(msg);
    }
  };
  ws.onclose = () => {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    setStatus('局域网连接已断开');
    setConn('');
  };
  ws.onerror = () => setStatus('连接失败，请确认在同一局域网且服务已启动');
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

function startHost() {
  const room = (Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 5)).toUpperCase();
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
    if (!p) return;
    send({ type: 'input', team: p.team, x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, hp: p.hp, dead: p.dead, weapon: p.weapons.primary, ammo: p.ammoMap[p.weapons.primary || p.weapons.secondary || 'glock'] });
  }, 33);
  // 页面卸载时清理心跳与连接
  if (typeof window !== 'undefined') window.addEventListener('pagehide', closeLan);
}

export function closeLan() {
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (ws) { try { ws.close(); } catch (err) { /* ignore */ } }
  ws = null;
}

export function hostStartMatchNow() { hostStartMatch(); }
