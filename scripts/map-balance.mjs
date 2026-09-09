#!/usr/bin/env node
// 地图平衡自动采样工具（node scripts/map-balance.mjs [--maps dust2,metro] [--runs 3] [--diff normal]）
// 对竞技图池逐图运行 test/simulate.js（5v5 bot 公平对局，ctx.rand 缺省 Math.random → 各次运行独立采样），
// 汇总 T/CT 胜率与安弹率：T 胜率长期偏离 30%-70% 视为攻守失衡信号（退出码 1，可直接挂 CI/定时任务）。
import { spawnSync } from 'node:child_process';
import { MODE_MAPS } from '../src/registry.js';

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const maps = String(getArg('--maps') || MODE_MAPS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const runs = Math.max(1, Math.min(20, Number(getArg('--runs')) || 1));
const diff = String(getArg('--diff') || 'normal');

console.log('地图平衡采样 [' + diff + ']: ' + maps.join(', ') + ' × 每图 ' + runs + ' 局');
let flagged = 0;
for (const mapId of maps) {
  let tTotal = 0, cTotal = 0, rounds = 0, plant = 0, ok = 0;
  for (let r = 0; r < runs; r++) {
    const res = spawnSync(process.execPath, ['test/simulate.js', mapId, diff], { encoding: 'utf8', timeout: 300000 });
    const line = (res.stdout || '').split('\n').find((l) => l.startsWith('模拟完成'));
    if (!line) {
      console.log('  [' + mapId + '] 第' + (r + 1) + ' 局失败: ' + ((res.stderr || '').split('\n')[0] || 'no output'));
      continue;
    }
    const m = line.match(/(\d+) 回合 (\d+):(\d+) T胜率 (\d+)% 安弹回合 (\d+)/);
    if (!m) continue;
    ok++;
    rounds += Number(m[1]);
    tTotal += Number(m[2]);
    cTotal += Number(m[3]);
    plant += Number(m[5]);
  }
  if (!ok || !rounds) {
    console.log('[' + mapId + '] 无有效对局，跳过');
    flagged++;
    continue;
  }
  const rate = Math.round(tTotal / rounds * 100);
  const plantRate = Math.round(plant / rounds * 100);
  const off = rate < 30 || rate > 70;
  if (off) flagged++;
  console.log('[' + mapId + '] ' + rounds + ' 回合  T ' + tTotal + ' : CT ' + cTotal + '  T胜率 ' + rate + '%' + (off ? '  <-- 失衡(合理区间 30%-70%)' : '') + '  安弹率 ' + plantRate + '%');
}
if (flagged > 0) {
  console.log('平衡报告: ' + flagged + ' 项需要关注');
  process.exit(1);
}
console.log('平衡报告: 竞技图池全部处于均衡区间（T 胜率 30%-70%）');
