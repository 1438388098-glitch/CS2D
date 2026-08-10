// 逐帧逐字段指纹：定位同 seed 两次运行最早的字段级分歧
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');

const BASE = ROUND.DURATION;
ROUND.DURATION = 40;

function fullFp(g) {
  const idx = new Map(g.entities.map((e, i) => [e, i]));
  return g.entities.map((e, i) => {
    const w = e.weapons ? e.weapons.primary || e.weapons.secondary || '-' : '-';
    const aimI = e.aimTarget ? idx.get(e.aimTarget) : -1;
    return `${e.team}#${i}:${Math.round(e.x)},${Math.round(e.y)},${e.hp.toFixed(4)},${e.angle.toFixed(5)},r:${(e.reaction || 0).toFixed(4)},cd:${(e.fireCd || 0).toFixed(4)},rec:${(e.recoil || 0).toFixed(4)},ss:${e.shotStreak || 0},aim:${aimI},p:${e.path ? e.path.length : 0},${w}`;
  }).join('|') + `|${g.score.T}:${g.score.CT}|t=${g.time.toFixed(4)}|r=${g.round}`;
}

function runTrace(seed) {
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
  for (let t = 0; t < 300000; t++) {
    update(g, 1 / 60);
    trace.push(fullFp(g));
    if (g.round !== prevRound) { prevRound = g.round; if (g.round - 1 >= 2) break; }
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
console.log(`帧数 A=${a.trace.length} B=${b.trace.length} 首分歧帧 #${firstDiff} (t=${(firstDiff / 60).toFixed(3)}s)`);
if (firstDiff >= 0) {
  const fa = a.trace[firstDiff].split('|');
  const fb = b.trace[firstDiff].split('|');
  for (let i = 0; i < fa.length; i++) {
    if (fa[i] !== fb[i]) console.log(`  字段${i} A=[${fa[i]}] B=[${fb[i]}]`);
  }
  const fpa = a.trace[Math.max(0, firstDiff - 1)].split('|');
  const fpb = b.trace[Math.max(0, firstDiff - 1)].split('|');
  for (let i = 0; i < fpa.length; i++) {
    if (fpa[i] !== fpb[i]) console.log(`  前帧字段${i} A=[${fpa[i]}] B=[${fpb[i]}]`);
  }
}
ROUND.DURATION = BASE;
process.exit(0);
