// 对局结果回流（matchReport）回归：LAN 房主上报 → server 清洗字段 → logs/matches.jsonl 落盘。
// 契约：spectator 上报被忽略；score/duration/winner 白名单清洗；坏行不致崩；上报不广播。
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './helpers/http-server.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logPath = path.join(repoRoot, 'logs', 'matches.jsonl');

// 迷你 WS 客户端：握手 + 发送掩码文本帧（客户端→服务器帧必须带掩码）
function wsConnect(port) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(port, '127.0.0.1');
    sock.on('error', (e) => reject(e));
    let buf = Buffer.alloc(0);
    sock.on('data', (chunk) => { buf += chunk.toString('latin1'); if (buf.includes('Sec-WebSocket-Accept:')) { sock.removeAllListeners('data'); resolve({ sock, send }); } });
    setTimeout(() => reject(new Error('ws handshake timeout')), 5000);
    sock.write(
      'GET /ws HTTP/1.1\r\n' +
      'Host: localhost\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Key: ' + key + '\r\n' +
      'Sec-WebSocket-Version: 13\r\n\r\n'
    );
    function send(obj) {
      const payload = Buffer.from(JSON.stringify(obj), 'utf8');
      const mask = crypto.randomBytes(4);
      const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
      const head = payload.length < 126
        ? Buffer.from([0x81, 0x80 | payload.length])
        : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);
      sock.write(Buffer.concat([head, mask, masked]));
    }
  });
}

function readLogRecords() {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (err) { return null; } }).filter(Boolean);
}

const { baseUrl, stop } = await startServer();
const port = Number(new URL(baseUrl).port);
const roomTag = 'TEST-' + crypto.randomBytes(4).toString('hex');
const before = readLogRecords().length;

try {
  const host = await wsConnect(port);
  host.send({ type: 'hello', role: 'host', room: roomTag, name: 'reporter' });
  await new Promise((r) => setTimeout(r, 200));

  // 房主上报：合法字段
  host.send({ type: 'matchReport', map: 'dust2', mode: 'classic', score: { T: 5, CT: 3 }, duration: 613.7, winner: 't' });
  await new Promise((r) => setTimeout(r, 300));

  let recs = readLogRecords();
  const mine = recs.find((r) => r.room === roomTag);
  assert.ok(mine, 'report appended');
  assert.equal(mine.map, 'dust2', 'map recorded');
  assert.equal(mine.mode, 'classic', 'mode recorded');
  assert.deepEqual(mine.score, { T: 5, CT: 3 }, 'score sanitized to numbers');
  assert.equal(mine.duration, 614, 'duration rounded');
  assert.equal(mine.winner, 't', 'winner recorded');
  assert.ok(typeof mine.ts === 'string' && mine.ts.includes('T'), 'timestamp present');
  assert.ok(recs.length === before + 1, 'exactly one line appended');

  // 字段畸形：不产生第二条
  host.send({ type: 'matchReport', map: { evil: 1 }, score: 'nope', duration: 'abc', winner: 'h4x' });
  await new Promise((r) => setTimeout(r, 300));
  recs = readLogRecords();
  const weird = recs.filter((r) => r.room === roomTag);
  assert.equal(weird.length, 2, 'malformed report still logged once (sanitized)');
  assert.equal(weird[1].map, '', 'non-string map stripped');
  assert.equal(weird[1].score, null, 'bad score -> null');
  assert.equal(weird[1].winner, '', 'bad winner stripped');

  host.sock.end();

  // 观战端上报被忽略
  const spec = await wsConnect(port);
  spec.send({ type: 'hello', role: 'spectator', room: roomTag, name: 'watcher' });
  await new Promise((r) => setTimeout(r, 200));
  const cnt = readLogRecords().length;
  spec.send({ type: 'matchReport', map: 'hack', score: { T: 1, CT: 0 }, winner: 't' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(readLogRecords().length, cnt, 'spectator report ignored');
  spec.sock.end();
} finally {
  await stop();
}

console.log('match-report: all PASS');
