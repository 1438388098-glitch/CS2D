// 审计 4b：逐帧指纹定位同 seed 两次模拟的分歧点
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');

const BASE = ROUND.DURATION;
ROUND.DURATION = 40;

function fingerprint(g) {
  return g.entities.map((e) => `${e.team}:${Math.round(e.x)},${Math.round(e.y)},${e.hp},${e.dead ? 'D' : 'A'},${e.angle.toFixed(2)}`).join('|') +
    `|${g.score.T}:${g.score.CT}|t=${g.time.toFixed(3)}|r=${g.round}|bomb=${g.bomb ? (g.bomb.planted ? 1 : 0) : 0}`;
}

function runTrace(seed, roundsLimit = 2) {
  seedWorld(seed);
  const g = createGame({ team: 'ct', diff: 'hell', hellLevel: 10, bots: 5, mapId: 'dust2' });
  g.seed = seed;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  const trace = [];
  let prevRound = g.round;
  for (let t = 0; t < 600000; t++) {
    update(g, 1 / 60);
    trace.push(fingerprint(g));
    if (g.round !== prevRound) {
      prevRound = g.round;
      if (g.round - 1 >= roundsLimit) break;
    }
    if (g.over) break;
  }
  return { g, trace };
}

const a = runTrace(4242);
const b = runTrace(4242);
let firstDiff = -1;
for (let i = 0; i < Math.min(a.trace.length, b.trace.length); i++) {
  if (a.trace[i] !== b.trace[i]) { firstDiff = i; break; }
}
console.log(`帧数: A=${a.trace.length} B=${b.trace.length} 首个分歧帧: ${firstDiff >= 0 ? '#' + firstDiff + ' (t=' + (firstDiff / 60).toFixed(3) + 's)' : '无（一致）'}`);
if (firstDiff >= 0) {
  const i = firstDiff;
  console.log('A: ' + a.trace[i]);
  console.log('B: ' + b.trace[i]);
  const fa = a.trace[Math.max(0, i - 1)];
  const fb = b.trace[Math.max(0, i - 1)];
  console.log('A-1: ' + fa);
  console.log('B-1: ' + fb);
}
ROUND.DURATION = BASE;
process.exit(0);
