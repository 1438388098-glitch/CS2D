import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from './helpers/http-server.js';

function rawStatus(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port, path, method: 'GET' }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

const server = await startServer();
const port = new URL(server.baseUrl).port;
try {
  for (const encoded of ['/%5c..%5cpackage.json', '/%00', '/%2e%2e%5cpackage.json']) {
    const status = await rawStatus(port, encoded);
    assert.equal(status, 400, encoded + ' should be rejected as malformed');
  }

  for (const traversal of ['/%2e%2e/package.json', '/..%2fpackage.json', '/%2e%2e%2fpackage.json']) {
    const status = await rawStatus(port, traversal);
    assert.equal(status, 403, traversal + ' should be blocked outside root');
  }

  const ok = await rawStatus(port, '/package.json');
  assert.equal(ok, 200, 'normal file should still be served');
} finally {
  await server.stop();
}

console.log('server-paths: all PASS');
