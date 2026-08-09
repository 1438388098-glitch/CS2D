import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort() {
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

export async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const baseUrl = `http://localhost:${port}`;
  await waitForServer(baseUrl + '/');
  return {
    baseUrl,
    async stop() {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
  };
}
