import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function list(args = []) {
  const result = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--list', ...args], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

const all = list();
assert.ok(all.includes('server-methods.mjs'), 'list should include server-methods.mjs');
assert.ok(all.length > 10, 'list should include the normal test suite');

const filtered = list(['server-security']);
assert.ok(filtered.includes('server-security.mjs'), 'filtered list should include server-security.mjs');
assert.ok(!filtered.includes('server-methods.mjs'), 'filtered list should exclude unrelated tests');

console.log('run-tests-list: all PASS');
