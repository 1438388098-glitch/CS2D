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
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'ignore', 'pipe']
});

try {
  await waitForServer(`http://localhost:${port}/`);
  const js = await fetch(`http://localhost:${port}/src/config.js`, {
    headers: { 'Accept-Encoding': 'gzip' }
  });
  assert.equal(js.status, 200);
  assert.equal(js.headers.get('content-encoding'), 'gzip');
  assert.equal(js.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(js.headers.get('vary'), 'Accept-Encoding');
  assert.equal(js.headers.get('x-content-type-options'), 'nosniff');

  const html = await fetch(`http://localhost:${port}/`, {
    headers: { 'Accept-Encoding': 'gzip' }
  });
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('cache-control'), 'no-cache');
} finally {
  child.kill();
}

console.log('server-http: all PASS');
