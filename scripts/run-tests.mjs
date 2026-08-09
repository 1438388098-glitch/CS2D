import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(root, 'test');
const skipPrefixes = ['audit', 'cdp', 'cover', 'diag', 'timing'];
const skipFiles = new Set([
  'balance.mjs',
  'hell-battle.mjs',
  'map-fixture.js',
  'map-stats.mjs',
  'mapswitch-test.mjs',
  'stubdom.js',
  'verify-awp.mjs'
]);

const args = process.argv.slice(2);
const listMode = args.includes('--list');
const helpMode = args.includes('--help');
const unknown = args.filter((arg) => arg.startsWith('-') && arg !== '--list' && arg !== '--help');
const filter = args.find((arg) => !arg.startsWith('-')) || null;

if (unknown.length > 0) {
  console.error(`run-tests: unknown option(s): ${unknown.join(', ')}`);
  console.error('run-tests: use --help for usage');
  process.exit(2);
}

if (helpMode) {
  console.log('Usage: node scripts/run-tests.mjs [--list] [--help] [filter...]');
  console.log('');
  console.log('Options:');
  console.log('  --list  List discovered test files without running them');
  console.log('  --help  Show this help');
  console.log('');
  console.log('Filters are case-sensitive substrings matched against test file names.');
  process.exit(0);
}

let tests = fs.readdirSync(testDir)
  .filter((name) => /\.(?:cjs|js|mjs)$/i.test(name))
  .filter((name) => !skipPrefixes.some((prefix) => name.startsWith(prefix)))
  .filter((name) => !skipFiles.has(name))
  .sort();

if (filter) {
  tests = tests.filter((name) => name.includes(filter));
}

if (listMode) {
  for (const name of tests) {
    console.log(name);
  }
  process.exit(0);
}

if (tests.length === 0) {
  console.error('run-tests: no test files discovered');
  process.exit(1);
}

for (const name of tests) {
  const result = spawnSync(process.execPath, [path.join(testDir, name)], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    console.error(`run-tests: ${name} failed`);
    process.exit(result.status || 1);
  }
  console.log(`run-tests: PASS ${name}`);
}

console.log(`run-tests: ${tests.length} files PASS`);
