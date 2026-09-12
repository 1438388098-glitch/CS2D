#!/usr/bin/env node
// 对局数据汇总：node scripts/match-stats.mjs [--file logs/matches.jsonl] [--last 200]
// 读取 server.js 落盘的 LAN 对局上报，输出按图/模式的场次、时长与分差概览，
// 作为 bot 采样（npm run balance）之外的真实数据参照。
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const file = String(getArg('--file') || path.join('logs', 'matches.jsonl'));
const last = Math.max(1, Math.min(10000, Number(getArg('--last')) || 200));

if (!fs.existsSync(file)) {
  console.log('暂无对局数据：' + file + '（LAN 房主打完一场会自动上报）');
  process.exit(0);
}

const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
const records = [];
for (const line of rows) {
  try { records.push(JSON.parse(line)); } catch (err) { /* 跳过坏行 */ }
}
const recent = records.slice(-last);

if (!recent.length) {
  console.log('文件存在但无有效记录：' + file);
  process.exit(0);
}

const byKey = new Map();
for (const r of recent) {
  const key = (r.map || '?') + ' · ' + (r.mode || '?');
  let b = byKey.get(key);
  if (!b) { b = { games: 0, tWins: 0, ctWins: 0, rounds: 0, duration: 0 }; byKey.set(key, b); }
  b.games++;
  if (r.score && Number.isFinite(r.score.T) && Number.isFinite(r.score.CT)) b.rounds += r.score.T + r.score.CT;
  if (r.winner === 't') b.tWins++;
  else if (r.winner === 'ct') b.ctWins++;
  if (Number.isFinite(r.duration)) b.duration += r.duration;
}

console.log('对局数据（最近 ' + recent.length + ' / 共 ' + records.length + ' 场，来自 ' + file + '）');
console.log('地图 · 模式            场次   T胜  CT胜  总回合  场均时长');
for (const [key, b] of [...byKey.entries()].sort((a, c) => c[1].games - a[1].games)) {
  const decided = b.tWins + b.ctWins;
  const tPct = decided ? Math.round(b.tWins / decided * 100) + '%' : '-';
  const avgDur = b.games ? Math.round(b.duration / b.games) + 's' : '-';
  console.log(key.padEnd(18) + String(b.games).padStart(5) + String(b.tWins).padStart(6) + String(b.ctWins).padStart(6) + String(b.rounds).padStart(7) + '  ' + avgDur.padStart(6) + '  T占比 ' + tPct);
}
const decided = recent.filter((r) => r.winner === 't' || r.winner === 'ct').length;
if (decided >= 10) {
  const tWins = recent.filter((r) => r.winner === 't').length;
  console.log('整体 T 胜率（样本 ' + decided + '）：' + Math.round(tWins / decided * 100) + '%（bot 采样合理区间为 30%-70%，真实数据仅作参照）');
}
