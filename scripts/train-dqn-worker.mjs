// DQN 团队合作训练 worker v3：能力基准公平 + per-bot 奖励流 + 分路/协同/eco 塑形
// 训练对象：决策网络（26 维团队观测 → 18 动作=6行为×3路线），不碰反应/瞄准/移速
// v3 改动：击杀/安弹/阵亡奖励按 bot 归属（多智能体信用分配），分路塑形 per-bot 化
import { parentPort, workerData } from 'worker_threads';
import { installStubs, registerUiIds } from '../test/stubdom.js';
installStubs();
registerUiIds();
import { createGame, startMatch, update } from '../src/game.js';
import { loadMap, getMap, findMapById } from '../src/map.js';
import { seedWorld, mulberry32 } from '../src/ctx.js';
import { DQN, ReplayBuffer, egreedy, DQN_BATCH, DQN_TARGET_SYNC, DQN_GAMMA } from '../src/dqn.js';
import { resolveDiff } from '../src/config.js';
import { netObsTeam, NET_ACTIONS, NET_LANES } from '../src/ai/decisions.js';

const { workerId, stepsTarget, mapId, roundDur, poolDir } = workerData;
let masterRng = mulberry32(20260804 + workerId * 7919);
globalThis.Math.random = () => masterRng();

loadMap(findMapById(mapId));
const m = getMap();

// ---- 对手池（自对弈）：CT 50% 规则 AI / 50% 池中 checkpoint ----
import fs from 'fs';
import path from 'path';
let poolFile = null;
let poolNet = null;
function refreshPool() {
  try {
    if (!poolDir || !fs.existsSync(poolDir)) return;
    const files = fs.readdirSync(poolDir).filter((f) => f.endsWith('.json'));
    if (!files.length) return;
    if (!poolFile || !files.includes(poolFile)) {
      poolFile = files[Math.floor(Math.random() * files.length)];
      poolNet = DQN.fromJSON(JSON.parse(fs.readFileSync(path.join(poolDir, poolFile), 'utf8')));
    }
  } catch {}
}

// ---- 公平能力基准：T/CT 用完全相同的一套参数（normal）----
const FAIR_PARAMS = resolveDiff('normal');

// ---- 训练网络：模仿学习预训练权重 warm start ----
const pretrainPath = path.join(process.cwd(), 'net-imitation-pretrain.json');
let net = new DQN({ input: 33, hidden: 32, output: 18 });
if (fs.existsSync(pretrainPath)) {
  const j = JSON.parse(fs.readFileSync(pretrainPath, 'utf8'));
  if (j.input === 33 && j.output === 18) net = DQN.fromJSON(j);
}
const target = new DQN({ input: 33, hidden: 32, output: 18 });
target.copyFrom(net);
const replay = new ReplayBuffer(40000);

const NET_DECISION_S = 0.3;
const N_STEP = 3;          // n-step 回报步数（加速稀疏奖励传播）
const GAMMA = DQN_GAMMA;
let eps = 0.35;
const EPS_DECAY = 0.9993;
const EPS_MIN = 0.08;
let step = 0, trainSteps = 0, lastLoss = 0;
let rounds = 0, wins = 0, plants = 0;
let ctPoolRounds = 0, ctRuleRounds = 0;

// 奖励常量（v4：per-bot + 情报，节奏维度新增）
const R_KILL = 10, R_ASSIST = 4, R_PLANT = 100, R_DROP = -15;
const R_TDEATH = 5, R_TDEATH_ECO = 8, R_SAVE = 5;
const R_WIN_PLANT = 150, R_WIN = 60, R_LOSE_PLANT = -40, R_LOSE = -70;
const R_ROTATE_PLANT = 20; // 转点后安弹成功的团队奖励
const R_INTEL = 1.5;       // 首次获取敌情（看到/听到/定位）—— 鼓励探测
const LANE_OK = 2, LANE_BAD = -1.5, SITE_COOP = 0.5;

function bootGame(seed) {
  seedWorld(seed * 7919 + 101);
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId });
  g.seed = seed;
  // 经济场景轮换（双方同经济，公平；覆盖 eco/中局/反ECO 三种战术环境）
  const ecoMode = seed % 3;
  const tMoney = ecoMode === 0 ? 10000 : (ecoMode === 1 ? 10000 : 800);
  const cMoney = ecoMode === 0 ? 800 : (ecoMode === 1 ? 10000 : 800);
  for (const e of g.entities) {
    if (!e.bot) continue;
    e.money = e.team === 't' ? tMoney : cMoney;
  }
  startMatch(g);
  g.player.dead = true;
  g.roundDur = roundDur;
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  // 回合级对抗源轮换：CT 70% 规则 / 30% 池 checkpoint（自对弈，低比例防非平稳）
  refreshPool();
  const ctUsePool = poolNet !== null && masterRng() < 0.3;
  if (ctUsePool) ctPoolRounds++; else ctRuleRounds++;
  for (const e of g.entities) {
    if (!e.bot) continue;
    // 同参数：能力完全公平，仅决策不同
    if (e.team === 'ct' && ctUsePool) {
      e.aiParams = { ...FAIR_PARAMS, netWeights: { __default: poolNet.toJSON() } };
    } else {
      e.aiParams = { ...FAIR_PARAMS };
    }
    e.netAct = undefined;
    e.netAt = 0;
    e.netLane = undefined;
    e.netPace = undefined;
    e.rushMode = false;
    // per-bot 奖励状态
    e._accum = 0;
    e._trans = [];
    e._pending = [];
    e._lastObs = null;
    e._lastAct = null;
    e._ecoFlag = (e.money || 0) < 2500;
    e._hadIntel = false;
  }
  return g;
}

function trainBatch() {
  const batch = replay.sample(DQN_BATCH);
  if (!batch) return;
  let loss = 0, n = 0;
  for (const { s, a, r, s2, done } of batch) {
    if (!s || !s2 || s.length !== 33 || s2.length !== 33) continue;
    loss += Math.abs(net.trainStepDouble(s, a, r, s2, done, target));
    n++;
  }
  if (n) lastLoss = loss / n;
  trainSteps++;
  if (trainSteps % DQN_TARGET_SYNC === 0) target.copyFrom(net);
}

function nearestAlive(g, x, y, team, maxD) {
  let best = null, bd = maxD;
  for (const o of g.entities) {
    if (!o.bot || o.dead || o.team !== team) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// per-bot 塑形：分路正确性（前 22s 且队伍已分散时才判）+ 进点协同
function perBotShape(e, g) {
  const rt = g.roundTime || 0;
  if (rt >= 22 || (g.bomb && g.bomb.planted)) return 0;
  const site = g.tAttackSite === 'A' ? m.sites.A : m.sites.B;
  const other = g.tAttackSite === 'A' ? m.sites.B : m.sites.A;
  const tBots = g.entities.filter((o) => o.bot && !o.dead && o.team === 't');
  if (!tBots.length) return 0;
  // 进点协同：主攻点内 ≥2 活 T → 点内者 dense 奖励
  const inSite = tBots.filter((b) => Math.hypot(b.x - site.cx, b.y - site.cy) < 400).length;
  const siteBonus = inSite >= 2 && Math.hypot(e.x - site.cx, e.y - site.cy) < 400 ? SITE_COOP : 0;
  const zones = tBots.map((b) => (Math.hypot(b.x - site.cx, b.y - site.cy) < 600 ? 'A' : Math.hypot(b.x - other.cx, b.y - other.cy) < 600 ? 'B' : 'M'));
  // 全队一区（rush/集结）→ 不判分路（反 ECO 全冲是真实战术）
  if (new Set(zones).size < 2) return siteBonus;
  let tx, ty;
  if (e.role === 'mid') { if (!m.mid) return siteBonus; tx = m.mid.x; ty = m.mid.y; }
  else if (e.role === g.tAttackSite) { tx = site.cx; ty = site.cy; }
  else { tx = other.cx; ty = other.cy; }
  const lane = Math.hypot(e.x - tx, e.y - ty) < 700 ? LANE_OK : LANE_BAD;
  return lane * 3 + siteBonus;
}

function runRound(seed) {
  const g = bootGame(seed);
  let lastRound = g.round;
  const prevDead = new Map();
  let prevPlanted = false, prevDropped = false, prevTScore = 0;
  let plantedThis = false, rotated = false, prevSite = g.tAttackSite;
  const maxTicks = Math.ceil((roundDur + 12) * 30) + 1200;

  for (let i = 0; i < maxTicks; i++) {
    update(g, 1 / 30);

    // 转点检测（IGL 拍板换攻击点 → 成功安弹有团队奖励）
    if (g.tAttackSite !== prevSite && prevSite) rotated = true;
    prevSite = g.tAttackSite;

    // 情报奖励：T bot 首次获取敌情（看到/听到/定位）→ 鼓励探测行为（peek/试探/前压）
    for (const e of g.entities) {
      if (!e.bot || e.team !== 't' || e.dead || e._hadIntel) continue;
      const hasIntel = (e.aimTarget && !e.aimTarget.dead) ||
        (e.lastHear && g.time - e.lastHear.t < 2) ||
        (e.lastKnown && g.time - (e.lastKnownT || 0) < 2);
      if (hasIntel) { e._accum += R_INTEL; e._hadIntel = true; }
    }

    // ---- per-bot 事件奖励（击杀归属/阵亡/安弹/掉包）----
    for (const e of g.entities) {
      if (!e.bot) continue;
      const wasDead = prevDead.get(e.name);
      if (e.dead && wasDead === false) {
        if (e.team === 't') {
          e._accum -= e._ecoFlag ? R_TDEATH_ECO : R_TDEATH;
        } else {
          // CT 阵亡 → 击杀者（最近活 T）+ 助攻
          const killer = nearestAlive(g, e.x, e.y, 't', 600);
          if (killer) {
            killer._accum += R_KILL;
            for (const o of g.entities) {
              if (o.bot && o.team === 't' && !o.dead && o !== killer && Math.hypot(o.x - e.x, o.y - e.y) < 300) o._accum += R_ASSIST;
            }
          }
        }
      }
      prevDead.set(e.name, !!e.dead);
    }
    if (g.bomb && g.bomb.planted && !prevPlanted) {
      plantedThis = true;
      let planter = g.entities.find((o) => o.bot && o.team === 't' && o.plantT > 0);
      if (!planter) planter = nearestAlive(g, g.bomb.x, g.bomb.y, 't', 250);
      if (planter) planter._accum += R_PLANT;
    }
    prevPlanted = !!(g.bomb && g.bomb.planted);
    if (g.bomb && g.bomb.dropped && !prevDropped) {
      for (const e of g.entities) if (e.bot && e.team === 't') e._accum += R_DROP;
    }
    prevDropped = !!(g.bomb && g.bomb.dropped);

    // ---- 决策步（每个 T bot 独立转移链）----
    if (g.state === 'LIVE') {
      for (const e of g.entities) {
        if (!e.bot || e.dead || e.team !== 't') continue;
        if (e.netAt === undefined || g.time - e.netAt >= NET_DECISION_S) {
          const obs = netObsTeam(e, g);
          if (!obs || !Array.isArray(obs)) { e.netAt = g.time; continue; }
          const a = egreedy(net, obs, eps);
          // 18 解码：行为 = idx % 6，路线 = idx / 6（n-step + Double DQN 版）
          e.netAct = NET_ACTIONS[a % NET_ACTIONS.length];
          e.netLane = NET_LANES[Math.floor(a / NET_ACTIONS.length) % NET_LANES.length];
          e.netAt = g.time;
          if (e._lastObs) {
            // n-step 缓冲：延迟 N 步合成 n-step 回报，加速回合末奖励（安弹/胜负）传播到早期决策
            e._pending.push({ s: e._lastObs, a: e._lastAct, r: e._accum + perBotShape(e, g), s2: obs, done: false });
            if (e._pending.length >= N_STEP) {
              const head = e._pending.shift();
              let gr = 0, gg = 1;
              for (const p of e._pending) { gr += gg * p.r; gg *= GAMMA; }
              const last = e._pending[e._pending.length - 1];
              e._trans.push({ s: head.s, a: head.a, r: head.r + gr, s2: last.s2, done: false });
            }
          }
          e._lastObs = obs; e._lastAct = a;
          e._accum = 0;
          step++;
          if (eps > EPS_MIN) eps *= EPS_DECAY;
          if (step % 6 === 0) trainBatch();
          if (step > 0 && step > 60000 && step % 50000 === 0) {
            parentPort.postMessage({ type: 'checkpoint', workerId, step, weights: net.toJSON() });
          }
        }
      }
    }

    // ---- 回合结算（胜负奖励共享 + 保枪奖励）----
    if (g.round !== lastRound) {
      const tWin = g.score.T > prevTScore;
      let rr = 0;
      if (tWin) {
        wins++;
        rr = plantedThis ? R_WIN_PLANT : R_WIN;
        if (rotated && plantedThis) rr += R_ROTATE_PLANT;
      } else {
        rr = plantedThis ? R_LOSE_PLANT : R_LOSE;
      }
      if (plantedThis) plants++;
      for (const e of g.entities) {
        if (!e.bot || e.team !== 't') continue;
        const saveBonus = (!tWin && !e.dead) ? R_SAVE : 0;
        // n-step 残留转移收尾：pending 内的全部以 done 结束（奖励并入 rr）
        for (const p of e._pending) {
          p.done = true;
          p.r += rr + saveBonus;
          e._trans.push(p);
        }
        e._pending.length = 0;
        if (e._lastObs) {
          e._trans.push({ s: e._lastObs, a: e._lastAct, r: e._accum + rr + saveBonus, s2: e._lastObs, done: true });
          for (const t of e._trans) replay.push(t);
        }
        e._trans.length = 0;
        e._lastObs = null; e._lastAct = null;
        e._accum = 0;
      }
      plantedThis = false;
      rounds++;
      prevTScore = g.score.T;
      lastRound = g.round;
      if (rounds % 4 === 0) {
        parentPort.postMessage({
          type: 'progress', workerId, rounds, step,
          eps: +eps.toFixed(3), winRate: Math.round(wins / rounds * 100),
          loss: +lastLoss.toFixed(4),
          ctPool: ctPoolRounds, ctRule: ctRuleRounds
        });
      }
      return tWin;
    }
  }
  return false;
}

let seedBase = workerId * 100000 + 3;
while (step < stepsTarget) {
  seedBase += 7;
  runRound(seedBase);
}

parentPort.postMessage({
  type: 'done', workerId,
  rounds, wins, plants, step,
  weights: net.toJSON()
});
