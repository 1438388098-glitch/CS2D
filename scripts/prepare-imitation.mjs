// 模仿学习预训练：跑规则 T vs 规则 CT 回合，把规则 AI 的目标决策
// 按几何/语义标签分类成 6 动作，监督训练 18 维观测网络（先学会规则的分路/配合）
import { installStubs, registerUiIds } from '../test/stubdom.js';
installStubs();
registerUiIds();
import { createGame, startMatch, update } from '../src/game.js';
import { loadMap, getMap, findMapById } from '../src/map.js';
import { seedWorld, mulberry32 } from '../src/ctx.js';
import { DQN } from '../src/dqn.js';
import { resolveDiff } from '../src/config.js';
import { netObsTeam, NET_ACTIONS, botObjective } from '../src/ai/decisions.js';

const ROUNDS = parseInt(process.argv[2] || '60', 10);
const MAP = 'dust2';
let masterRng = mulberry32(20260804 + 777);
globalThis.Math.random = () => masterRng();
loadMap(findMapById(MAP));
const m = getMap();

const FAIR = resolveDiff('normal');
const net = new DQN({ input: 33, hidden: 32, output: 18 });

// 规则目标 → 动作标签（几何 + 语义标记）
function labelTarget(e, g, obj) {
  if (!obj || obj.x === undefined) return null;
  const site = g.tAttackSite === 'A' ? m.sites.A : m.sites.B;
  const other = g.tAttackSite === 'A' ? m.sites.B : m.sites.A;
  const dMain = Math.hypot(obj.x - site.cx, obj.y - site.cy);
  const dOther = Math.hypot(obj.x - other.cx, obj.y - other.cy);
  const dSpawn = m.spawns.t[0] ? Math.hypot(obj.x - m.spawns.t[0].x, obj.y - m.spawns.t[0].y) : 9999;
  // 只认带 sneak 标记的真保枪目标（retreatPoint 才有）——回合初"行进中"目标不误标 save
  if (obj.sneak && dSpawn < 600) return 'save';
  if (obj.peek && obj.nade) return 'nade';
  if (obj.peek && dMain < 700) return 'peek';
  if (dOther < dMain - 200) return 'rotate';
  if (dMain < 250) return 'push';
  return 'hold';
}

const dataset = [];
const prevDead = new Map();
let rounds = 0;
for (let r = 1; r <= ROUNDS; r++) {
  seedWorld(r * 7919 + 101);
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: MAP });
  g.seed = r;
  // 经济场景轮换（双方同经济，公平；覆盖 eco/中局/反ECO 三种战术环境）
  const ecoMode = r % 3;
  const tMoney = ecoMode === 0 ? 10000 : (ecoMode === 1 ? 10000 : 800);
  const cMoney = ecoMode === 0 ? 800 : (ecoMode === 1 ? 10000 : 800);
  for (const e of g.entities) {
    if (!e.bot) continue;
    e.money = e.team === 't' ? tMoney : cMoney;
  }
  startMatch(g);
  g.player.dead = true;
  g.roundDur = 40;
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  for (const e of g.entities) {
    if (!e.bot) continue;
    e.aiParams = { ...FAIR };
    e.netAct = undefined; e.netAt = 0;
  }
  let lastRound = g.round;
  const maxTicks = Math.ceil(52 * 30) + 1200;
  for (let i = 0; i < maxTicks; i++) {
    update(g, 1 / 30);
    if (g.state === 'LIVE') {
      for (const e of g.entities) {
        if (!e.bot || e.dead || e.team !== 't') continue;
        if (e.netAt === undefined || g.time - e.netAt >= 0.6) {
          e.netAt = g.time;
          const obs = netObsTeam(e, g);
          if (!obs || !Array.isArray(obs)) continue;
          const obj = botObjective(e, g);
          if (obj && obj.x !== undefined && Math.hypot(obj.x - e.x, obj.y - e.y) < 120) continue; // 目标=自身位置 → 无信号样本
          const label = labelTarget(e, g, obj);
          if (label !== null) {
            // 路线标签（相对当前主攻点）：role 与主攻点相同 → main，另一站点 → other，mid → mid
            const laneLbl = e.role === 'mid' ? 2 : (e.role === g.tAttackSite ? 0 : 1);
            dataset.push({ obs, a: NET_ACTIONS.indexOf(label) + laneLbl * 6, early: (g.roundTime || 0) < 12 });
          }
        }
      }
    }
    if (g.round !== lastRound) { lastRound = g.round; break; }
  }
  rounds = r;
}

console.log(`[imitation] 收集 ${dataset.length} 条规则专家样本 (${rounds} 回合)`);
const dist = {};
for (const d of dataset) dist[NET_ACTIONS[d.a]] = (dist[NET_ACTIONS[d.a]] || 0) + 1;
console.log('[imitation] 动作分布:', JSON.stringify(dist));

// 监督训练（交叉熵式：用 trainStep 的 TD 目标=1 简化近似 → 实际用分类损失）
// 简单可靠做法：对每个样本执行一步"推向标签动作"的回归（Q_target[label]=10, 其余 0）
// 加权：早期样本×3（分路关键期），稀有路线 other/mid 加重，防策略坍缩到全员 main
const LANE_W = [1, 2.5, 3];
const trainSet = [];
for (const d of dataset) {
  const reps = (d.early ? 3 : 1) * LANE_W[Math.floor(d.a / 6) % 3];
  for (let i = 0; i < Math.round(reps); i++) trainSet.push(d);
}
console.log(`[imitation] 加权后训练集 ${dataset.length} → ${trainSet.length} 条`);
const LR = 0.002;
for (let epoch = 0; epoch < 12; epoch++) {
  let loss = 0;
  for (const d of trainSet) {
    const q = net.forward(d.obs);
    for (let k = 0; k < 18; k++) {
      if (k === d.a) continue;
      // 把"错误动作"的 Q 值压向低值
      if (q[k] > q[d.a]) {
        const err = q[k] - q[d.a];
        net.trainStep(d.obs, k, -err * 2, d.obs, true);
        loss += Math.abs(err);
      }
    }
    // 提升标签动作 Q
    if (q[d.a] < 1) {
      net.trainStep(d.obs, d.a, 1.0, d.obs, true);
      loss += 1 - q[d.a];
    }
  }
  console.log(`[imitation] epoch ${epoch + 1}/8 loss ${loss.toFixed(1)}`);
}

// 验证：动作分布一致性（网络 argmax vs 专家标签）
let agree = 0;
for (const d of dataset) {
  const q = net.forward(d.obs);
  let best = 0;
  for (let k = 1; k < q.length; k++) if (q[k] > q[best]) best = k;
  if (best === d.a) agree++;
}
console.log(`[imitation] 专家一致率 ${(agree / dataset.length * 100).toFixed(1)}%`);

import fs from 'fs';
import { fileURLToPath } from 'node:url';
const outPath = fileURLToPath(new URL('../train/output/net-imitation-pretrain.json', import.meta.url));
fs.writeFileSync(outPath, JSON.stringify({
  map: MAP, rounds, samples: dataset.length,
  input: 33, hidden: 32, output: 18,
  iw: net.iw, ow: net.ow
}));
console.log('[imitation] 预训练权重 → ' + outPath);
