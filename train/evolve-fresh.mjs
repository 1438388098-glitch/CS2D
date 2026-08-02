// H11 从零进化策略（GA）：
//   - 随机初始化种群（无 S1 冠军种子、无蒸馏、无任何前级基因）——真正的"从零开始"
//   - 精英保留（ELITE=2）→ best fitness 单调不减（曲线可证明"越练越强"）
//   - 每 5 代 quickBench（vs normal 基线）输出胜率成长曲线
//   - 与 H4-H7 的区别：H4-H7 用冠军蒸馏起点，H11 纯随机起点
// 用法: node train/evolve-fresh.mjs --gens=24
import { installStubs } from '../test/stubdom.js';
installStubs();
const { randomGenome, crossover, mutate, decodeGenome } = await import('../src/ai-genome.js');
const { runEval, EVAL_ROUNDS } = await import('./fitness.js');
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');
const { createRequire } = await import('module');
const fs = await import('fs');
const path = await import('path');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
function arg(name, def) {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
}
const GENS = parseInt(arg('gens', '24'), 10);
const MAP = arg('map', 'dust2');
const POP = parseInt(arg('pop', '16'), 10);
const KEEP = 4, ELITE = 2, MUT_RATE = 0.15;
// 评估 seed 分散化（核心修复）：个体间差 104729、代间差 7919 → 每个体打完全不同的局面，
// fitness 反映真实泛化能力，避免过拟合固定 seed（之前 seed=i 导致 16 个体打几乎相同局面）
const SEED_GAP = 104729, GEN_GAP = 7919;

console.log(`[evolve-fresh] H11 从零进化 gens=${GENS} pop=${POP} map=${MAP}（随机起点，无任何前级基因）`);

// quickBench：vs normal 基线（3 seed × 8 回合），成长曲线 + 最终部署验证
function quickBench(genome, ep) {
  const params = decodeGenome(genome);
  let tWins = 0, rounds = 0, plants = 0;
  for (let rep = 0; rep < 3; rep++) {
    seedWorld(ep * 31337 + rep * 1009);
    const g = createGame({ team: 'ct', diff: 'normal', bots: 5 });
    g.ui = null;
    startMatch(g);
    g.player.bot = true;
    for (const e of g.entities) { if (e.bot && e.team === 't') e.aiParams = params; if (e.bot && e.team === 'ct') e.aiParams = DIFF.normal; }
    g.buyTime = 0.3; g.freezeT = 0.2;
    let tW = 0, r = 0, pl = 0, prevR = 0, prevS = 0, planted = false;
    for (let t = 0; t < 8 * 6000 + 12000; t++) {
      update(g, 1 / 60);
      if (g.round !== prevR) { prevR = g.round; planted = false; r++; if (r >= 8) break; }
      if (!planted && g.bomb && g.bomb.planted) { planted = true; pl++; }
      if (g.score.T > prevS) { tW++; prevS = g.score.T; }
      if (g.state === 'END' && g.endedT > 1.2) g.endedT = 0.01;
      if (g.over) break;
    }
    tWins += tW; rounds += r; plants += pl;
  }
  return { rate: tWins / rounds, plants: plants / rounds };
}

// 从零进化主循环（精英保留 → fitness 单调）
let pop = Array.from({ length: POP }, randomGenome);
let best = null;
const t0 = Date.now();
for (let gen = 0; gen < GENS; gen++) {
  const results = [];
  for (let i = 0; i < pop.length; i++) {
    const seed = ((gen + 1) * GEN_GAP + i * SEED_GAP) % 2147483647;
    const r = runEval(pop[i], MAP, 8, seed, null); // 8 回合/个体（更多局面）
    results.push({ g: pop[i], f: r.fitness, r });
  }
  results.sort((a, b) => b.f - a.f);
  const avg = results.reduce((s, x) => s + x.f, 0) / results.length;
  const improved = !best || results[0].f > best.f;
  if (improved) {
    best = results[0];
    // best 快照（单调存档：只有更好才覆盖）
    const out = path.join(path.dirname(require.resolve('../package.json')), 'train', 'checkpoints');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'fresh_genome_best.json'), JSON.stringify({ gen: gen + 1, fitness: best.f, genome: Array.from(best.g), t: Date.now() }));
  }
  const line = `GEN ${gen + 1}  best=${best.f.toFixed(1)}${improved ? ' ★' : ''}  avg=${avg.toFixed(1)}  (wins=${best.r.tScore}/${best.r.roundsDone} plants=${best.r.plants} tkills=${best.r.tkills})`;
  console.log(line);
  // 每 5 代实力曲线（vs normal 基线）
  if ((gen + 1) % 5 === 0 || gen === GENS - 1) {
    const b = quickBench(best.g, gen + 1);
    console.log(`  → 实力评估(vs normal): ${(b.rate * 100).toFixed(0)}% 胜率 安弹${b.plants.toFixed(2)}/回合`);
  }
  // 下一代：精英保留 + 锦标赛交叉变异
  const next = [];
  for (let i = 0; i < ELITE; i++) next.push(results[i].g.map((v) => v));
  const nKeep = Math.min(KEEP, results.length);
  while (next.length < POP) {
    const a = results[Math.floor(Math.random() * nKeep)].g;
    const b = results[Math.floor(Math.random() * nKeep)].g;
    next.push(mutate(crossover(a, b), MUT_RATE));
  }
  pop = next;
}

console.log(`[evolve-fresh] done in ${((Date.now() - t0) / 1000).toFixed(0)}s. best fitness=${best.f.toFixed(1)} (单调存档 fresh_genome_best.json)`);
const final = quickBench(best.g, 9999);
console.log(`[evolve-fresh] 最终实力(vs normal 基线): ${(final.rate * 100).toFixed(0)}% 胜率 安弹${final.plants.toFixed(2)}/回合`);
console.log(`[evolve-fresh] H11 genome=${JSON.stringify(best.g)}`);
