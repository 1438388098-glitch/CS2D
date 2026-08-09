import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

// Major 模式自检：modes.js 若被外部还原为旧版（缺 48 队赛制），启动时自动修复
try {
  const majorSrc = fs.readFileSync(path.join(ROOT, 'src', 'modes.js'), 'utf8');
  if (!majorSrc.includes('setMajorSim')) {
    console.log('  [Major] modes.js 缺少 48 队赛制代码，正在自动修复...');
    const pr = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'patch-major.mjs')], { encoding: 'utf8' });
    if (pr.status !== 0) console.error('  [Major] 自动修复失败: ' + (pr.stderr || pr.stdout || ''));
    else console.log('  [Major] 修复完成（48 队 + IEM 2026 赛制）');
  }
} catch (err) {
  console.error('  [Major] 自检异常: ' + err.message);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

const BLOCKED_PREFIXES = ['/.git', '/.autopilot', '/node_modules'];

const COMPRESSIBLE_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);
const NO_CACHE_EXT = new Set(['.html', '.js', '.mjs', '.css']);

function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return NO_CACHE_EXT.has(ext) ? 'no-cache' : 'public, max-age=3600';
}

function compressIfPossible(data, req, filePath, cb) {
  const ext = path.extname(filePath).toLowerCase();
  if (!COMPRESSIBLE_EXT.has(ext) || data.length < 1024) return cb(null);
  const acceptEncoding = String(req.headers['accept-encoding'] || '').toLowerCase();
  if (!acceptEncoding.includes('gzip')) return cb(null);
  // 异步 gzip：压缩大文件不阻塞 WS 中继事件循环
  zlib.gzip(data, (err, out) => {
    if (err) return cb(null);
    cb(out);
  });
}

function sendStatus(res, code, body, extraHeaders = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS, ...extraHeaders });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // 请求日志（LOG=1 开启）：记录方法/路径/状态码，便于本地调试
  if (process.env.LOG === '1') {
    res.on('finish', () => console.log(`[http] ${req.method} ${req.url} -> ${res.statusCode}`));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendStatus(res, 405, 'Method Not Allowed', { 'Allow': 'GET, HEAD' });
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    sendStatus(res, 400, 'Bad Request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.includes('\\') || urlPath.includes('\0')) {
    sendStatus(res, 400, 'Bad Request');
    return;
  }
  // 敏感目录不下发（.git 等仓库内部文件）
  if (BLOCKED_PREFIXES.some((prefix) => urlPath === prefix || urlPath.startsWith(prefix + '/'))) {
    sendStatus(res, 403, 'Forbidden');
    return;
  }
  const filePath = path.join(ROOT, urlPath);
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    sendStatus(res, 403, 'Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendStatus(res, 404, 'Not Found');
      return;
    }
    const etag = '"' + crypto.createHash('sha1').update(data).digest('hex').slice(0, 24) + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': cacheControlFor(filePath),
        'Vary': 'Accept-Encoding',
        ...SECURITY_HEADERS
      });
      res.end();
      return;
    }
    const headers = {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cacheControlFor(filePath),
      'ETag': etag,
      'Vary': 'Accept-Encoding',
      ...SECURITY_HEADERS
    };
    compressIfPossible(data, req, filePath, (body) => {
      if (body) {
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = body.length;
      } else {
        headers['Content-Length'] = data.length;
      }
      res.writeHead(200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(body || data);
    });
  });
});


const rooms = new Map();

function sendFrame(ws, payload) {
  const buf = Buffer.from(JSON.stringify(payload), 'utf8');
  const len = buf.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  try { ws.socket.write(Buffer.concat([header, buf])); } catch (err) { /* closed */ }
}

function broadcast(room, payload, except) {
  const r = rooms.get(room);
  if (!r) return;
  for (const c of r.clients) {
    if (c === except) continue;
    sendFrame(c, payload);
  }
}

function handleFrame(ws, payload) {
  let msg;
  try { msg = JSON.parse(payload.toString('utf8')); } catch (err) { return; }
  if (!msg || !msg.type) return;
  if (msg.type === 'hello') {
    const room = String(msg.room || '').trim();
    if (!room) return;
    ws.room = room;
    ws.role = msg.role === 'host' ? 'host' : 'guest';
    ws.name = String(msg.name || 'LAN Player');
    let r = rooms.get(room);
    if (!r) { r = { clients: new Set(), host: null }; rooms.set(room, r); }
    r.clients.add(ws);
    if (ws.role === 'host') r.host = ws;
    sendFrame(ws, { type: 'welcome', role: ws.role, room, count: r.clients.size });
    broadcast(room, { type: 'peer', count: r.clients.size, clients: [...r.clients].map((c) => ({ role: c.role, name: c.name })) }, ws);
    return;
  }
  if (!ws.room) return;
  if (msg.type === 'relay' || msg.type === 'input' || msg.type === 'start') {
    broadcast(ws.room, msg, ws);
    return;
  }
  if (msg.type === 'leave') {
    leave(ws);
  }
}

function leave(ws) {
  if (!ws.room) return;
  const r = rooms.get(ws.room);
  if (r) {
    const wasHost = r.host === ws;
    r.clients.delete(ws);
    if (r.host === ws) r.host = null;
    if (wasHost) {
      // 房主离开：通知剩余玩家重新建房，避免对方空等
      broadcast(ws.room, { type: 'hostLeft', count: r.clients.size, clients: [...r.clients].map((c) => ({ role: c.role, name: c.name })) }, ws);
    }
    broadcast(ws.room, { type: 'peer', count: r.clients.size, clients: [...r.clients].map((c) => ({ role: c.role, name: c.name })) }, ws);
    if (r.clients.size === 0) rooms.delete(ws.room);
  }
  ws.room = null;
  try { ws.socket.end(); } catch (err) { /* closed */ }
}

function handleData(ws, chunk) {
  ws.lastActive = Date.now();
  ws.buf = Buffer.concat([ws.buf, chunk]);
  while (true) {
    if (ws.buf.length < 2) return;
    const b0 = ws.buf[0], b1 = ws.buf[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) {
      if (ws.buf.length < 4) return;
      len = ws.buf.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (ws.buf.length < 10) return;
      len = Number(ws.buf.readBigUInt64BE(2)); off = 10;
    }
    // 帧大小上限（64KB）：防恶意大帧撑爆缓冲
    if (len > 65536) { ws.socket.destroy(); return; }
    const maskLen = masked ? 4 : 0;
    if (ws.buf.length < off + maskLen + len) return;
    const mask = masked ? ws.buf.slice(off, off + 4) : null;
    const payload = Buffer.from(ws.buf.slice(off + maskLen, off + maskLen + len));
    if (mask) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    }
    ws.buf = ws.buf.slice(off + maskLen + len);
    if (opcode === 8) { leave(ws); return; }
    if (opcode === 1) handleFrame(ws, payload);
  }
}

server.on('upgrade', (req, socket) => {
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; } catch (err) { socket.destroy(); return; }
  if (path !== '/ws') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const ws = { socket, room: null, role: null, name: null, buf: Buffer.alloc(0), lastActive: Date.now() };
  socket.on('data', (d) => handleData(ws, d));
  socket.on('close', () => leave(ws));
  socket.on('error', () => {});
});

// 心跳保活：每 30s 清理 90s 无活动的僵尸连接（大厅空挂/半开连接），避免泄漏
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    for (const c of [...r.clients]) {
      if (now - (c.lastActive || now) > 90000) { try { c.socket.destroy(); } catch (err) { /* closed */ } }
    }
  }
}, 30000).unref();

function listen(port, tries = 0) {
  if (tries > 20) throw new Error('No free port found');
  server.removeAllListeners('error');
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  CS2D 路 平面反恐精英');
    console.log('  ────────────────────────────');
    console.log(`  已启动  ${url}`);
    console.log('  按 Ctrl+C 退出');
    console.log('');
  });
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('  port ' + port + ' in use, trying ' + (port + 1));
      server.close(() => listen(port + 1, tries + 1));
    } else {
      throw err;
    }
  });
}
listen(PORT);
