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
  function next() { return new Promise((r) => { const t = setTimeout(() => { r(null); }, 3000); waiters.push((v) => { clearTimeout(t); r(v); }); }); }
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

  a.sock.destroy();
} finally {
  clearTimeout(failTimer);
  await server.stop();
}

console.log('ws-relay: all PASS');
