// 审计 4e：长跑指纹 + rand 流对齐，定位首个分歧帧与分歧字段
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld, ctx } = await import('../src/ctx.js');
const BASE = ROUND.DURATION;
ROUND.DURATION = 40;

function fp(g) {
  return g.entities.map((e) => `${e.team}${e.dead ? 'D' : 'A'}:${Math.round(e.x)},${Math.round(e.y)}:${e.hp}:${e.angle.toFixed(3)}:${e.aimTarget ? 'T' : 't'}`).join('|') +
    `|S${g.score.T}:${g.score.CT}|R${g.round}|${g.time.toFixed(3)}`;
}

function run(seed, maxTicks = 6000) {
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
  const traces = [];
  const randSamples = [];
  for (let t = 0; t < maxTicks; t++) {
    update(g, 1 / 60);
    if (t % 30 === 0) randSamples.push(ctx.rand());
    if (t % 10 === 0) traces.push(fp(g));
    if (g.round >= 2 && g.state === 'END' && g.endedT < 1.9) break;
  }
  return { traces, randSamples, seed: g.seed, score: g.score };
}

const a = run(4242);
const b = run(4242);
console.log('seed used:', a.seed, b.seed, a.seed === b.seed ? '✓' : '✗');
console.log('rand 采样流一致:', JSON.stringify(a.randSamples) === JSON.stringify(b.randSamples) ? '✓' : '✗ 不一致!');
let d = -1;
for (let i = 0; i < Math.min(a.traces.length, b.traces.length); i++) {
  if (a.traces[i] !== b.traces[i]) { d = i; break; }
}
console.log('首个分歧样本:', d === -1 ? '无（一致）' : '#' + d);
if (d >= 0) {
  console.log('A:', a.traces[d]);
  console.log('B:', b.traces[d]);
}
console.log('比分: A', a.score.T + ':' + a.score.CT, ' B', b.score.T + ':' + b.score.CT);
ROUND.DURATION = BASE;
process.exit(0);
