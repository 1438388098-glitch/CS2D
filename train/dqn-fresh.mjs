// H11 从零强化学习训练器（与 H8-H10 管线完全独立）：
//   - 不加载任何前 10 级权重（随机初始化，--init 被禁用）
//   - 5 图轮训（每 episode 随机选图 → 天然泛化，无迁移）
//   - 双阶段探索：阶段1(前 40%) 高探索 ε 慢衰减学基础；阶段2 ε 快速收敛精炼
//   - 安弹引导：前期 plant 奖励加倍（先学会"进点安弹"再学战斗）
//   - 独立 checkpoint 命名 net_fresh_ep*.json / net_fresh_best.json
//   - 每 100 eps 用 dust2 vs normal 基线快速评估，输出实力成长曲线
// 用法: node train/dqn-fresh.mjs --eps=800 --seed=1
import { installStubs } from '../test/stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');
const { netObs, NET_ACTIONS } = await import('../src/ai/decisions.js');
const { DQN, ReplayBuffer, egreedy, DQN_EPS_START, DQN_EPS_END, DQN_BATCH, DQN_TARGET_SYNC } = await import('../src/dqn.js');
const { createRequire } = await import('module');
const fs = await import('fs');
const path = await import('path');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
function arg(name, def) {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
}
const EPS = parseInt(arg('eps', '2000'), 10);
const SEED = parseInt(arg('seed', '1'), 10);
const DEC_S = 0.6;
const MAPS = ['dust2', 'snow', 'depot', 'canal', 'metro'];
// 三段 ε 调度：阶段1 高探索学基础 → 阶段2 渐进收敛 → 阶段3 精炼（避免骤降崩溃）
const EPS_SCHEDULE = [
  { to: 0.3, until: 0.30, decay: 0.9993 },
  { to: 0.08, until: 0.60, decay: 0.9991 },
  { to: 0.02, until: 1.0, decay: 0.9990 }
];
const PLANT_GUIDE_UNTIL = 0.3;    // 安弹引导期（占训练比例）
const LR = 0.003;                 // 从零学习率略高

console.log(`[dqn-fresh] H11 从零强化学习 eps=${EPS} 5图轮训 seed=${SEED}（无任何前级权重, 三段ε调度）`);

// 网络：随机初始化（刻意不 import 任何 checkpoint）
const net = new DQN({ input: 13, hidden: 24, output: 6, lr: LR });
const targetNet = new DQN({ input: 13, hidden: 24, output: 6, lr: LR });
targetNet.copyFrom(net);
const replay = new ReplayBuffer(20000);
let eps = DQN_EPS_START;
let step = 0, targetSyncAt = DQN_TARGET_SYNC;
let totalKills = 0, totalWins = 0, totalRounds = 0, totalPlants = 0;

const CFG = { kill: 1.0, death: -1.0, win: 5.0, lose: -2.0, plant: 1.0 };

function makeEnv(ep) {
  const mapId = MAPS[Math.floor(Math.random() * MAPS.length)]; // 每 ep 随机选图
  seedWorld(SEED * 7919 + ep * 104729);
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId });
  g.opts.diffParams = DIFF.normal;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  // 对手难度课程：easy → normal → hard（训练技巧，非前级产物）
  const curIdx = Math.min(Math.floor((ep - 1) / (EPS / 3)), 2);
  for (const e of g.entities) if (e.bot && e.team === 'ct') e.aiParams = [DIFF.easy, DIFF.normal, DIFF.hard][curIdx];
  const shared = { ...DIFF.normal, netWeights: net.toJSON() };
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  for (const e of g.entities) if (e.bot && e.team === 't') e.aiParams = shared;
  return g;
}

function decide(g) {
  for (const e of g.entities) {
    if (!e.bot || e.team !== 't' || e.dead) continue;
    let a = egreedy(net, netObs(e, g), eps);
    if (e.hasBomb && (NET_ACTIONS[a] === 'save' || NET_ACTIONS[a] === 'hold')) {
      a = NET_ACTIONS.indexOf('push');
    }
    e.netAct = NET_ACTIONS[a];
    e.netAt = g.time;
  }
}

// 快速实力评估：dust2 vs normal 基线 8 回合（训练过程成长曲线）
function quickBench(ep) {
  seedWorld(ep * 31337);
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5 });
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  const shared = { ...DIFF.normal, netWeights: net.toJSON() };
  for (const e of g.entities) { if (e.bot && e.team === 't') e.aiParams = shared; if (e.bot && e.team === 'ct') e.aiParams = DIFF.normal; }
  g.buyTime = 0.3; g.freezeT = 0.2;
  let tWins = 0, rounds = 0, plants = 0, prevR = 0, prevS = 0, planted = false;
  for (let t = 0; t < 8 * 6000 + 12000; t++) {
    update(g, 1 / 60);
    if (g.round !== prevR) { prevR = g.round; planted = false; rounds++; if (rounds >= 8) break; }
    if (!planted && g.bomb && g.bomb.planted) { planted = true; plants++; }
    if (g.score.T > prevS) { tWins++; prevS = g.score.T; }
    if (g.state === 'END' && g.endedT > 1.2) g.endedT = 0.01;
    if (g.over) break;
  }
  return { rate: tWins / rounds, plants: plants / rounds };
}

const best = { ep: 0, score: -Infinity };
let lastStage = 0;
for (let ep = 1; ep <= EPS; ep++) {
  const g = makeEnv(ep);
  let epScore = 0, epRounds = 0;
  let prevTKillsBy = new Map();
  for (const e of g.entities) if (e.bot && e.team === 't') prevTKillsBy.set(e, e.kills || 0);
  let prevTAlive = g.entities.filter((e) => e.bot && e.team === 't' && !e.dead).length;
  let prevScoreT = g.score.T, prevScoreCT = g.score.CT;
  let wasPlanted = !!(g.bomb && g.bomb.planted);
  const pending = new Map();
  let lastDecideAt = 0;

  decide(g);
  for (const e of g.entities) {
    if (!e.bot || e.team !== 't' || e.dead) continue;
    pending.set(e, { s: netObs(e, g), a: NET_ACTIONS.indexOf(e.netAct), r: 0, done: false });
  }

  while (epRounds < 4 && !g.over && g.state !== 'MENU') {
    update(g, 1 / 60);
    if (g.state === 'END' && g.endedT <= 1.2) g.endedT = 0.01;

    if (g.score.T !== prevScoreT || g.score.CT !== prevScoreCT) {
      const tWon = g.score.T > prevScoreT;
      for (const [, tr] of pending) tr.r += tWon ? CFG.win : CFG.lose;
      if (tWon) totalWins++;
      totalRounds++; epRounds++;
      prevScoreT = g.score.T; prevScoreCT = g.score.CT;
    }
    // 安弹奖励（引导期翻倍，先学会进点安弹）
    if (g.bomb && g.bomb.planted && !wasPlanted) {
      const guide = ep / EPS < PLANT_GUIDE_UNTIL;
      for (const [, tr] of pending) tr.r += guide ? CFG.plant * 3 : CFG.plant;
      totalPlants++;
      wasPlanted = true;
    }
    for (const e of g.entities) {
      if (!e.bot || e.team !== 't') continue;
      const k = e.kills || 0;
      const prev = prevTKillsBy.get(e) || 0;
      if (k > prev) {
        const tr = pending.get(e);
        if (tr) tr.r += CFG.kill * (k - prev);
        totalKills += k - prev;
        prevTKillsBy.set(e, k);
      }
    }
    const tAliveNow = g.entities.filter((e) => e.bot && e.team === 't' && !e.dead).length;
    if (tAliveNow < prevTAlive) {
      for (const e of g.entities) {
        const tr = pending.get(e);
        if (tr && e.dead && !tr.done) {
          tr.r += CFG.death;
          tr.done = true;
          epScore += tr.r;
          replay.push([tr.s, tr.a, tr.r, null, true]);
          pending.delete(e);
        }
      }
      prevTAlive = tAliveNow;
    }

    if (g.time - lastDecideAt >= DEC_S) {
      lastDecideAt = g.time;
      const roundEnding = g.state === 'END';
      const next = new Map();
      for (const e of g.entities) {
        if (e.bot && e.team === 't' && !e.dead) next.set(e, e);
      }
      for (const [e, tr] of pending) {
        if (tr.done) continue;
        const alive = next.has(e);
        if (!alive || roundEnding) {
          tr.done = true;
          epScore += tr.r;
          replay.push([tr.s, tr.a, tr.r, null, true]);
          pending.delete(e);
        } else {
          epScore += tr.r;
          replay.push([tr.s, tr.a, tr.r, netObs(e, g), false]);
          pending.delete(e);
        }
      }
      if (roundEnding) {
        step++;
        continue;
      }
      decide(g);
      for (const e of g.entities) {
        if (!e.bot || e.team !== 't' || e.dead) continue;
        pending.set(e, { s: netObs(e, g), a: NET_ACTIONS.indexOf(e.netAct), r: 0, done: false });
      }
      step++;
      // 三段 ε 调度（平滑过渡，防崩溃）；阶段切换时清空回放（防旧经验污染）
      const frac = ep / EPS;
      let stageIdx = 0;
      for (let s = 0; s < EPS_SCHEDULE.length; s++) if (frac >= EPS_SCHEDULE[s].until) stageIdx = s + 1;
      stageIdx = Math.min(stageIdx, EPS_SCHEDULE.length - 1);
      const stage = EPS_SCHEDULE[stageIdx];
      if (stageIdx !== lastStage) {
        lastStage = stageIdx;
        replay.buf.length = 0; replay.pos = 0;
        console.log(`[ep ${ep}] 探索阶段 → ${stageIdx + 1}/3（ε 目标 ${stage.to}），回放已清空`);
      }
      const targetEps = stage.to;
      eps = Math.max(targetEps, eps * stage.decay);
      if (step >= targetSyncAt) { targetNet.copyFrom(net); targetSyncAt += DQN_TARGET_SYNC; }
      const batch = replay.sample(DQN_BATCH);
      if (batch) {
        for (const [s, a, r, s2, done] of batch) net.trainStep(s, a, r, s2, done);
      }
    }
  }
  for (const [, tr] of pending) {
    epScore += tr.r;
    replay.push([tr.s, tr.a, tr.r, null, true]);
  }
  if (epScore > best.score) {
    best.score = epScore; best.ep = ep;
    const out = path.join(path.dirname(require.resolve('../package.json')), 'train', 'checkpoints');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'net_fresh_best.json'), JSON.stringify({ ...net.toJSON(), ep, score: epScore, seed: SEED }));
  }
  if (ep % 100 === 0 || ep === EPS) {
    const b = quickBench(ep);
    console.log(`[ep ${ep}] score=${epScore.toFixed(1)} ε=${eps.toFixed(3)} replay=${replay.size} | 实力评估(dust2 vs normal): ${(b.rate * 100).toFixed(0)}% 胜 安弹${b.plants.toFixed(2)}`);
    const out = path.join(path.dirname(require.resolve('../package.json')), 'train', 'checkpoints');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `net_fresh_ep${ep}.json`), JSON.stringify({ ...net.toJSON(), ep, score: best.score, seed: SEED }));
  }
}

console.log(`[dqn-fresh] done. best=${best.score.toFixed(1)}@ep${best.ep} kills=${totalKills} wins=${totalWins}/${totalRounds} plants=${totalPlants}`);
