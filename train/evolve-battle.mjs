// H11 军备竞赛训练：对手 = H1-H10 随机挡位，目标全挡位胜率 ≥80%
//   - 起点 = 当前 H11 冠军（fresh_genome_best）+ 变异种群（延续进化，非从零）
//   - 每代：个体按挡位轮转评估（第 i 个体 vs OPP[i%10]），每代覆盖全 10 挡
//   - 每 5 代验收：best vs 每挡 16 局（2 seed × 8 回合），全挡 ≥80% → 完成
// 用法: node train/evolve-battle.mjs --gens=200 --check=0.8
import { installStubs } from '../test/stubdom.js';
installStubs();
const { randomGenome, crossover, mutate, decodeGenome } = await import('../src/ai-genome.js');
const { runEval } = await import('./fitness.js');
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
const GENS = parseInt(arg('gens', '60'), 10);
const MAP = arg('map', 'dust2');
const POP = parseInt(arg('pop', '8'), 10);
const CHECK_RATE = parseFloat(arg('check', '0.8'));
const SEED = parseInt(arg('seed', '1'), 10); // 多进程并行种子偏移
const KEEP = 3, ELITE = 2, MUT_RATE = 0.12;
const EVAL_ROUNDS_PER_OPP = parseInt(arg('er', '3'), 10); // 每挡评估回合数（全挡评估，越大越准）
const SEED_GAP = 104729, GEN_GAP = 7919;
const OPP = DIFF.hell.ladder; // H1-H10（H11 对手池，不含 H11 自身）
// H11 训练形态：决策网络（H10 权重 5 图）+ 对手建模，基因 19 维参数增强
const H11_NET = DIFF.hell.ladder[11].netWeights;
const H11_EXTRAS = { oppModel: true, intel: true, netWeights: H11_NET };

console.log(`[evolve-battle] H11 军备竞赛 v3 gens=${GENS} pop=${POP} seed=${SEED}（全挡评估 ${EVAL_ROUNDS_PER_OPP} 回合/挡）`);

// 全挡 fitness：每个体打全 10 挡（seed 分散），fitness = 全挡平均胜率（直接优化验收目标）
function evalAll(genome, gen, i) {
  let wrAcc = 0;
  for (let lv = 1; lv <= 10; lv++) {
    const seed = ((gen + 1) * GEN_GAP + i * SEED_GAP + lv * 4099 + SEED * 33331) % 2147483647;
    const r = runEval(genome, MAP, EVAL_ROUNDS_PER_OPP, seed, null, OPP[lv], H11_EXTRAS);
    const rounds = r.roundsDone || EVAL_ROUNDS_PER_OPP;
    wrAcc += r.tScore / rounds; // T 队胜率
  }
  return { f: wrAcc / 10 };
}

// 起点：当前 H11 冠军（13 维）→ pad 到 19 维（新维度随机初始化）+ 变异
const ckPath = path.join(path.dirname(require.resolve('../package.json')), 'train', 'checkpoints', 'fresh_genome_best.json');
let pop;
if (fs.existsSync(ckPath)) {
  const ck = JSON.parse(fs.readFileSync(ckPath, 'utf8'));
  const base = Array.from(ck.genome);
  // 新 6 维中性 pad（解码值 = 无害默认：peekSkill/counterStrafe=1.0, prefire/trade=0, eco=1.0, spreadCtrl=0.5→1.0）
  while (base.length < 19) base.push([1.0, 1.0, 0, 0.75, 0, 0.5][base.length - 13]);
  pop = [base];
  while (pop.length < POP) pop.push(mutate(base, 0.2));
  console.log(`[evolve-battle] 起点 = H11 冠军 (fitness ${ck.fitness}) + 19 维扩展 + ${POP - 1} 变异`);
} else {
  pop = Array.from({ length: POP }, randomGenome);
  console.log('[evolve-battle] 无存档，随机起点');
}

// 全挡验收：best vs 每挡 4 seed × 8 回合（320 回合总，噪声 ±12%）
function acceptance(genome, ep) {
  const params = decodeGenome(genome);
  const result = {};
  let allPass = true;
  for (let lv = 1; lv <= 10; lv++) {
    let tWins = 0, rounds = 0;
    for (let rep = 0; rep < 4; rep++) {
      const seed = (ep * 31337 + lv * 1009 + rep * 77777 + SEED * 55555) % 2147483647;
      seedWorld(seed);
      const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: MAP });
      g.ui = null;
      startMatch(g);
      g.player.bot = true;
      for (const e of g.entities) {
        if (e.bot && e.team === 't') e.aiParams = { ...params, ...H11_EXTRAS };
        if (e.bot && e.team === 'ct') e.aiParams = OPP[lv];
      }
      g.buyTime = 0.3; g.freezeT = 0.2;
      let tW = 0, r = 0, prevR = 0, prevS = 0;
      for (let t = 0; t < 8 * 6000 + 12000; t++) {
        update(g, 1 / 60);
        if (g.round !== prevR) { prevR = g.round; r++; if (r >= 8) break; }
        if (g.score.T > prevS) { tW++; prevS = g.score.T; }
        if (g.state === 'END' && g.endedT > 1.2) g.endedT = 0.01;
        if (g.over) break;
      }
      tWins += tW; rounds += r;
    }
    const rate = tWins / rounds;
    result[lv] = rate;
    if (rate < CHECK_RATE) allPass = false;
  }
  return { result, allPass };
}

let best = null;
let passRates = null;
const t0 = Date.now();
for (let gen = 0; gen < GENS; gen++) {
  const results = [];
  for (let i = 0; i < pop.length; i++) {
    const ev = evalAll(pop[i], gen, i);
    results.push({ g: pop[i], f: ev.f });
  }
  results.sort((a, b) => b.f - a.f);
  const avg = results.reduce((s, x) => s + x.f, 0) / results.length;
  const improved = !best || results[0].f > best.f;
  if (improved) {
    best = results[0];
    fs.writeFileSync(ckPath, JSON.stringify({ gen: gen + 1, fitness: best.f, genome: Array.from(best.g), t: Date.now() }));
  }
  console.log(`GEN ${gen + 1}  best=${best.f.toFixed(1)}${improved ? ' ★' : ''}  avg=${avg.toFixed(1)}  (每代 ${(Date.now() - t0) / 1000}s)`);

  // 每 5 代验收：全挡位 ≥80%（gen 末代也验收一次）
  if ((gen + 1) % 5 === 0 || gen === GENS - 1) {
    const { result, allPass } = acceptance(best.g, gen + 1);
    passRates = result;
    const rateStr = Object.entries(result).map(([lv, r]) => `H${lv}:${(r * 100).toFixed(0)}%`).join(' ');
    console.log(`  → 验收: ${rateStr}`);
    console.log(`  → ${allPass ? `★ 达标：全挡位 ≥${CHECK_RATE * 100}%！` : `未达标（继续训练）`}`);
    if (allPass) { console.log(`[evolve-battle] DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s @GEN${gen + 1}`); break; }
  }

  // 下一代：精英 + 锦标赛
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

if (!passRates) {
  const { result, allPass } = acceptance(best.g, GENS);
  passRates = result;
}
const finalStr = Object.entries(passRates).map(([lv, r]) => `H${lv}:${(r * 100).toFixed(0)}%`).join(' ');
console.log(`[evolve-battle] 最终: ${finalStr}`);
console.log(`[evolve-battle] H11 genome=${JSON.stringify(best.g)}`);
