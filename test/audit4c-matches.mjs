// 审计 4c：H10 vs H11 quick match 强度对比（修复 seed 被 startMatch 吞掉的缺陷）
// startMatch 用 Math.random 重掷 seed（game.js:95）→ 本测试临时把 Math.random 钉为确定性值
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');

const BASE = ROUND.DURATION;
ROUND.DURATION = 40;

function runMatch(hellLevel, useAiParams, seed, roundsLimit = 10) {
  const realMath = Math.random;
  Math.random = () => ((seed % 100000) / 100000); // 钉死 seed 抽签
  const g = createGame({ team: 'ct', diff: 'hell', hellLevel, bots: 5, mapId: 'dust2' });
  g.seed = seed;
  g.ui = null;
  startMatch(g);
  Math.random = realMath;
  const usedSeed = g.seed;
  g.player.bot = true;
  const params = { ...DIFF.hell.ladder[hellLevel] };
  if (useAiParams) {
    for (const e of g.entities) if (e.bot) e.aiParams = params;
  }
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  let tWins = 0, rounds = 0, tkills = 0, ckills = 0, plants = 0;
  let prevTK = 0, prevCK = 0, prevT = 0;
  let planted = false;
  let prevRound = g.round;
  for (let t = 0; t < 400000; t++) {
    update(g, 1 / 60);
    if (g.round !== prevRound) { prevRound = g.round; rounds++; planted = false; if (rounds >= roundsLimit) break; }
    if (g.bomb && g.bomb.planted && !planted) { plants++; planted = true; }
    const tk2 = g.entities.filter((e) => e.team === 't').reduce((s, e) => s + e.kills, 0);
    const ck2 = g.entities.filter((e) => e.team === 'ct').reduce((s, e) => s + e.kills, 0);
    tkills += (tk2 || 0) - prevTK; prevTK = tk2 || 0;
    ckills += (ck2 || 0) - prevCK; prevCK = ck2 || 0;
    if (g.score.T > prevT) { tWins++; prevT = g.score.T; }
    if (g.over) break;
  }
  return { tWins, rounds: Math.max(1, rounds), tkills, ckills, plants, usedSeed };
}

// 确定性复核（钉死 Math.random）
{
  const r1 = runMatch(10, false, 4242, 4);
  const r2 = runMatch(10, false, 4242, 4);
  const s1 = JSON.stringify([r1.tWins, r1.tkills, r1.ckills, r1.plants]);
  const s2 = JSON.stringify([r2.tWins, r2.tkills, r2.ckills, r2.plants]);
  console.log(`确定性复核(seed=4242 钉死): run1=${s1} run2=${s2} → ${s1 === s2 ? '✓ 逐项一致' : '✗ 仍不一致'}`);
}

console.log('\n=== quick match（aiParams=null，玩家实际体验）H10 vs H11 强度 ===');
console.log('配置             | 胜率(各seed T胜/局)  | 合计T胜率 | T杀/CT杀 | 安弹/局');
const cfgs = [
  ['H10 quick', 10, false],
  ['H11 quick', 11, false],
  ['H10 +aiParams', 10, true],
  ['H11 +aiParams', 11, true],
];
const SEEDS = [1, 2, 3, 4, 5, 6];
for (const [name, lv, ap] of cfgs) {
  const res = SEEDS.map((s) => runMatch(lv, ap, s, 10));
  const wins = res.reduce((a, r) => a + r.tWins, 0);
  const rnds = res.reduce((a, r) => a + r.rounds, 0);
  const tk = res.reduce((a, r) => a + r.tkills, 0);
  const ck = res.reduce((a, r) => a + r.ckills, 0);
  const pl = res.reduce((a, r) => a + r.plants, 0);
  console.log(`${name.padEnd(14)} | ${res.map((r) => r.tWins + '/' + r.rounds).join(' ')} | ${(wins / rnds * 100).toFixed(0)}% | ${tk}/${ck} | ${(pl / rnds).toFixed(2)}`);
}
ROUND.DURATION = BASE;
process.exit(0);
