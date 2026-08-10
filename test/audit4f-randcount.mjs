// 审计 4f：逐帧 rand 消耗计数，定位流分歧点
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { ROUND } = await import('../src/config.js');
const { seedWorld, ctx } = await import('../src/ctx.js');
const BASE = ROUND.DURATION;
ROUND.DURATION = 40;

function run(seed, maxTicks = 3000) {
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
  let consumed = 0;
  const inner = ctx.rand;
  ctx.rand = () => { consumed++; return inner(); };
  const perFrame = [];
  for (let t = 0; t < maxTicks; t++) {
    const before = consumed;
    update(g, 1 / 60);
    perFrame.push(consumed - before);
    if (g.round >= 1 && g.time > 5) break;
  }
  return { perFrame, seed: g.seed };
}

const a = run(4242);
const b = run(4242);
console.log('帧数:', a.perFrame.length, b.perFrame.length);
let d = -1;
for (let i = 0; i < Math.min(a.perFrame.length, b.perFrame.length); i++) {
  if (a.perFrame[i] !== b.perFrame[i]) { d = i; break; }
}
if (d === -1 && a.perFrame.length === b.perFrame.length) {
  console.log('rand 消耗逐帧一致 ✓');
} else {
  console.log('首个分歧帧: #' + d + '  A 消耗=' + a.perFrame[d] + '  B 消耗=' + b.perFrame[d]);
  console.log('前后帧 A:', a.perFrame.slice(Math.max(0, d - 3), d + 4).join(','));
  console.log('前后帧 B:', b.perFrame.slice(Math.max(0, d - 3), d + 4).join(','));
  console.log('累积 A:', a.perFrame.slice(0, d + 1).reduce((s, x) => s + x, 0), ' B:', b.perFrame.slice(0, d + 1).reduce((s, x) => s + x, 0));
}
ROUND.DURATION = BASE;
process.exit(0);
