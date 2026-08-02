import { createGame, startMatch, update } from './src/game.js';
import { ctx } from './src/ctx.js';

const map = process.argv[2] || 'dust2';
const reasons = {};
let total = 0;
for (let r = 0; r < 5; r++) {
  const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: map });
  g.ui = null;
  startMatch(g);
  g.player.dead = true;
  const off = ctx.bus.on('banner', (p) => {
    reasons[p.t1 + '|' + p.t2] = (reasons[p.t1 + '|' + p.t2] || 0) + 1;
    total++;
  });
  let prevR = g.round, done = 0;
  for (let i = 0; i < 50000; i++) {
    update(g, 1 / 30);
    if (g.state === 'BUY' && g.buyTime > 1) { g.buyTime = 0.8; g.freezeT = 0.3; }
    if (g.round !== prevR) { prevR = g.round; done++; if (done >= 8) break; }
  }
  ctx.bus.off('banner', off);
}
console.log(map, 'rounds', total);
for (const k of Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])) {
  console.log(' ', reasons[k], k);
}
