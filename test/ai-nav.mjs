import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import '../src/modes.js';
import '../src/duel.js';
import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

const maps = ['dust2', 'canal', 'metro', 'duel-pit', 'duel-alley', 'duel-forge'];
for (const mapId of maps) {
  for (const seed of [1, 2, 3]) {
    const bots = mapId.startsWith('duel') ? 1 : 2;
    const game = createGame({ team: 't', diff: 'normal', bots, mapId, seed });
    const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
    initUi(document, canvasStub, game);
    startMatch(game);
    game.player.dead = true;
    const prev = new Map();
    const dist = new Map();
    for (const e of game.entities) if (e.bot && !e.dead) { prev.set(e.name, { x: e.x, y: e.y }); dist.set(e.name, 0); }
    let bad = false;
    for (let i = 0; i < 900 && !game.over; i++) {
      try {
        update(game, 1 / 30);
      } catch (err) {
        bad = true;
        console.error(mapId + ' seed ' + seed + ' update error: ' + err.message);
        break;
      }
      for (const e of game.entities) {
        if (!e.bot || e.dead) continue;
        const p = prev.get(e.name);
        if (p) {
          dist.set(e.name, (dist.get(e.name) || 0) + Math.hypot(e.x - p.x, e.y - p.y));
          prev.set(e.name, { x: e.x, y: e.y });
        }
      }
      if (game.state === 'BUY' && game.buyTime > 1) { game.buyTime = 0.8; game.freezeT = 0.3; }
    }
    const max = Math.max(0, ...dist.values());
    ok(mapId + ' seed ' + seed + ' bots move', !bad && max > 300, 'max=' + Math.round(max));
  }
}

console.log('ai-nav: all PASS');
process.exit(failed ? 1 : 0);
