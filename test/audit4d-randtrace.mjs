// 审计 4d：定位残余不确定源 —— 追踪 seed 与 rand 流
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld, ctx } = await import('../src/ctx.js');
const BASE = ROUND.DURATION;
ROUND.DURATION = 40;

function run(seed, maxTicks = 300) {
  const realMath = Math.random;
  Math.random = () => ((seed % 100000) / 100000);
  const g = createGame({ team: 'ct', diff: 'hell', hellLevel: 10, bots: 5, mapId: 'dust2' });
  g.seed = seed;
  g.ui = null;
  startMatch(g);
  Math.random = realMath;
  g.player.bot = true;
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  const draws = [];
  let kills = 0;
  for (let t = 0; t < maxTicks; t++) {
    update(g, 1 / 60);
    if (t < 5) draws.push(ctx.rand()); // 每帧取 1 个流值
    kills = g.entities.reduce((s, e) => s + (e.kills || 0), 0);
    if (kills > 0) break;
  }
  return { seed: g.seed, draws, kills, t: g.time.toFixed(2) };
}

const a = run(4242);
const b = run(4242);
console.log('A: seed=', a.seed, ' kills=', a.kills, ' draws=', a.draws.map((d) => d.toFixed(6)).join(','));
console.log('B: seed=', b.seed, ' kills=', b.kills, ' draws=', b.draws.map((d) => d.toFixed(6)).join(','));
console.log('rand 流', JSON.stringify(a.draws) === JSON.stringify(b.draws) ? '一致' : '不一致!');
ROUND.DURATION = BASE;
process.exit(0);
