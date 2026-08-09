import assert from 'node:assert/strict';
import { startServer } from './helpers/http-server.js';

const cases = {
  'test/fixtures/sample.txt': 'text/plain; charset=utf-8',
  'test/fixtures/sample.wasm': 'application/wasm',
  'test/fixtures/sample.webp': 'image/webp',
  'test/fixtures/sample.webm': 'video/webm',
  'test/fixtures/sample.mp4': 'video/mp4',
  'test/fixtures/sample.woff2': 'font/woff2'
};

const server = await startServer();
try {
  for (const [urlPath, expected] of Object.entries(cases)) {
    const res = await fetch(server.baseUrl + '/' + urlPath);
    assert.equal(res.status, 200, urlPath + ' should be served');
    assert.equal(res.headers.get('content-type'), expected, urlPath + ' content type');
  }
} finally {
  await server.stop();
}

console.log('server-mime: all PASS');
