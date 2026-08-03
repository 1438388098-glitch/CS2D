import { installStubs } from '../test/stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { ROUND } = await import('../src/config.js');
const { decodeGenome } = await import('../src/ai-genome.js');
const { seedWorld } = await import('../src/ctx.js');

export const EVAL_ROUNDS = 6;
export const WIN_WEIGHT = 6;
export const PLANT_WEIGHT = 3;
export const KILL_WEIGHT = 1.2;

let bonusInited = false;
function initBonus() {
  if (bonusInited) return;
  ROUND.DURATION = 40;
  bonusInited = true;
}

// 可复现评估：以 seed 播种世界随机流（utils.rand/ctx.rand 全部确定性）
// 同 genome + 同 seed → 严格相同结果（回放/对比/断点续训前提）
// spec 专项塑形（地狱阶梯 H4-H7）：
//   { save: 保枪纪律奖励(残局劣势存活), eco: 经济纪律奖励(买甲), flash: 闪光配合奖励, rotate: 转点反制奖励 }
// opponent：指定 CT 对手参数（H11 军备竞赛：对手 = H1-H10 挡位参数），null → normal 基线
// tExtras：T 队 aiParams 扩展（H11：{ oppModel, netWeights } 决策网络 + 对手建模）
export function runEval(genome, mapId = 'dust2', rounds = EVAL_ROUNDS, seed = 0, spec = null, opponent = null, tExtras = null) {
  initBonus();
  seedWorld(seed);
  const decoded = decodeGenome(genome);
  const params = tExtras ? { ...decoded, ...tExtras } : decoded;
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId });
  g.seed = seed;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  for (const e of g.entities) {
    if (e.team === 't' && e.bot) e.aiParams = params;
    if (e.team === 'ct') e.aiParams = opponent;
  }
  g.buyTime = 0.3;
  g.freezeT = 0.2;

  let score = 0;
  let tkills = 0;
  let plants = 0;
  let prevRound = g.round;
  let prevDiff = g.score.T - g.score.CT;
  let prevTK = 0;
  let plantedThisRound = false;
  let roundsDone = 0;
  const MAX_TICK = rounds * 6000 + 12000;

  // 专项塑形状态
  let prevSwitchedAt = 0;
  let flashCount = 0;
  let ecoRounds = 0;

  for (let t = 0; t < MAX_TICK; t++) {
    update(g, 1 / 60);
    if (g.round !== prevRound) {
      prevRound = g.round;
      plantedThisRound = false;
      roundsDone++;
      if (spec && spec.save) {
        // 保枪纪律：残局（T 存活人数 ≤ CT 且回合已安弹/或 CT 多打少）存活到回合末 → 奖励
        const tAlive = g.entities.filter((e) => e.team === 't' && !e.dead).length;
        const ctAlive = g.entities.filter((e) => e.team === 'ct' && !e.dead).length;
        if (tAlive > 0 && tAlive <= ctAlive) score += tAlive * spec.save;
      }
      if (spec && spec.eco) {
        // 经济纪律：回合结束时 T bot 有甲（买了甲活着回来）
        let armored = 0;
        for (const e of g.entities) if (e.team === 't' && !e.dead && e.armor > 0) armored++;
        score += armored * spec.eco;
        ecoRounds++;
      }
      if (roundsDone >= rounds) break;
    }
    if (!plantedThisRound && g.bomb && g.bomb.planted) {
      plantedThisRound = true;
      score += PLANT_WEIGHT;
      plants++;
    }
    let tk = 0;
    for (const e of g.entities) if (e.team === 't') tk += e.kills;
    if (tk > prevTK) { score += (tk - prevTK) * KILL_WEIGHT; tkills += tk - prevTK; prevTK = tk; }
    if (g.state === 'END' && g.endedT > 1.2) {
      const diff = g.score.T - g.score.CT;
      if (diff > prevDiff) {
        score += WIN_WEIGHT;
        // 转点反制：转点（tSwitchedAt 本回合触发过）且本回合赢 → 重奖
        if (spec && spec.rotate && g.tSwitchedAt > prevSwitchedAt) score += spec.rotate;
      }
      prevDiff = diff;
      g.endedT = 0.01;
    }
    if (spec && spec.rotate && g.tSwitchedAt > prevSwitchedAt) {
      prevSwitchedAt = g.tSwitchedAt;
      score += spec.rotate * 0.3; // 转点行为本身小奖励（不依赖胜负）
    }
    if (spec && spec.flash) {
      // 闪光配合：统计训练队闪光使用（usedNadeRound 变化）
      let fc = 0;
      for (const e of g.entities) if (e.team === 't' && !e.dead && e.usedNadeRound === g.round && e.lastNadeT > g.time - 0.5) fc++;
      if (fc > flashCount) { score += (fc - flashCount) * spec.flash; flashCount = fc; }
    }
    if (g.over || g.score.T >= ROUND.MATCH_WIN || g.score.CT >= ROUND.MATCH_WIN) break;
  }
  const alive = g.entities.filter((e) => e.team === 't' && !e.dead).length;
  score += alive * 0.5;
  return { fitness: score, roundsDone, tkills, plants, alive, tScore: g.score.T, ctScore: g.score.CT };
}
