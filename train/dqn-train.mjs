// DQN 强化学习训练：地狱级 H8-H10 策略网络（参数共享多智能体，5 个 T bot 共用一个网络）
// 用法: node train/dqn-train.mjs --style=hold --eps=300 --map=dust2 --rounds=4 --seed=1
//   style: hold(保守架点流 H8) | control(主动控图流 H9) | push(压迫前压流 H10)
// 产出: train/checkpoints/net_{style}_ep{ep}.json (兼容 src/dqn.js dqnFromJSON)
import { installStubs } from '../test/stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');
const { netObs, NET_ACTIONS } = await import('../src/ai/decisions.js');
const { DQN, ReplayBuffer, egreedy, DQN_EPS_START, DQN_EPS_END, DQN_EPS_DECAY, DQN_BATCH, DQN_TARGET_SYNC } = await import('../src/dqn.js');
const { createRequire } = await import('module');
const fs = await import('fs');
const path = await import('path');
const require = createRequire(import.meta.url);

// —— 参数解析（仅 --key=value 形式，与 run-batch 一致）——
const args = process.argv.slice(2);
function arg(name, def) {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
}
const STYLE = arg('style', 'hold');
const EPS = parseInt(arg('eps', '300'), 10);
const MAP = arg('map', 'dust2');
const ROUNDS_PER_EP = parseInt(arg('rounds', '4'), 10);
const SEED = parseInt(arg('seed', '1'), 10);
const DEC_S = 0.6;

// —— 风格配置（reward 塑形）——
const STYLE_CFG = {
  hold: { kill: 1.0, death: -1.0, win: 5.0, lose: -2.0, plant: 1.0, holdBonus: 0.02, deathExtra: -0.5, name: 'H8 保守架点流' },
  control: { kill: 1.0, death: -1.0, win: 5.0, lose: -2.0, plant: 1.0, pushBonus: 0.03, nadeBonus: 0.1, name: 'H9 主动控图流' },
  push: { kill: 2.0, death: -1.0, win: 5.0, lose: -2.0, plant: 1.0, pushBonus: 0.02, rotateBonus: 0.03, name: 'H10 压迫前压流' }
};
const CFG = STYLE_CFG[STYLE] || STYLE_CFG.hold;

console.log(`[dqn-train] style=${STYLE} (${CFG.name}) eps=${EPS} map=${MAP} seed=${SEED}`);

const net = new DQN({ input: 13, hidden: 24, output: 6 });
const targetNet = new DQN({ input: 13, hidden: 24, output: 6 });
targetNet.copyFrom(net);
const replay = new ReplayBuffer(20000);
let eps = DQN_EPS_START;
let step = 0, targetSyncAt = DQN_TARGET_SYNC;
let totalKills = 0, totalRounds = 0, totalWins = 0;

// —— 环境 ——
function makeEnv() {
  seedWorld(SEED * 1000 + Math.floor(Math.random() * 10000));
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: MAP });
  g.opts.diffParams = DIFF.normal;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  // 训练队（T）5 bot 共享网络参数
  const shared = { ...DIFF.normal, netWeights: net.toJSON() };
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  for (const e of g.entities) if (e.bot && e.team === 't') e.aiParams = shared;
  return g;
}

// 决策步：给每个存活 T bot 用 ε-greedy 覆盖动作（netAct 缓存机制消费）
// 持包 bot 禁止 save/hold（必须配合进点，否则全队保枪无人安弹）
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

// 风格塑形奖励（决策步末，per bot）
function shapeBonus(e, g, act) {
  const m = g.mapW;
  let b = 0;
  if (STYLE === 'hold' && act === 'hold') b += CFG.holdBonus;
  if (STYLE === 'control') {
    const w = e.weapons && e.weapons.primary;
    const ammoOk = !w || (e.ammoMap && e.ammoMap[w.id] > 0);
    const far = Math.hypot(e.x - g.mapW / 2, e.y - g.mapH / 2) > m * 0.25;
    if (act === 'push' && far && !e.aimTarget) b += CFG.pushBonus;
    if (act === 'nade' && e.weapons && e.weapons.nades && e.weapons.nades.flash > 0) b += CFG.nadeBonus;
  }
  if (STYLE === 'push') {
    if (act === 'push') b += CFG.pushBonus;
    if (act === 'rotate') b += CFG.rotateBonus;
  }
  return b;
}

// —— 主训练循环 ——
const best = { ep: 0, score: -Infinity };
for (let ep = 1; ep <= EPS; ep++) {
  const g = makeEnv();
  let epScore = 0, epRounds = 0;
  let prevTKills = 0, prevTKillsBy = new Map(); // 每 bot 击杀数
  for (const e of g.entities) if (e.bot && e.team === 't') prevTKillsBy.set(e, e.kills || 0);
  let prevTAlive = g.entities.filter((e) => e.bot && e.team === 't' && !e.dead).length;
  let prevScoreT = g.score.T, prevScoreCT = g.score.CT;
  let wasPlanted = !!(g.bomb && g.bomb.planted);
  const pending = new Map(); // bot → { s, a, r, done }
  let lastDecideAt = 0;

  decide(g);
  for (const e of g.entities) {
    if (!e.bot || e.team !== 't' || e.dead) continue;
    pending.set(e, { s: netObs(e, g), a: NET_ACTIONS.indexOf(e.netAct), r: 0, done: false });
  }

  while (epRounds < ROUNDS_PER_EP && !g.over && g.state !== 'MENU') {
    const dt = 1 / 60;
    update(g, dt);
    if (g.state === 'END' && g.endedT <= 1.2) g.endedT = 0.01; // 跳过回合动画

    // —— 事件检测（逐帧）——
    if (g.score.T !== prevScoreT || g.score.CT !== prevScoreCT) {
      const tWon = g.score.T > prevScoreT;
      for (const [e, tr] of pending) tr.r += tWon ? CFG.win : CFG.lose;
      if (tWon) totalWins++;
      totalRounds++;
      epRounds++;
      prevScoreT = g.score.T; prevScoreCT = g.score.CT;
    }
    // 安弹奖励（全队共享，鼓励进点装弹）
    if (g.bomb && g.bomb.planted && !wasPlanted) {
      for (const [e, tr] of pending) tr.r += CFG.plant;
      wasPlanted = true;
    }
    for (const e of g.entities) {
      if (!e.bot || e.team !== 't') continue;
      const k = e.kills || 0;
      if (k > (prevTKillsBy.get(e) || 0)) {
        const diff = k - (prevTKillsBy.get(e) || 0);
        const tr = pending.get(e);
        if (tr) tr.r += CFG.kill * diff;
        totalKills += diff;
        prevTKillsBy.set(e, k);
      }
    }
    const tAliveNow = g.entities.filter((e) => e.bot && e.team === 't' && !e.dead).length;
    if (tAliveNow < prevTAlive) {
      const died = prevTAlive - tAliveNow;
      for (const e of g.entities) {
        const tr = pending.get(e);
        if (tr && e.dead && !tr.done) {
          tr.r += CFG.death + (STYLE === 'hold' ? CFG.deathExtra : 0);
          tr.done = true;
          epScore += tr.r;
          replay.push([tr.s, tr.a, tr.r, null, true]);
          pending.delete(e);
        }
      }
      prevTAlive = tAliveNow;
    }

    // —— 决策步边界 ——
    if (g.time - lastDecideAt >= DEC_S) {
      lastDecideAt = g.time;
      const roundEnding = g.state === 'END';
      const next = new Map();
      for (const e of g.entities) {
        if (!e.bot || e.team !== 't' || e.dead) continue;
        next.set(e, e);
      }
      // 1) 结算旧 transitions：s' = 当前 obs；死亡/回合结束 → null + done
      for (const [e, tr] of pending) {
        if (tr.done) continue;
        const alive = next.has(e);
        if (!alive || roundEnding) {
          tr.done = true;
          epScore += tr.r;
          replay.push([tr.s, tr.a, tr.r, null, true]);
          pending.delete(e);
        } else {
          const s2 = netObs(e, g);
          tr.r += shapeBonus(e, g, NET_ACTIONS[tr.a]);
          epScore += tr.r;
          replay.push([tr.s, tr.a, tr.r, s2, false]);
          pending.delete(e);
        }
      }
      // 2) 回合结束后不建新 pending（等 spawn 后的下一决策步）
      if (roundEnding) {
        step++;
        eps = Math.max(DQN_EPS_END, eps * DQN_EPS_DECAY);
        continue;
      }
      // 3) 新决策步
      decide(g);
      for (const e of g.entities) {
        if (!e.bot || e.team !== 't' || e.dead) continue;
        pending.set(e, { s: netObs(e, g), a: NET_ACTIONS.indexOf(e.netAct), r: 0, done: false });
      }

      // —— 学习更新（回放采样）——
      step++;
      eps = Math.max(DQN_EPS_END, eps * DQN_EPS_DECAY);
      if (step >= targetSyncAt) {
        targetNet.copyFrom(net);
        targetSyncAt += DQN_TARGET_SYNC;
      }
      const batch = replay.sample(DQN_BATCH);
      if (batch) {
        for (const [s, a, r, s2, done] of batch) {
          net.trainStep(s, a, r, s2, done);
        }
      }
    }
  }

  // episode 结束：清 pending（回合中途强停）
  for (const [e, tr] of pending) {
    epScore += tr.r;
    replay.push([tr.s, tr.a, tr.r, null, true]);
  }
  if (epScore > best.score) {
    best.score = epScore; best.ep = ep;
  }
  if (ep % 25 === 0 || ep === EPS) {
    const avg = epScore / (epRounds || 1);
    console.log(`[ep ${ep}] score=${epScore.toFixed(1)} rounds=${epRounds} kills=${totalKills} eps=${eps.toFixed(3)} replay=${replay.size} best=${best.score.toFixed(1)}@${best.ep}`);
  }
  if (ep % 100 === 0 || ep === EPS) {
    const out = path.join(path.dirname(require.resolve('../package.json')), 'train', 'checkpoints');
    fs.mkdirSync(out, { recursive: true });
    const f = path.join(out, `net_${STYLE}_ep${ep}.json`);
    fs.writeFileSync(f, JSON.stringify({ ...net.toJSON(), style: STYLE, ep, score: best.score, seed: SEED }));
    console.log(`  checkpoint → ${f}`);
  }
}

console.log(`[dqn-train] done. style=${STYLE} best=${best.score.toFixed(1)}@ep${best.ep} totalKills=${totalKills} wins=${totalWins}/${totalRounds}`);
