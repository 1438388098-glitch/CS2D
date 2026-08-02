import { installStubs } from '../test/stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { ROUND } = await import('../src/config.js');
ROUND.DURATION = 30;

let allPass = true;
for (const mapId of ['dust2', 'snow', 'depot', 'canal', 'metro']) {
  for (const diff of ['easy', 'normal', 'hard', 'hell']) {
    const g = createGame({ team: 't', diff, bots: 5, mapId });
    g.ui = null;
    startMatch(g);
    g.buyTime = 0.2;
    g.freezeT = 0.1;
    let rounds = 0;
    let prevR = g.round;
    for (let t = 0; t < 30000; t++) {
      update(g, 1 / 60);
      if (g.round !== prevR) { prevR = g.round; rounds++; if (rounds >= 3) break; }
      if (g.state === 'END' && g.endedT > 1) g.endedT = 0.01;
      if (g.over) break;
    }
    const ok = rounds >= 2 || g.over;
    if (!ok) allPass = false;
    console.log(`${mapId} ${diff}: ${rounds} 回合  T ${g.score.T}:${g.score.CT}  玩家${g.player.dead ? '阵亡' : '存活'}${g.over ? ' (整场结束)' : ''}${ok ? '' : '  [FAIL 回合数不足]'}`);
  }
}
console.log('hell-battle: ' + (allPass ? 'PASS' : 'FAIL'));
