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
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res) return;
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('server did not start');
}

const port = await freePort();
const child = spawn(process.execPath, ['server.js'], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'ignore', 'pipe']
});

try {
  await waitForServer(`http://localhost:${port}/`);

  for (const sensitive of ['/.autopilot/config.json', '/.git/config', '/node_modules/example.js']) {
    const res = await fetch(`http://localhost:${port}${sensitive}`);
    assert.equal(res.status, 403, sensitive + ' should be forbidden');
  }

  const missing = await fetch(`http://localhost:${port}/does-not-exist.js`);
  assert.equal(missing.status, 404, 'unknown static file should return 404');
  assert.equal(await missing.text(), 'Not Found', '404 should return plain body');

  const head = await fetch(`http://localhost:${port}/src/config.js`, { method: 'HEAD' });
  assert.equal(head.status, 200, 'HEAD should succeed for existing static file');
  assert.ok(Number(head.headers.get('content-length')) > 0, 'HEAD should expose content length');
} finally {
  child.kill();
}

console.log('server-security: all PASS');
