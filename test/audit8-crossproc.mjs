// 审计 8：单进程单次运行输出伤害事件指纹（跨进程对比用）
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');

ROUND.DURATION = 40;
const seed = 4242;
seedWorld(seed);
const g = createGame({ team: 'ct', diff: 'hell', hellLevel: 10, bots: 5, mapId: 'dust2' });
g.seed = seed;
g.ui = null;
startMatch(g);
g.player.bot = true;
g.buyTime = 0.3;
g.freezeT = 0.2;

const out = [];
let prevRound = g.round;
for (let t = 0; t < 60000; t++) {
  const before = g.entities.map((e) => e.hp);
  if (t < 3) out.push(`t${t} money: ` + g.entities.map((e) => `${e.team}${e.money}`).join(','));
  update(g, 1 / 60);
  g.entities.forEach((e, i) => {
    if (before[i] !== e.hp && e.lastDmgFrom) {
      out.push(`f${t} v${i} ${e.hp.toFixed(10)} s${e.lastDmgFrom.x.toFixed(9)},${e.lastDmgFrom.y.toFixed(9)} a${e.lastDmgFrom.angle.toFixed(9)} p${e.x.toFixed(9)},${e.y.toFixed(9)}`);
    }
  });
  if (g.round !== prevRound) { prevRound = g.round; if (g.round - 1 >= 1) break; }
  if (g.over) break;
}
const r2 = g.entities.map((e) => `${e.team}${e.money}`).join(',');
out.push(`round2-start money: ${r2}`);
for (let i = 0; i < Math.min(12, out.length); i++) console.log(out[i]);
console.log('TOTAL', out.length);
process.exit(0);
