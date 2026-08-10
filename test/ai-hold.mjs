import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { loadMap, findMapById, getMap } from '../src/map.js';
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
const ct = game.entities.find((e) => e.bot && e.team === 'ct' && e.role === 'a');
ct.holdShiftT = -1;
ct.lastKnown = null; ct.lastKnownT = 99; ct.aimTarget = null; ct.memory = []; ct.highPointT = 999;
game.state = 'LIVE'; game.roundTime = 12; game.time = 10;
for (const e of game.entities) if (e.team === 't') e.dead = true;
const idx0 = ct.anchorIdx;
const obj = botObjectiveRaw(ct, game);
ok('CT anchor rotates after hold timer', ct.anchorIdx !== idx0 && ct.holdShiftT > 12,
  'idx=' + idx0 + '->' + ct.anchorIdx + ' next=' + Math.round(ct.holdShiftT));
ok('rotated hold objective finite', !!obj && Number.isFinite(obj.x) && Number.isFinite(obj.y));
const anchors = getMap().holds.A.anchors;
ok('rotated to another anchor', anchors.some((a) => Math.hypot(a.x - obj.x, a.y - obj.y) < 60),
  obj ? 'x=' + Math.round(obj.x) + ' y=' + Math.round(obj.y) : 'null');

console.log('ai-hold: all PASS');
process.exit(failed ? 1 : 0);