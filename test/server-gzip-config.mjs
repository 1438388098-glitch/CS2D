import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForServer(url, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not start: ' + (lastError ? lastError.message : 'timeout'));
}

const port = await freePort();
const child = spawn(process.execPath, ['server.js'], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(port), CS2D_GZIP_THRESHOLD: '1', CS2D_GZIP_LEVEL: '9' },
  stdio: ['ignore', 'ignore', 'pipe']
});

try {
  await waitForServer(`http://localhost:${port}/`);
  const res = await fetch(`http://localhost:${port}/src/career.js`, {
    headers: { 'Accept-Encoding': 'gzip' }
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.ok(res.headers.get('content-length') > 0);
} finally {
  child.kill();
}

console.log('server-gzip-config: all PASS');
