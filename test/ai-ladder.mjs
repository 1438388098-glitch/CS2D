import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

const runs = [];
for (const mapId of ['dust2', 'metro', 'forge']) {
  for (const [diff, hellLevel] of [['easy', null], ['normal', null], ['hard', null], ['hell', 11]]) {
    runs.push({ mapId, diff, hellLevel });
  }
}

for (const r of runs) {
  const opts = { team: 'ct', diff: r.diff, bots: 5, mapId: r.mapId, seed: 1 };
  if (r.hellLevel) opts.hellLevel = r.hellLevel;
  const game = createGame(opts);
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.player.dead = true;
  let guard = 0;
  let bad = false;
  for (let i = 0; i < 1200 && !game.over; i++) {
    try {
      update(game, 1 / 30);
      for (const e of game.entities) {
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) { bad = true; break; }
      }
      if (game.state === 'BUY' && game.buyTime > 1) { game.buyTime = 0.8; game.freezeT = 0.3; }
    } catch (err) {
      bad = true;
      console.error(r.mapId + ' ' + r.diff + ' update error: ' + err.message);
      break;
    }
    guard = i;
  }
  const label = r.mapId + ' ' + r.diff + (r.hellLevel ? ' H' + r.hellLevel : '');
  ok(label + ' ladder run', !bad && guard >= 1199, 'ticks=' + guard);
}

console.log('ai-ladder: all PASS');
process.exit(failed ? 1 : 0);
