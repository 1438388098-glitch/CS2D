import assert from 'node:assert/strict';
import { startServer } from './helpers/http-server.js';

const server = await startServer();
try {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await fetch(server.baseUrl + '/', { method });
    assert.equal(res.status, 405, method + ' should be rejected');
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  }

  const get = await fetch(server.baseUrl + '/');
  assert.equal(get.status, 200, 'GET should still succeed');
  const head = await fetch(server.baseUrl + '/', { method: 'HEAD' });
  assert.equal(head.status, 200, 'HEAD should still succeed');
} finally {
  await server.stop();
}

console.log('server-methods: all PASS');
