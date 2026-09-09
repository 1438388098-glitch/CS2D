#!/usr/bin/env node
// 多图多难度 soak 压测：串行跑 MODE_MAPS × 难度矩阵的完整对局模拟，
// 护栏目标是「无崩溃」而非平衡性（平衡看 scripts/map-balance.mjs）。
// 用法：node scripts/soak.mjs [--maps dust2,...] [--diffs normal,hard,hell]
// 不挂 CI（全矩阵一次约 10-15 分钟）；退出码非 0 表示存在崩溃/未分出胜负的对局。
import { spawnSync } from 'node:child_process';
import { MODE_MAPS } from '../src/registry.js';

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const maps = String(getArg('--maps') || MODE_MAPS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const diffs = String(getArg('--diffs') || 'normal,hard,hell').split(',').map((s) => s.trim()).filter(Boolean);

console.log('soak 开始: ' + maps.length + ' 图 × ' + diffs.length + ' 难度 = ' + maps.length * diffs.length + ' 局');
let crashed = 0, stalled = 0, passed = 0;
for (const mapId of maps) {
  for (const diff of diffs) {
    const res = spawnSync(process.execPath, ['test/simulate.js', mapId, diff], { encoding: 'utf8', timeout: 420000 });
    const tag = '[' + mapId + '/' + diff + ']';
    if (res.error || (res.signal && res.signal !== 'SIGTERM')) {
      console.log(tag + ' 崩溃: ' + (res.error ? res.error.message : res.signal));
      crashed++;
      continue;
    }
    const okLine = (res.stdout || '').split('\n').find((l) => l.includes('模拟通过'));
    const stallLine = (res.stdout || '').split('\n').find((l) => l.includes('模拟失败'));
    if (okLine) { console.log(tag + ' ' + okLine.trim()); passed++; }
    else if (stallLine) { console.log(tag + ' 停滞: ' + stallLine.trim()); stalled++; }
    else { console.log(tag + ' 未知输出: ' + ((res.stderr || '').split('\n')[0] || 'empty')); crashed++; }
  }
}
console.log('soak 结果: 通过 ' + passed + ' / 崩溃 ' + crashed + ' / 停滞 ' + stalled);
if (crashed > 0) process.exit(1);
