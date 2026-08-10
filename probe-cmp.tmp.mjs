// 多种子评估：3 个 seedOffset × 96 回合 = 288 回合/权重，可靠对比
import { installStubs, registerUiIds } from './test/stubdom.js';
installStubs();
registerUiIds();
import { createGame, startMatch, update } from './src/game.js';
import { loadMap, getMap, findMapById } from './src/map.js';
import { seedWorld, mulberry32 } from './src/ctx.js';
import { resolveDiff } from './src/config.js';
import { DQN } from './src/dqn.js';
import { netObsTeam, NET_ACTIONS, NET_LANES } from './src/ai/decisions.js';
import fs from 'fs';
import * as cfg from './src/config.js';

const ROUNDS = 96;
const SEEDS = [900, 913, 926];
loadMap(findMapById('dust2'));
const ctBase = resolveDiff('normal');
const A = getMap().sites.A, B = getMap().sites.B;

function evalOnce(weightsJson, seedOffset) {
  let rng = mulberry32(20260804 + seedOffset);
  const oldRand = Math.random;
  globalThis.Math.random = () => rng();
  const net = weightsJson ? DQN.fromJSON(weightsJson) : null;
  const decS = net ? (net.output >= 36 ? 0.3 : 0.6) : 0.6;
  let wins = 0, plants = 0, clumpFrames = 0, liveFrames = 0, laneSpreadSum = 0, laneN = 0;
  for (let r = 0; r < ROUNDS; r++) {
    seedWorld((r + 1) * 7919 + 101 + seedOffset * 31);
    const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: 'dust2' });
    g.seed = r + 1;
    const ecoMode = (r + 1) % 3;
    const tMoney = ecoMode === 0 ? 10000 : (ecoMode === 1 ? 10000 : 800);
    const cMoney = ecoMode === 0 ? 800 : (ecoMode === 1 ? 10000 : 800);
    for (const e of g.entities) {
      if (!e.bot) continue;
      e.money = e.team === 't' ? tMoney : cMoney;
    }
    startMatch(g);
    g.player.dead = true;
    g.roundDur = 35;
    g.buyTime = 0.3;
    g.freezeT = 0.2;
    for (const e of g.entities) {
      if (!e.bot) continue;
      e.aiParams = e.team === 'ct' ? { ...ctBase } : { ...resolveDiff('normal') };
      e.netAct = undefined; e.netAt = 0; e.netLane = undefined; e.netPace = undefined;
      if (e.team === 't') e.rushMode = false;
    }
    let lastRound = g.round, prevTScore = 0, sawPlant = false;
    const maxTicks = Math.ceil(47 * 30) + 1200;
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
        if (g.bomb && g.bomb.planted) sawPlant = true;
        for (const e of tb) {
          if (e.netAt === undefined || g.time - e.netAt >= decS) {
            if (net) {
              const obs = netObsTeam(e, g);
              if (obs && Array.isArray(obs) && obs.length === 33) {
                const q = net.forward(obs);
                let best = 0;
                for (let k = 1; k < q.length; k++) if (q[k] > q[best]) best = k;
                e.netAct = NET_ACTIONS[best % NET_ACTIONS.length];
                e.netLane = NET_LANES[Math.floor(best / NET_ACTIONS.length) % NET_LANES.length];
                e.netAt = g.time;
              }
            }
            e.netAt = g.time;
          }
        }
      }
      if (g.round !== lastRound) {
        if (g.score.T > prevTScore) wins++;
        if (sawPlant) plants++;
        lastRound = g.round;
        prevTScore = g.score.T;
        break;
      }
    }
  }
  globalThis.Math.random = oldRand;
  return {
    winRate: Math.round(wins / ROUNDS * 100), wins, plants,
    clumpPct: Math.round(clumpFrames / Math.max(1, liveFrames) * 100),
    laneSpread: laneN ? (laneSpreadSum / laneN).toFixed(2) : '-'
  };
}

function evalWeights(weightsJson, label) {
  const evs = SEEDS.map((s) => evalOnce(weightsJson, s));
  const avgW = Math.round(evs.reduce((a, e) => a + e.winRate, 0) / evs.length);
  const avgP = Math.round(evs.reduce((a, e) => a + e.plants, 0) / evs.length);
  console.log(`${label}: 对规则 平均${avgW}% [${evs.map((e) => e.winRate + '%').join('/')}] | 安弹${avgP} | 分路度${evs.map((e) => e.laneSpread).join('/')}`);
  return avgW;
}

console.log('=== 多种子评估（3 × 96 回合）===');
// 基线
evalWeights(null, '基线(纯规则T vs 规则CT)     ');
// H12 现役（18 动作 49% 单种子）
const h12 = cfg.resolveDiff('hell', 12);
evalWeights(h12.netWeights.__default, 'H12 现役(18动作)         ');
// 池权重
for (const f of fs.readdirSync('pool').filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(fs.readFileSync('pool/' + f, 'utf8'));
  evalWeights(raw.weights || raw, '池 ' + f.replace('champ-', '').replace('.json', ''));
}
// 当前导出
if (fs.existsSync('net-weights-trained.json')) {
  const raw = JSON.parse(fs.readFileSync('net-weights-trained.json', 'utf8'));
  evalWeights(raw.weights || raw, '当前导出(36动作终评)     ');
}
