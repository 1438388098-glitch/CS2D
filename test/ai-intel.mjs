import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { loadMap, findMapById } from '../src/map.js';
import { updateBots } from '../src/ai/core.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

function setup(lastKnownT) {
  loadMap(findMapById('dust2'));
  const game = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: 'dust2' });
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.state = 'LIVE'; game.roundTime = 30; game.time = 10; game.freezeT = 0; game.buyTime = 0;
  const ct = game.entities.find((e) => e.bot && e.team === 'ct' && e.ctRoamer);
  ct.lastKnown = { x: ct.x + 300, y: ct.y };
  ct.lastKnownT = lastKnownT;
  ct.aimTarget = null;
  ct.hasBomb = false;
  ct.walking = false;
  for (const e of game.entities) if (e.team === 't') e.dead = true;
  return { game, ct };
}

{
  const { game, ct } = setup(0.5);
  updateBots(game, 1 / 30);
  ok('fresh intel survives', !!ct.lastKnown && ct.lastKnownT > 0.5, 'age=' + ct.lastKnownT);
}

{
  const { game, ct } = setup(4.5);
  updateBots(game, 1 / 30);
  ok('stale intel is cleared', ct.lastKnown === null && ct.lastKnownT === 99, 'age=' + ct.lastKnownT);
}

console.log('ai-intel: all PASS');
process.exit(failed ? 1 : 0);