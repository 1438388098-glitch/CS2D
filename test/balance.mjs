import { createGame, startMatch, update } from '../src/game.js';

const MAPS = ['dust2', 'canal', 'metro'];
const RUNS = 8;
let ok = true;
for (const map of MAPS) {
  let t = 0, c = 0;
  for (let r = 0; r < RUNS; r++) {
    const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: map });
    g.ui = null;
    startMatch(g);
    g.player.dead = true;
    let prevR = g.round, done = 0;
    for (let i = 0; i < 40000; i++) {
      update(g, 1 / 30);
      if (g.state === 'BUY' && g.buyTime > 1) { g.buyTime = 0.8; g.freezeT = 0.3; }
      if (g.round !== prevR) { prevR = g.round; done++; if (done >= 8) break; }
    }
    t += g.score.T; c += g.score.CT;
  }
  const total = t + c;
  const rate = total ? Math.round((t / total) * 100) : 50;
  const pass = total >= 16 && rate >= 40 && rate <= 60;
  console.log(`balance [${map}] T ${t}:${c} 鑳滅巼 ${rate}% ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
