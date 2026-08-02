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
export function runEval(genome, mapId = 'dust2', rounds = EVAL_ROUNDS, seed = 0) {
  initBonus();
  seedWorld(seed);
  const params = decodeGenome(genome);
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId });
  g.seed = seed;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  for (const e of g.entities) {
    if (e.team === 't' && e.bot) e.aiParams = params;
    if (e.team === 'ct') e.aiParams = null;
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

  for (let t = 0; t < MAX_TICK; t++) {
    update(g, 1 / 60);
    if (g.round !== prevRound) {
      prevRound = g.round;
      plantedThisRound = false;
      roundsDone++;
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
      if (diff > prevDiff) score += WIN_WEIGHT;
      prevDiff = diff;
      g.endedT = 0.01;
    }
    if (g.over || g.score.T >= ROUND.MATCH_WIN || g.score.CT >= ROUND.MATCH_WIN) break;
  }
  const alive = g.entities.filter((e) => e.team === 't' && !e.dead).length;
  score += alive * 0.5;
  return { fitness: score, roundsDone, tkills, plants, alive, tScore: g.score.T, ctScore: g.score.CT };
}
