// DQN 自对弈训练主进程 v2：对手池（checkpoint 快评/淘汰）+ 双对手评估 + 96 回合
// 用法: node scripts/train-dqn.mjs [stepsPerWorker] [workers]
import { Worker } from 'worker_threads';
import fs from 'fs';
import path from 'path';

const STEPS = parseInt(process.argv[2] || '250000', 10);
const WORKERS = parseInt(process.argv[3] || '8', 10);
const MAP = 'dust2';
const ROUND_DUR = 35; // 训练回合 35s（20s 实测压垮 T 战术周期：基线 38%→13%，回滚）
const EVAL_ROUNDS = 96;
const QUICK_ROUNDS = 24;
const POOL_SIZE = 3;
const POOL_MIN_EV = 45; // 入池门槛：对规则快评 ≥45%（防止弱权重污染池）
const POOL_DIR = path.join(process.cwd(), 'pool');
if (!fs.existsSync(POOL_DIR)) fs.mkdirSync(POOL_DIR, { recursive: true });

const workers = [];
let progressCount = 0;

console.log(`[train] ${WORKERS} workers × ${STEPS} 步 | map=${MAP} | 回合 ${ROUND_DUR}s`);
console.log(`[train] 对手池: CT 50% 规则 / 50% 池 checkpoint（每 3 万步上报，12 回合快评，池容量 ${POOL_SIZE}）`);

// 对手池：{file, step, workerId, evRule, weights}
const pool = [];

function spawnWorker(id) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('./train-dqn-worker.mjs', import.meta.url), {
      workerData: { workerId: id, stepsTarget: STEPS, mapId: MAP, roundDur: ROUND_DUR, poolDir: POOL_DIR }
    });
    w.on('message', (m) => {
      if (m.type === 'checkpoint') {
        const ev = evalWeights(m.weights, 500 + m.workerId, QUICK_ROUNDS, null);
        if (ev.winRate < POOL_MIN_EV) {
          console.log(`  [pool] w${m.workerId} s${m.step} 快评 ${ev.winRate}% < 门槛${POOL_MIN_EV}% → 不入池`);
        } else {
          const file = path.join(POOL_DIR, `champ-w${m.workerId}-s${m.step}.json`);
          fs.writeFileSync(file, JSON.stringify(m.weights));
          pool.push({ file, step: m.step, workerId: m.workerId, evRule: ev.winRate, weights: m.weights });
          pool.sort((a, b) => b.evRule - a.evRule);
          if (pool.length > POOL_SIZE) {
            const drop = pool.pop();
            try { fs.unlinkSync(drop.file); } catch {}
          }
          console.log(`  [pool] w${m.workerId} s${m.step} 对规则 ${ev.winRate}% → 池[${pool.map((p) => p.evRule + '%').join(' / ')}]`);
        }
      } else if (m.type === 'progress') {
        progressCount++;
        if (progressCount % 10 === 0 || m.rounds % 30 === 0) {
          console.log(`  [w${m.workerId}] 回合${m.rounds} 步${m.step} ε${m.eps} 胜率${m.winRate}% loss${m.loss} CT池${m.ctPool}/${m.ctRule}`);
        }
      } else if (m.type === 'done') {
        resolve(m);
      }
    });
    w.on('error', (err) => { console.error(`[w${id}] 错误:`, err.message); resolve(null); });
    workers.push(w);
  });
}

// 固定对手评估（主进程内直跑，确定性种子）：ctPoolWeights 非空 → CT 用该网络权重（自对弈评估）
import { installStubs, registerUiIds } from '../test/stubdom.js';
installStubs();
registerUiIds();
import { createGame, startMatch, update } from '../src/game.js';
import { loadMap, getMap, findMapById } from '../src/map.js';
import { seedWorld, mulberry32 } from '../src/ctx.js';
import { DQN } from '../src/dqn.js';
import { resolveDiff } from '../src/config.js';
import { netObsTeam, NET_ACTIONS, NET_LANES, NET_PACES } from '../src/ai/decisions.js';

function evalWeights(weightsJson, seedOffset, rounds = EVAL_ROUNDS, ctPoolWeights = null) {
  loadMap(findMapById(MAP));
  let rng = mulberry32(20260804 + seedOffset);
  const oldRand = Math.random;
  globalThis.Math.random = () => rng();
  const ctBase = resolveDiff('normal');
  const ctNet = ctPoolWeights ? DQN.fromJSON(ctPoolWeights) : null;
  const net = weightsJson ? DQN.fromJSON(weightsJson) : null;
  let wins = 0, plants = 0;
  let clumpFrames = 0, liveFrames = 0, laneSpreadSum = 0, laneN = 0;
  const A = getMap().sites.A, B = getMap().sites.B;
  for (let r = 0; r < rounds; r++) {
    seedWorld((r + 1) * 7919 + 101 + seedOffset * 31);
    const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: MAP });
    g.seed = r + 1;
    // 经济场景轮换（与 worker 一致，双方同经济保证公平）
    const ecoMode = (r + 1) % 3;
    const tMoney = ecoMode === 0 ? 10000 : (ecoMode === 1 ? 10000 : 800);
    const cMoney = ecoMode === 0 ? 800 : (ecoMode === 1 ? 10000 : 800);
    for (const e of g.entities) {
      if (!e.bot) continue;
      e.money = e.team === 't' ? tMoney : cMoney;
    }
    startMatch(g);
    g.player.dead = true;
    g.roundDur = ROUND_DUR;
    g.buyTime = 0.3;
    g.freezeT = 0.2;
    for (const e of g.entities) {
      if (!e.bot) continue;
      if (e.team === 'ct') {
        e.aiParams = ctNet ? { ...ctBase, netWeights: { __default: ctPoolWeights } } : { ...ctBase };
      } else {
        e.aiParams = { ...resolveDiff('normal') };
      }
      e.netAct = undefined; e.netAt = 0; e.netLane = undefined;
      if (e.team === 't' && net) e.rushMode = false;
    }
    let lastRound = g.round, prevTScore = 0;
    const maxTicks = Math.ceil((ROUND_DUR + 12) * 30) + 1200;
    for (let i = 0; i < maxTicks; i++) {
      update(g, 1 / 30);
      if (g.state === 'LIVE') {
        liveFrames++;
        const tb = g.entities.filter((o) => o.bot && !o.dead && o.team === 't');
        let clumps = 0;
        for (let a = 0; a < tb.length; a++) for (let b = a + 1; b < tb.length; b++) {
          if (Math.hypot(tb[a].x - tb[b].x, tb[a].y - tb[b].y) < 90) clumps++;
        }
        if (clumps) clumpFrames++;
        if (tb.length >= 2) {
          const zones = tb.map((o) => (Math.hypot(o.x - A.cx, o.y - A.cy) < 600 ? 'A' : Math.hypot(o.x - B.cx, o.y - B.cy) < 600 ? 'B' : 'mid'));
          laneSpreadSum += new Set(zones).size;
          laneN++;
        }
        for (const e of g.entities) {
          if (!e.bot || e.dead) continue;
          if (e.netAt === undefined || g.time - e.netAt >= 0.6) {
            const useNet = e.team === 't' ? net : ctNet;
            if (useNet) {
              const obs = netObsTeam(e, g);
              if (obs && Array.isArray(obs)) {
                const q = useNet.forward(obs);
                let best = 0;
                for (let k = 1; k < q.length; k++) if (q[k] > q[best]) best = k;
                e.netAct = NET_ACTIONS[best % NET_ACTIONS.length];
                e.netLane = NET_LANES[Math.floor(best / NET_ACTIONS.length) % NET_LANES.length];
                e.netPace = q.length >= 36 ? NET_PACES[Math.floor(best / (NET_ACTIONS.length * NET_LANES.length))] : undefined;
              }
            }
            e.netAt = g.time;
          }
        }
      }
      if (g.round !== lastRound) {
        if (g.score.T > prevTScore) wins++;
        if (g.bomb && g.bomb.planted) plants++;
        lastRound = g.round;
        prevTScore = g.score.T;
        break;
      }
    }
  }
  globalThis.Math.random = oldRand;
  return {
    winRate: Math.round(wins / rounds * 100), plants, wins,
    clumpPct: Math.round(clumpFrames / Math.max(1, liveFrames) * 100),
    laneSpread: laneN ? (laneSpreadSum / laneN).toFixed(2) : '-'
  };
}

// 基线：纯规则 T vs 规则 CT —— 能力完全公平（正常难度参数）
console.log('\n[baseline] 纯规则 T vs 规则 CT（能力公平基准）...');
const base = evalWeights(null, 1, EVAL_ROUNDS, null);
console.log(`  → T 胜率 ${base.winRate}% (${base.wins}/${EVAL_ROUNDS}) | 扎堆${base.clumpPct}% | 分路度${base.laneSpread}`);
console.log(`  （分路度: 1=全挤一路, 3=完美三路分散）`);

console.log(`\n[note] 训练目标：T 决策网络（33 维团队观测 → 18 动作）超过规则 AI，能力参数 T/CT 完全相同`);

console.log(`\n[train] 启动 ${WORKERS} 个训练 worker ...`);
const results = await Promise.all(Array.from({ length: WORKERS }, (_, i) => spawnWorker(i)));

console.log('\n[train] 全部完成，评估候选权重（96 回合 × 双对手，含池中 checkpoint）...');
const results2 = results.filter(Boolean).map((r, i) => ({ ...r, idx: i }));
const candidates = [...results2];
// 池中 checkpoint 也是候选（多次实测：10 万步 checkpoint 强于过拟合终态）
for (const f of fs.readdirSync(POOL_DIR).filter((f) => f.endsWith('.json'))) {
  try {
    const w = JSON.parse(fs.readFileSync(path.join(POOL_DIR, f), 'utf8'));
    const wm = f.match(/w(\d+)/), sm = f.match(/s(\d+)/);
    candidates.push({
      weights: w, workerId: wm ? wm[1] : 'pool', step: sm ? parseInt(sm[1], 10) : 0,
      rounds: 0, wins: 0, plants: 0, fromPool: f
    });
  } catch {}
}
const poolBest = pool.length ? pool[0] : null;
if (poolBest) {
  console.log(`[pool] 最终池最佳: ${path.basename(poolBest.file)} 对规则 ${poolBest.evRule}%（评估时作为 CT 自对弈对手）`);
} else {
  console.log('[pool] 池为空（无 checkpoint 上报），终评仅对规则');
}

let best = null;
for (const cand of candidates) {
  const tag = cand.fromPool ? cand.fromPool : '终态 w' + cand.workerId;
  const evRule = evalWeights(cand.weights, 10 + cand.workerId, EVAL_ROUNDS, null);
  cand.ev = evRule;
  let evPool = null;
  if (poolBest) {
    evPool = evalWeights(cand.weights, 300 + cand.workerId, EVAL_ROUNDS, poolBest.weights);
    cand.evPool = evPool;
  }
  const trainWr = cand.rounds ? Math.round(cand.wins / cand.rounds * 100) : '-';
  console.log(`  [${tag}] 训练胜率${trainWr}% 步${cand.step} → 对规则 ${evRule.winRate}%${evPool ? ' | 对历史冠军 ' + evPool.winRate + '%' : ''} 扎堆${evRule.clumpPct}% 分路度${evRule.laneSpread}`);
  const score = evRule.winRate + (evPool ? evPool.winRate * 0.3 : 0);
  if (!best || score > best.score) { best = { ...cand, score }; }
}

// 导出最佳权重
if (best && best.ev.winRate >= base.winRate) {
  const outPath = path.join(process.cwd(), 'net-weights-trained.json');
  fs.writeFileSync(outPath, JSON.stringify({
    trainedAt: new Date().toISOString(),
    map: MAP, roundDur: ROUND_DUR,
    steps: best.step, trainRounds: best.rounds,
    evalWinRate: best.ev.winRate,
    evalVsPool: best.evPool ? best.evPool.winRate : null,
    baselineWinRate: base.winRate,
    weights: best.weights
  }, null, 1));
  console.log(`\n[deploy] 最佳候选 [w${best.workerId}] 对规则 ${best.ev.winRate}% > 基线 ${base.winRate}%`);
  console.log(`[deploy] 权重已导出 → ${outPath}`);
} else {
  console.log('\n[deploy] 所有候选未超过基线，未导出（可加大训练量重试）');
}

for (const w of workers) w.terminate();
process.exit(0);
