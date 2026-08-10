import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { loadMap, findMapById, getMap, pathTo, followPath } from '../src/map.js';
import { angDiff } from '../src/utils.js';
import { updateBots } from '../src/ai/core.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

function setup(dx) {
  loadMap(findMapById('dust2'));
  const game = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: 'dust2' });
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.state = 'LIVE'; game.roundTime = 30; game.time = 10; game.freezeT = 0; game.buyTime = 0;
  const ct = game.entities.find((e) => e.bot && e.team === 'ct' && e.ctRoamer);
  ct.lastKnown = { x: ct.x + dx, y: ct.y };
  ct.lastKnownT = 0;
  ct.aimTarget = null;
  ct.hasBomb = false;
  ct.walking = false;
  for (const e of game.entities) if (e.team === 't') e.dead = true;
  return { game, ct };
}

{
  const { game, ct } = setup(300);
  updateBots(game, 1 / 30);
  ok('near intel approaches quietly', ct.walking === true && ct.lastKnownT > 0, 'walking=' + ct.walking);
}

{
  const { game, ct } = setup(600);
  updateBots(game, 1 / 30);
  ok('far intel keeps normal speed', ct.walking === false, 'walking=' + ct.walking);
}

{
  const { game, ct } = setup(300);
  pathTo(ct, ct.x + 400, ct.y);
  if (!ct.path || !ct.path.length) throw new Error('path not created');
  const m = getMap();
  const wp = ct.path[0];
  const wx = wp.x * m.tile + m.tile / 2;
  const wy = wp.y * m.tile + m.tile / 2;
  const expected = Math.atan2(wy - ct.y, wx - ct.x);
  ct.angle = 0;
  followPath(ct, 1 / 30, 235, 0, 0.5);
  ok('path scan changes angle', Math.abs(angDiff(ct.angle, expected)) > 0.05, 'angle=' + ct.angle.toFixed(3));
}

console.log('ai-stalk: all PASS');
process.exit(failed ? 1 : 0);