import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const list = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--list', 'server', 'security'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(list.status, 0, list.stderr);
const names = list.stdout.split(/\r?\n/).filter(Boolean);
assert.deepEqual(names, ['server-security.mjs'], 'multiple filters should combine with AND');

const run = spawnSync(process.execPath, ['scripts/run-tests.mjs', 'server', 'mime'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(run.status, 0, run.stderr);
assert.match(run.stdout, /server-mime: all PASS/);

console.log('run-tests-multi: all PASS');
