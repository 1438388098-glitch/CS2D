import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { loadMap, findMapById, getMap } from '../src/map.js';
import { botObjectiveRaw } from '../src/ai/decisions.js';
import { seedWorld } from '../src/ctx.js';
seedWorld(20260804);

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

loadMap(findMapById('dust2'));
const game = createGame({ team: 't', diff: 'normal', bots: 5, mapId: 'dust2', seed: 20260804 });
game.seed = 20260804;
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, game);
startMatch(game);
seedWorld(20260804);
game.state = 'LIVE'; game.roundTime = 45; game.time = 10; game.freezeT = 0; game.buyTime = 0;

const t = game.entities.find((e) => e.bot && e.team === 't' && !e.hasBomb);
t.archetype = 'rifler';
t.role = game.tAttackSite;
t.laneIdx = 0;
t.rushMode = false;
t.vanguard = false;
t.lastKnown = null; t.lastKnownT = 99; t.aimTarget = null; t.memory = []; t.hasBomb = false;
for (const e of game.entities) {
  if (e === t) continue;
  e.dead = true;
}
const ct = game.entities.find((e) => e.team === 'ct');
ct.dead = false;
ct.x = t.x + 800; ct.y = t.y;

const obj = botObjectiveRaw(t, game);
const ctSpawn = getMap().spawns.ct[0];
ok('T hunts CT half in 1v1', !!obj && Math.hypot(obj.x - ctSpawn.x, obj.y - ctSpawn.y) < 800,
  obj ? 'd=' + Math.round(Math.hypot(obj.x - ctSpawn.x, obj.y - ctSpawn.y)) : 'null');

console.log('ai-hunt: all PASS');
process.exit(failed ? 1 : 0);
