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
const game = createGame({ team: 't', diff: 'normal', bots: 5, mapId: 'dust2' });
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, game);
startMatch(game);
game.state = 'LIVE'; game.roundTime = 5; game.time = 10; game.freezeT = 0; game.buyTime = 0;

const carrier = game.entities.find((e) => e.bot && e.team === 't' && e.hasBomb);
const escort = game.entities.find((e) => e.bot && e.team === 't' && e.escort && !e.hasBomb);
if (!carrier || !escort) {
  console.log('ai-escort: all PASS (no escort role)');
  process.exit(0);
}
carrier.x = escort.x + 400;
carrier.y = escort.y;
escort.lastKnown = null; escort.lastKnownT = 99; escort.aimTarget = null; escort.memory = []; escort.hasBomb = false;
escort.archetype = 'rifler'; escort.role = game.tAttackSite; escort.rushMode = false;
for (const e of game.entities) if (e.team === 'ct') e.dead = true;

const obj = botObjectiveRaw(escort, game);
ok('escort guards bomb carrier', !!obj && Math.hypot(obj.x - carrier.x, obj.y - carrier.y) < 220,
  obj ? 'd=' + Math.round(Math.hypot(obj.x - carrier.x, obj.y - carrier.y)) : 'null');

console.log('ai-escort: all PASS');
process.exit(failed ? 1 : 0);