import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const help = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--help'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /Usage:/);
assert.match(help.stdout, /--list/);

const bad = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--bogus'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(bad.status, 2, bad.stderr);
assert.match(bad.stderr, /unknown option/);

console.log('run-tests-help: all PASS');
