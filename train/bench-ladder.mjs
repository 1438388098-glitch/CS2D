// 地狱阶梯难度曲线基准：10 级 vs normal 基线，验证 H1→H10 单调递增
// 用法: node train/bench-ladder.mjs [--rounds=12] [--seed=7]
// 说明: T 队使用该级地狱参数（H8-H10 含 DQN 网络），CT 队 normal 基线。
//       判定：T 胜率/杀敌随级别单调上升，输出单调性检查结果。
import { installStubs } from '../test/stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');

const args = process.argv.slice(2);
function arg(name, def) {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
}
const ROUNDS_PER_LVL = parseInt(arg('rounds', '12'), 10);
const SEEDS = parseInt(arg('seeds', '3'), 10); // 每级跑几个独立 seed 取平均（压噪声）
const SEED = parseInt(arg('seed', '7'), 10);

const BASE_ROUND_DUR = ROUND.DURATION;
ROUND.DURATION = 40; // 加速

function bench(level) {
  let tWins = 0, rounds = 0, tkills = 0, ckills = 0, plants = 0;
  for (let rep = 0; rep < SEEDS; rep++) {
    const seed = SEED * 100 + level * 7 + rep * 1009;
    seedWorld(seed);
    const g = createGame({ team: 'ct', diff: 'hell', hellLevel: level, bots: 5 });
    g.seed = seed;
    g.ui = null;
    startMatch(g);
    g.player.bot = true;
    const tParams = { ...DIFF.hell.ladder[level] };
    const cParams = DIFF.normal;
    for (const e of g.entities) {
      if (e.team === 't') e.aiParams = tParams;
      if (e.team === 'ct') e.aiParams = cParams;
    }
    g.buyTime = 0.3;
    g.freezeT = 0.2;

    let prevRound = 0, prevTK = 0, prevCK = 0, prevScoreT = 0;
    let plantedThis = false;

    for (let t = 0; t < ROUNDS_PER_LVL * 6000 + 12000; t++) {
      update(g, 1 / 60);
      if (g.round !== prevRound) {
        prevRound = g.round;
        plantedThis = false;
        rounds++;
        if (rounds % ROUNDS_PER_LVL === 0 && rounds > 0) break;
      }
      if (!plantedThis && g.bomb && g.bomb.planted) { plantedThis = true; plants++; }
      let tk = 0, ck = 0;
      for (const e of g.entities) { if (e.team === 't') tk += e.kills; else ck += e.kills; }
      tkills += tk - prevTK; prevTK = tk;
      ckills += ck - prevCK; prevCK = ck;
      if (g.score.T > prevScoreT) { tWins++; prevScoreT = g.score.T; }
      if (g.state === 'END' && g.endedT > 1.2) g.endedT = 0.01;
      if (g.over) break;
    }
  }
  return { rounds, tWins, tkills, ckills, plants };
}

console.log(`[bench-ladder] 每级 ${ROUNDS_PER_LVL} 回合 × ${SEEDS} seed, T=地狱级 vs CT=normal 基线`);
console.log('等级 | T胜率   | T杀/CT杀 | 安弹/回合 | 判定');
console.log('-----|---------|----------|-----------|----');

const rows = [];
let prevRate = -1;
let monotonic = true;
for (let lv = 1; lv <= 10; lv++) {
  const r = bench(lv);
  const winRate = r.tWins / r.rounds;
  const rateStr = (winRate * 100).toFixed(0) + '%';
  const killStr = (r.tkills / r.rounds).toFixed(1) + '/' + (r.ckills / r.rounds).toFixed(1);
  const plantStr = (r.plants / r.rounds).toFixed(2);
  let verdict = '';
  if (lv === 1) verdict = '起点';
  else if (winRate < prevRate - 0.03) { verdict = '⚠ 下降'; monotonic = false; }
  else verdict = winRate > prevRate + 0.03 ? '↑ 上升' : '→ 持平';
  console.log(`H${String(lv).padStart(2)} | ${rateStr.padEnd(6)} | ${killStr.padEnd(9)} | ${plantStr.padEnd(9)} | ${verdict}`);
  rows.push({ lv, winRate });
  prevRate = winRate;
}

const gap = rows[rows.length - 1].winRate - rows[0].winRate;
console.log('-----');
console.log(`H1→H10 胜率跨度: ${(rows[0].winRate * 100).toFixed(0)}% → ${(rows[10 - 1].winRate * 100).toFixed(0)}%`);
console.log(monotonic ? '单调性: 通过（无显著下降）' : '单调性: 存在问题（有下降段）');
ROUND.DURATION = BASE_ROUND_DUR;
