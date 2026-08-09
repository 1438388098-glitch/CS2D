import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['server.js', 'src', 'test', 'train', 'scripts'];
const extensions = new Set(['.js', '.mjs']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
}

for (const item of roots) {
  const full = path.join(root, item);
  if (fs.statSync(full).isDirectory()) {
    walk(full);
  } else if (fs.statSync(full).isFile() && extensions.has(path.extname(item).toLowerCase())) {
    files.push(full);
  }
}

files.sort();

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    failed++;
    console.error(`check-syntax: ${path.relative(root, file)} failed`);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

if (failed > 0) {
  console.error(`check-syntax: ${failed} file(s) failed`);
  process.exit(1);
}

console.log(`check-syntax: ${files.length} files PASS`);
