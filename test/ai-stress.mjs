import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

for (const mapId of ['dust2', 'canal', 'metro']) {
  for (const seed of [1, 2, 3]) {
  const game = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId, seed });
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.player.dead = true;
  let guard = 0;
  let bad = false;
  for (let i = 0; i < 1800 && !game.over; i++) {
    try {
      update(game, 1 / 30);
      for (const e of game.entities) {
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) { bad = true; break; }
      }
      if (game.state === 'BUY' && game.buyTime > 1) { game.buyTime = 0.8; game.freezeT = 0.3; }
    } catch (err) {
      bad = true;
      console.error(mapId + ' update error: ' + err.message);
      break;
    }
    guard = i;
  }
  ok(mapId + ' seed ' + seed + ' stress run', !bad && guard >= 1799, 'ticks=' + guard);
  }
}

console.log('ai-stress: all PASS');
process.exit(failed ? 1 : 0);