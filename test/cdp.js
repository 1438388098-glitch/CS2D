import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import net from 'net';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export function launchBrowser(opts = {}) {
  const env = typeof process !== 'undefined' ? process.env : {};
  const envExe = env.CDP_BROWSER;
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ];
  const exe = envExe && require('fs').existsSync(envExe) ? envExe : candidates.find((p) => require('fs').existsSync(p));
  if (!exe) throw new Error('no edge/chrome found (set CDP_BROWSER)');
  const port = opts.port || Number(env.CDP_PORT) || 9223;
  const profile = opts.profile || env.CDP_PROFILE || 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile';
  const extraFlags = opts.flags || [];
  const proc = spawn(exe, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1600,900',
    `--user-data-dir=${profile}`,
    ...extraFlags,
    'about:blank'
  ], { stdio: 'ignore', detached: true });
  return { proc, port };
}

export async function waitForDebug(port, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const res = await httpGet(`http://127.0.0.1:${port}/json/version`);
      if (res && res.webSocketDebuggerUrl) return res.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('debugger not ready');
}

export async function newTab(port, url) {
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    try {
      const res = await httpReq('PUT', `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`);
      if (res && res.webSocketDebuggerUrl) return res.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('tab not created');
}

function httpGet(url) {
  return httpReq('GET', url);
}

function httpReq(method, url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.sock = null; }
  async connect() {
    const u = new URL(this.wsUrl);
    this.sock = net.connect(u.port, u.hostname);
    this.sock.on('data', (buf) => this._onData(buf));
    await new Promise((res, rej) => {
      this.sock.on('connect', res);
      this.sock.on('error', rej);
    });
    const key = crypto.randomBytes(16).toString('base64');
    this.sock.write(
      `GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    await this._waitUpgrade(key);
    this.sock.on('error', () => {});
  }
  _waitUpgrade(key) {
    return new Promise((resolve, reject) => {
      let acc = Buffer.alloc(0);
      const timer = setTimeout(() => { cleanup(); reject(new Error('upgrade timeout')); }, 8000);
      const cleanup = () => {
        clearTimeout(timer);
        this.sock.removeListener('data', onData);
      };
      const onData = (buf) => {
        acc = Buffer.concat([acc, buf]);
        const head = acc.toString('latin1');
        const m = head.match(/Sec-WebSocket-Accept: (.+)\r\n/);
        if (m) {
          const expect = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
          if (m[1].trim() !== expect) { cleanup(); reject(new Error('bad accept')); return; }
          const restIdx = head.indexOf('\r\n\r\n');
          cleanup();
          this._handshakeRest = restIdx >= 0 ? acc.slice(restIdx + 4) : Buffer.alloc(0);
          this._processRest();
          resolve();
        }
      };
      this.sock.on('data', onData);
    });
  }
  _processRest() {
    if (this._handshakeRest && this._handshakeRest.length) {
      const buf = this._handshakeRest;
      this._handshakeRest = null;
      this._onData(buf);
    }
  }
  _onData(buf) {
    let i = 0;
    while (i + 2 <= buf.length) {
      const b0 = buf[i], b1 = buf[i + 1];
      const opcode = b0 & 0x0f;
      const fin = (b0 & 0x80) !== 0;
      const len = b1 & 0x7f;
      let off = i + 2;
      if (len === 126) { off += 2; }
      else if (len === 127) { off += 8; }
      const masked = (b1 & 0x80) !== 0;
      if (masked) off += 4;
      if (off > buf.length) break;
      let dataLen = len;
      if (len === 126) dataLen = buf.readUInt16BE(i + 2);
      else if (len === 127) dataLen = Number(buf.readBigUInt64BE(i + 2));
      const end = off + dataLen;
      if (end > buf.length) break;
      let payload = buf.subarray(off, end);
      if (masked) {
        const mask = buf.subarray(off - 4, off);
        const out = Buffer.from(payload);
        for (let k = 0; k < out.length; k++) out[k] ^= mask[k % 4];
        payload = out;
      }
      if (opcode === 1 || opcode === 0) {
        if (opcode === 1) this._frag = Buffer.alloc(0);
        if (!this._frag) this._frag = Buffer.alloc(0);
        this._frag = Buffer.concat([this._frag, payload]);
        if (fin && this._frag.length) {
          const msg = JSON.parse(this._frag.toString('utf8'));
          this._frag = null;
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        }
      }
      i = end;
    }
  }
  _frame(payload) {
    const len = Buffer.byteLength(payload);
    let head = Buffer.from([0x81]);
    if (len < 126) head = Buffer.concat([head, Buffer.from([0x80 | len])]);
    else if (len < 65536) {
      const b = Buffer.alloc(2); b.writeUInt16BE(len);
      head = Buffer.concat([head, Buffer.from([0x80 | 126]), b]);
    } else {
      const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len));
      head = Buffer.concat([head, Buffer.from([0x80 | 127]), b]);
    }
    const mask = crypto.randomBytes(4);
    const body = Buffer.from(payload);
    for (let k = 0; k < body.length; k++) body[k] ^= mask[k % 4];
    this.sock.write(Buffer.concat([head, mask, body]));
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('cdp send timeout: ' + method));
      }, 15000);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      this._frame(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || JSON.stringify(r.exceptionDetails)));
    return r.result && r.result.value;
  }
  async navigate(url) {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Page.navigate', { url });
    await sleep(1200);
  }
  close() { try { this.sock && this.sock.destroy(); } catch {} }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
