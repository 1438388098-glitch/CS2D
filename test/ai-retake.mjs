import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { loadMap, findMapById } from '../src/map.js';
import { botObjectiveRaw } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

loadMap(findMapById('dust2'));
const game = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: 'dust2' });
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, game);
startMatch(game);
game.bomb = { planted: true, defusing: true, x: 500, y: 500, site: 'A', timer: 30 };
game.state = 'LIVE'; game.roundTime = 30; game.time = 10;

const ct = game.entities.filter((e) => e.bot && e.team === 'ct');
const defuser = ct[0];
defuser.defuseT = 1;
defuser.weapons.kit = true;
defuser.x = game.bomb.x; defuser.y = game.bomb.y;
const guard = ct[1];
guard.x = game.bomb.x - 100; guard.y = game.bomb.y;
guard.aimTarget = null; guard.lastKnown = null; guard.lastKnownT = 99; guard.memory = [];

const obj = botObjectiveRaw(guard, game);
ok('non-defuser guards near bomb', !!obj && Math.hypot(obj.x - game.bomb.x, obj.y - game.bomb.y) < 200,
  obj ? 'd=' + Math.round(Math.hypot(obj.x - game.bomb.x, obj.y - game.bomb.y)) : 'null');

console.log('ai-retake: all PASS');
process.exit(failed ? 1 : 0);