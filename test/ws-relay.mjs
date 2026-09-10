// WebSocket 中继协议回归：hello→welcome、peer 广播、relay 转发、leave 清理
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { startServer } from './helpers/http-server.js';

function makeWsClient(port) {
  const sock = net.connect(port, '127.0.0.1');
  sock.on('error', () => {});
  const msgQueue = [];
  const waiters = [];
  let buf = Buffer.alloc(0);
  let parsing = false;
  const key = crypto.randomBytes(16).toString('base64');
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!parsing) {
      const headEnd = buf.indexOf('\r\n\r\n');
      if (headEnd < 0) return;
      const head = buf.slice(0, headEnd).toString('latin1');
      if (!head.includes('Sec-WebSocket-Accept:')) { sock.end(); return; }
      buf = buf.slice(headEnd + 4);
      parsing = true;
    }
    let i = 0;
    while (i + 2 <= buf.length) {
      const b0 = buf[i], b1 = buf[i + 1];
      const opcode = b0 & 0x0f;
      let len = b1 & 0x7f, off = i + 2;
      if (len === 126) { if (i + 4 > buf.length) break; len = buf.readUInt16BE(i + 2); off = i + 4; }
      else if (len === 127) { if (i + 10 > buf.length) break; len = Number(buf.readBigUInt64BE(i + 2)); off = i + 10; }
      const masked = (b1 & 0x80) !== 0;
      if (masked) off += 4;
      const end = off + len;
      if (end > buf.length) break;
      if (opcode === 1) {
        msgQueue.push(buf.slice(off, end).toString('utf8'));
        while (waiters.length && msgQueue.length) waiters.shift()(msgQueue.shift());
      }
      i = end;
    }
    buf = buf.slice(i);
  });
  function handshake() {
    // 主监听已解析握手头（parsing=true）；此处仅等待握手完成，避免重复监听 data
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { sock.destroy(); reject(new Error('upgrade timeout')); }, 5000);
      const check = () => { if (parsing) { clearTimeout(timer); sock.removeListener('data', check); resolve(); } };
      sock.on('data', check);
      sock.write(
        `GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
  }
  function send(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const mask = crypto.randomBytes(4);
    const maskedPayload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    sock.write(Buffer.concat([header, mask, maskedPayload]));
  }
  function next() {
    return new Promise((r) => {
      // 先消费已到达但未被取走的消息：滞后广播（如 peer 累积）不会卡到下一帧才交付
      if (msgQueue.length) { r(msgQueue.shift()); return; }
      const t = setTimeout(() => { r(null); }, 3000);
      waiters.push((v) => { clearTimeout(t); r(v); });
    });
  }
  return { sock, send, next, handshake };
}

const server = await startServer();
const port = new URL(server.baseUrl).port;
const failTimer = setTimeout(() => { console.error('ws-relay: timeout'); process.exit(1); }, 15000);
try {
  const a = makeWsClient(port);
  await a.handshake();
  a.send({ type: 'hello', role: 'host', room: 'TESTROOM', name: 'H' });
  const welcome = JSON.parse(await a.next());
  assert.equal(welcome.type, 'welcome', 'host should receive welcome');
  assert.equal(welcome.role, 'host');
  assert.equal(welcome.count, 1);

  const b = makeWsClient(port);
  await b.handshake();
  b.send({ type: 'hello', role: 'guest', room: 'TESTROOM', name: 'G' });
  const welcomeB = JSON.parse(await b.next());
  assert.equal(welcomeB.type, 'welcome');
  assert.equal(welcomeB.count, 2);

  // host 收到 peer 广播（guest 加入后）
  const peer = JSON.parse(await a.next());
  assert.equal(peer.type, 'peer', 'host should receive peer broadcast');
  assert.equal(peer.count, 2);
  assert.ok(peer.clients.some((c) => c.role === 'guest' && c.name === 'G'), 'peer list should include guest');

  // relay 广播到同房间其他客户端
  b.send({ type: 'input', team: 't', x: 100, y: 200 });
  const relay = JSON.parse(await a.next());
  assert.equal(relay.type, 'input', 'host should receive relayed input');
  assert.equal(relay.x, 100);

  // leave：发 leave 消息触发 server 广播 peer 更新（close/destroy 的 RST 不保证触发 server close）
  b.send({ type: 'leave' });
  const leavePeer = JSON.parse(await a.next());
  assert.equal(leavePeer.type, 'peer', 'host should get peer update on leave');
  assert.equal(leavePeer.count, 1);

  // hostLeft：房主离开时剩余玩家收到提示，旧房间立即清理
  const c = makeWsClient(port);
  await c.handshake();
  c.send({ type: 'hello', role: 'guest', room: 'TESTROOM', name: 'G2' });
  const welcomeC = JSON.parse(await c.next());
  assert.equal(welcomeC.type, 'welcome');
  const peerC = JSON.parse(await a.next());
  assert.equal(peerC.type, 'peer');
  assert.equal(peerC.count, 2);

  a.send({ type: 'leave' });
  const hostLeft = JSON.parse(await c.next());
  assert.equal(hostLeft.type, 'hostLeft', 'guest should receive hostLeft when host leaves');
  assert.equal(hostLeft.count, 0);
  await new Promise((resolve) => c.sock.once('close', resolve));

  a.sock.destroy();

  // ---- spectator：LAN 第三方观战回归 ----
  // 场景：host + guest 对战，观战端以 role=spectator 加入第三端。
  // 验证：welcome(role=spectator)、peer 列表带 spectator 且不干扰 host/guest 角色、
  //       host relay（start/input）观战端能收到、观战端只收不发（其 input 被服务器忽略）、
  //       观战端离开后房间计数回落且对战双方不受影响。
  const h = makeWsClient(port);
  await h.handshake();
  h.send({ type: 'hello', role: 'host', room: 'SPECROOM', name: 'SH' });
  const specWelcomeH = JSON.parse(await h.next());
  assert.equal(specWelcomeH.type, 'welcome');
  assert.equal(specWelcomeH.role, 'host');

  const g = makeWsClient(port);
  await g.handshake();
  g.send({ type: 'hello', role: 'guest', room: 'SPECROOM', name: 'SG' });
  const specWelcomeG = JSON.parse(await g.next());
  assert.equal(specWelcomeG.type, 'welcome');
  assert.equal(specWelcomeG.count, 2);
  const peerG = JSON.parse(await h.next());
  assert.equal(peerG.type, 'peer');
  assert.equal(peerG.count, 2);

  const s = makeWsClient(port);
  await s.handshake();
  s.send({ type: 'hello', role: 'spectator', room: 'SPECROOM', name: 'SS' });
  const welcomeS = JSON.parse(await s.next());
  assert.equal(welcomeS.type, 'welcome', 'spectator should receive welcome');
  assert.equal(welcomeS.role, 'spectator', 'spectator welcome keeps spectator role');
  assert.equal(welcomeS.count, 3, 'spectator joins room clients (count = host+guest+spectator)');

  // peer 广播：观战端出现在列表且三种角色各一个（不占对战槽、不改 host/guest 计数语义）
  const peerH = JSON.parse(await h.next());
  assert.equal(peerH.type, 'peer');
  assert.equal(peerH.count, 3);
  assert.equal(peerH.clients.filter((c) => c.role === 'host').length, 1);
  assert.equal(peerH.clients.filter((c) => c.role === 'guest').length, 1);
  assert.ok(peerH.clients.some((c) => c.role === 'spectator' && c.name === 'SS'), 'peer list should include spectator');

  // host 的 relay/start 广播对观战端可见
  h.send({ type: 'start', seed: 42, mapId: 'dust2' });
  const startS = JSON.parse(await s.next());
  assert.equal(startS.type, 'start', 'spectator should receive host start broadcast');
  assert.equal(startS.seed, 42);
  h.send({ type: 'input', team: 'ct', x: 11, y: 22 });
  const inputS = JSON.parse(await s.next());
  assert.equal(inputS.type, 'input', 'spectator should receive relayed input');
  assert.equal(inputS.x, 11);

  // 观战端只收不发：观战端发的 input 被服务器忽略，guest 的正常 input 不受干扰
  s.send({ type: 'input', team: 'ct', x: 99, y: 99 });
  g.send({ type: 'input', team: 't', x: 55, y: 66 });
  const inputH = JSON.parse(await h.next());
  assert.equal(inputH.type, 'input');
  assert.equal(inputH.x, 55, 'guest input relayed while spectator input dropped');

  // 观战端离开：房间计数回落到对战双方，host/guest 不受影响
  s.send({ type: 'leave' });
  const peerAfterSpec = JSON.parse(await h.next());
  assert.equal(peerAfterSpec.type, 'peer', 'host should get peer update when spectator leaves');
  assert.equal(peerAfterSpec.count, 2);
  assert.ok(!peerAfterSpec.clients.some((c) => c.role === 'spectator'), 'spectator removed from peer list');

  h.send({ type: 'leave' });
  // g 队列积压的滞后广播：peer(观战加入)、start、input 转发、peer(观战离开)，清空后才是 hostLeft
  for (let i = 0; i < 4; i++) await g.next();
  const hostLeftG = JSON.parse(await g.next());
  assert.equal(hostLeftG.type, 'hostLeft', 'guest still gets hostLeft after spectator left');
  assert.equal(hostLeftG.count, 0);
  h.sock.destroy();
  g.sock.destroy();
  s.sock.destroy();
} finally {
  clearTimeout(failTimer);
  await server.stop();
}

console.log('ws-relay: all PASS');
