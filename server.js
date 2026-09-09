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
function envInt(name, fallback) {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? n : fallback;
}
const GZIP_THRESHOLD = Math.max(0, envInt('CS2D_GZIP_THRESHOLD', 1024));
const GZIP_LEVEL = Math.max(1, Math.min(9, envInt('CS2D_GZIP_LEVEL', 6)));

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
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-XSS-Protection': '1; mode=block',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};

const BLOCKED_PREFIXES = ['/.git', '/.autopilot', '/.superpowers', '/.worktrees', '/.github', '/node_modules'];
// 静态服务只允许下发已知扩展名；.bak/.log/.gitignore 等无扩展名或备份/日志一律 404，避免仓库内部文件暴露
const ALLOWED_EXT = new Set(Object.keys(MIME));

const COMPRESSIBLE_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);
const NO_CACHE_EXT = new Set(['.html', '.js', '.mjs', '.css']);

function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return NO_CACHE_EXT.has(ext) ? 'no-cache' : 'public, max-age=3600';
}

function compressIfPossible(data, req, filePath, cb) {
  const ext = path.extname(filePath).toLowerCase();
  if (!COMPRESSIBLE_EXT.has(ext) || data.length < GZIP_THRESHOLD) return cb(null);
  const acceptEncoding = String(req.headers['accept-encoding'] || '').toLowerCase();
  if (!acceptEncoding.includes('gzip')) return cb(null);
  // 异步 gzip：压缩大文件不阻塞 WS 中继事件循环
  zlib.gzip(data, { level: GZIP_LEVEL }, (err, out) => {
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
  // 扩展名白名单：非服务文件（备份/日志/无扩展名）一律不下发
  if (!ALLOWED_EXT.has(path.extname(filePath).toLowerCase())) {
    sendStatus(res, 404, 'Not Found');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendStatus(res, 404, 'Not Found');
      return;
    }
    const etag = '"' + crypto.createHash('sha256').update(data).digest('hex').slice(0, 24) + '"';
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

// 可热重载配置：server.config.json（可选，缺省用内置默认）。fs.watchFile 轮询跨平台，
// 变更对新连接/新帧即时生效，无需重启服务器。
const HOT_CFG_PATH = path.join(ROOT, 'server.config.json');
const hotCfg = { rateLimit: 200, maxRooms: 50 };
let hotCfgMtime = null;
function refreshHotCfg() {
  try {
    if (!fs.existsSync(HOT_CFG_PATH)) return;
    const st = fs.statSync(HOT_CFG_PATH);
    if (hotCfgMtime === st.mtimeMs) return;
    hotCfgMtime = st.mtimeMs;
    const j = JSON.parse(fs.readFileSync(HOT_CFG_PATH, 'utf8'));
    hotCfg.rateLimit = Math.max(30, Math.min(2000, Number(j.rateLimit) || 200));
    hotCfg.maxRooms = Math.max(1, Math.min(500, Number(j.maxRooms) || 50));
    console.log('  [config] server.config.json 已热重载: rateLimit=' + hotCfg.rateLimit + ' maxRooms=' + hotCfg.maxRooms);
  } catch (err) { /* 配置缺失/损坏时沿用旧值 */ }
}
refreshHotCfg();
fs.watchFile(HOT_CFG_PATH, { interval: 3000 }, refreshHotCfg);

// 每连接限频：正常快照 ~30Hz + 事件，远低于 rateLimit；超限判定为异常/攻击，直接断开
function throttle(ws) {
  const now = Date.now();
  if (!ws._rateWindow || now - ws._rateWindow >= 1000) {
    ws._rateWindow = now;
    ws._rateCount = 0;
  }
  if (++ws._rateCount > hotCfg.rateLimit) {
    try { ws.socket.destroy(); } catch (err) { /* closed */ }
    return false;
  }
  return true;
}

function handleFrame(ws, payload) {
  let msg;
  try { msg = JSON.parse(payload.toString('utf8')); } catch (err) { return; }
  if (!msg || !msg.type) return;
  if (!throttle(ws)) return;
  // 等待期保活心跳：仅刷新 lastActive，不回包、不广播
  if (msg.type === 'ping') return;
  if (msg.type === 'hello') {
    // 房间码实际 6 位：截断 32 字符并剥离控制字符，防畸形超长房名；host 已存在时拒绝第二个 host，防抢房导致中继错乱
    const room = String(msg.room || '').trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 32);
    if (!room) return;
    ws.room = room;
    ws.role = msg.role === 'host' ? 'host' : 'guest';
    ws.name = String(msg.name || 'LAN Player').slice(0, 16);
    let r = rooms.get(room);
    if (!r) {
      // 房间数上限（可热重载）：满员时新房间拒绝建房，已有房间不受影响
      if (rooms.size >= hotCfg.maxRooms) {
        sendFrame(ws, { type: 'error', reason: 'room-limit' });
        ws.room = null;
        ws.role = null;
        return;
      }
      r = { clients: new Set(), host: null }; rooms.set(room, r);
    }
    if (ws.role === 'host' && r.host && r.host !== ws) {
      sendFrame(ws, { type: 'error', reason: 'host-exists' });
      ws.room = null;
      ws.role = null;
      return;
    }
    r.clients.add(ws);
    if (ws.role === 'host') r.host = ws;
    sendFrame(ws, { type: 'welcome', role: ws.role, room, count: r.clients.size });
    broadcast(room, { type: 'peer', count: r.clients.size, clients: [...r.clients].map((c) => ({ role: c.role, name: c.name })) }, ws);
    return;
  }
  if (!ws.room) return;
  if (msg.type === 'relay' || msg.type === 'input' || msg.type === 'start' || msg.type === 'hit') {
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
      broadcast(ws.room, { type: 'hostLeft', count: 0, clients: [] }, ws);
    }
    if (wasHost && r.clients.size > 0) {
      for (const c of [...r.clients]) { c.room = null; try { c.socket.end(); } catch (err) { /* closed */ } }
      r.clients.clear();
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
    // 掩码异或本就原地改：用 subarray 视图替代 Buffer.from 拷贝（payload 仅在本同步处理器内使用）
    const payload = ws.buf.subarray(off + maskLen, off + maskLen + len);
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
  // Origin 校验：浏览器必发 Origin，非同源且不在白名单则拒绝，防跨站发起 WS 连接
  const origin = req.headers['origin'];
  if (origin) {
    const host = req.headers['host'] || '';
    const sameOrigin = origin === 'http://' + host || origin === 'https://' + host;
    const allowed = (process.env.CS2D_ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!sameOrigin && !allowed.includes(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
  }
  // RFC 6455 §4.2.2 握手验收值：必须用 SHA-1(key + 固定GUID) 计算，与浏览器各算一遍比对才允许升级协议。
  // 这是协议互操作校验值，不是完整性/加密保护，存在碰撞也不影响安全模型，换其他算法将无法通过任何标准客户端握手。
  const websocketAccept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + websocketAccept + '\r\n\r\n');
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
      // host 还在等队友（房内 <2 人）时不清理，避免长时间空等被误拆房
      if (r.host === c && r.clients.size < 2) continue;
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
