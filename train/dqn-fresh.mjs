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
const DEC_S = 0.35; // 决策步 0.35s（更密的 TD 传播，γ 有效时域翻倍）
const MAPS = ['dust2', 'snow', 'depot', 'canal', 'metro'];
// 三段 ε 调度（保底 0.08 探索，避免困在局部最优）
const EPS_SCHEDULE = [
  { to: 0.30, until: 0.25, decay: 0.9993 },
  { to: 0.12, until: 0.55, decay: 0.9992 },
  { to: 0.08, until: 1.0, decay: 0.9991 }
];
const PLANT_GUIDE_UNTIL = 0.25;   // 安弹引导期
const LR = 0.003;
// 奖励平衡（核心修复：赢的期望要压过死亡惩罚，网络才学进攻而非保命）
const CFG = { kill: 1.2, death: -0.8, win: 10.0, lose: -2.0, plant: 2.0, plantTeam: 0.5, moveR: 0.004 };
// 自适应对手池（含 H3 参数=冠军级，超出后不再升级）
const OPP_POOL = ['easy', 'normal', 'hard', 'champ'];

console.log(`[dqn-fresh] H11 从零强化学习 eps=${EPS} 5图轮训 seed=${SEED}（密集奖励+信用分配+自适应对手）`);

// 网络：随机初始化（刻意不 import 任何 checkpoint）
// γ=0.995：0.35s 决策步 × 110 步/回合 → 奖励有效时域 ≈ 整回合（win 能传回起点，核心修复）
const net = new DQN({ input: 13, hidden: 24, output: 6, lr: LR, gamma: 0.995 });
const targetNet = new DQN({ input: 13, hidden: 24, output: 6, lr: LR, gamma: 0.995 });
targetNet.copyFrom(net);
const replay = new ReplayBuffer(20000);
let eps = DQN_EPS_START;
let step = 0, targetSyncAt = DQN_TARGET_SYNC;
let totalKills = 0, totalWins = 0, totalRounds = 0, totalPlants = 0;
let oppLevel = 0; // 自适应对手：0=easy 1=normal 2=hard 3=champ(H3参数)
let qAcc = 0, tdAcc = 0, qN = 0; // Q 值/TD 监控

function oppParams(level) {
  if (level >= 3) return { ...DIFF.hell.ladder[3] }; // 冠军参数（不是权重，仅参数级对手）
  return DIFF[OPP_POOL[level]];
}

function makeEnv(ep) {
  const mapId = MAPS[Math.floor(Math.random() * MAPS.length)]; // 每 ep 随机选图
  seedWorld(SEED * 7919 + ep * 104729);
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId });
  g.opts.diffParams = DIFF.normal;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  // 自适应对手（按实力匹配，持续提供"刚好能赢"的对手 → 保证训练曲线持续上升）
  for (const e of g.entities) if (e.bot && e.team === 'ct') e.aiParams = oppParams(oppLevel);
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

// 快速实力评估（自适应对手依据）：3 seed × 8 回合 vs 指定对手参数
// 评估对象 = 下一级对手：打得过 next 才升级（与训练目标对齐，修复死锁）
function quickBench(ep, opponent) {
  let tWins = 0, rounds = 0, plants = 0;
  for (let rep = 0; rep < 3; rep++) {
    seedWorld(ep * 31337 + rep * 1009);
    const g = createGame({ team: 'ct', diff: 'normal', bots: 5 });
    g.ui = null;
    startMatch(g);
    g.player.bot = true;
    const shared = { ...DIFF.normal, netWeights: net.toJSON() };
    for (const e of g.entities) { if (e.bot && e.team === 't') e.aiParams = shared; if (e.bot && e.team === 'ct') e.aiParams = opponent; }
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

const best = { ep: 0, score: -Infinity };
let lastStage = 0;
const rateHistory = []; // 单调性趋势记录
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
    const s = netObs(e, g);
    pending.set(e, { s, a: NET_ACTIONS.indexOf(e.netAct), r: 0, done: false, prevD: s[9] });
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
    // 安弹奖励（引导期加倍；信用分配：持包者全额，队友小份）
    if (g.bomb && g.bomb.planted && !wasPlanted) {
      const guide = ep / EPS < PLANT_GUIDE_UNTIL;
      for (const [e, tr] of pending) {
        tr.r += (e.hasBomb ? CFG.plant : CFG.plantTeam) * (guide ? 1.5 : 1);
      }
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
          // 密集移动奖励：朝目标走 → 正信号（持续梯度，解决稀疏奖励）
          const s2 = netObs(e, g);
          tr.r += CFG.moveR * Math.max(0, tr.prevD - s2[9]);
          epScore += tr.r;
          replay.push([tr.s, tr.a, tr.r, s2, false]);
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
        const s = netObs(e, g);
        pending.set(e, { s, a: NET_ACTIONS.indexOf(e.netAct), r: 0, done: false, prevD: s[9] });
      }
      step++;
      // 三段 ε 调度（保底 0.05 探索）；阶段切换清空回放防污染
      const frac = ep / EPS;
      let stageIdx = 0;
      for (let s = 0; s < EPS_SCHEDULE.length; s++) if (frac >= EPS_SCHEDULE[s].until) stageIdx = s + 1;
      stageIdx = Math.min(stageIdx, EPS_SCHEDULE.length - 1);
      const stage = EPS_SCHEDULE[stageIdx];
      if (stageIdx !== lastStage) {
        lastStage = stageIdx;
        // 不清空回放（修复：刚学的经验被丢弃）；分层采样本身已优先近期经验
        console.log(`[ep ${ep}] 探索阶段 → ${stageIdx + 1}/3（ε 目标 ${stage.to}）`);
      }
      const targetEps = stage.to;
      eps = Math.max(targetEps, eps * stage.decay);
      if (step >= targetSyncAt) { targetNet.copyFrom(net); targetSyncAt += DQN_TARGET_SYNC; }
      const batch = replay.sample(DQN_BATCH);
      if (batch) {
        for (const [s, a, r, s2, done] of batch) {
          const delta = net.trainStep(s, a, r, s2, done);
          qAcc += delta; tdAcc += Math.abs(delta); qN++;
        }
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
    // 权重健康检查：NaN/Infinity 立即止损退出（防止废训练白跑）
    let bad = 0;
    for (const row of net.iw) for (const v of row) if (!Number.isFinite(v)) bad++;
    for (const row of net.ow) for (const v of row) if (!Number.isFinite(v)) bad++;
    if (bad > 0) {
      console.error(`[dqn-fresh] FATAL: 权重含 ${bad} 个非有限值 @ep${ep} —— 训练终止`);
      process.exit(2);
    }
    const b = quickBench(ep, oppParams(Math.min(oppLevel + 1, OPP_POOL.length - 1)));
    // 自适应对手：打得过下一级（>60%）升档；打不过当前级（<25%）降档——评估与训练对齐
    let oppSign = '=';
    if (b.rate > 0.60 && oppLevel < OPP_POOL.length - 1) { oppLevel++; oppSign = '↑'; }
    else if (b.rate < 0.25 && oppLevel > 0) { oppLevel--; oppSign = '↓'; }
    // 单调性趋势：当前 5 次评估均值 vs 前 5 次均值（每 100 eps 一次 → 对比 500 eps 前后）
    rateHistory.push(b.rate);
    const window = rateHistory.slice(-10);
    let trend = '·';
    if (window.length === 10) {
      const curAvg = window.slice(-5).reduce((s, v) => s + v, 0) / 5;
      const prevAvg = window.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
      trend = curAvg > prevAvg + 0.05 ? '↑' : (curAvg < prevAvg - 0.05 ? '↓' : '→');
    }
    const avgTD = qN ? (tdAcc / qN).toFixed(3) : '0';
    console.log(`[ep ${ep}] score=${epScore.toFixed(1)} ε=${eps.toFixed(3)} | vs下一级: ${(b.rate * 100).toFixed(0)}% 安弹${b.plants.toFixed(2)} | 对手=${OPP_POOL[oppLevel]}${oppSign} 趋势${trend} | |TD|=${avgTD}`);
    qAcc = 0; tdAcc = 0; qN = 0;
    const out = path.join(path.dirname(require.resolve('../package.json')), 'train', 'checkpoints');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `net_fresh_ep${ep}.json`), JSON.stringify({ ...net.toJSON(), ep, score: best.score, seed: SEED }));
  }
}

console.log(`[dqn-fresh] done. best=${best.score.toFixed(1)}@ep${best.ep} kills=${totalKills} wins=${totalWins}/${totalRounds} plants=${totalPlants}`);
