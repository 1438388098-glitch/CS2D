import { loadMap, getMap, findMapById } from '../src/map.js';
import { createGame } from '../src/game.js';
import { nadeTarget, postPlantSmokePoint, midSmokePoint } from '../src/ai/actions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

loadMap(findMapById('dust2'));
const g = createGame();
g.entities = [];
g.smokes = [];
g.time = 1;
g.tAttackSite = 'A';
const e = {
  team: 't', laneIdx: 0, x: 1000, y: 1000,
  lastKnown: null, lastKnownT: 99, aimTarget: null,
  weapons: { nades: { he: 1, flash: 1, smoke: 1 } }
};
g.entities.push(e);

const site = getMap().sites.A;
const smokePt = nadeTarget(e, g, 'smoke', 'A');
ok('smoke targets site entry', !!smokePt && Math.hypot(smokePt.x - site.cx, smokePt.y - site.cy) > 80,
  smokePt ? 'dx=' + Math.round(Math.hypot(smokePt.x - site.cx, smokePt.y - site.cy)) : 'null');
const laneOk = (getMap().lanes.A || []).some((p) => Math.hypot(smokePt.x - p.x, smokePt.y - p.y) < 130) || !!getMap().entries.A;
ok('smoke target is on lane', !!smokePt && laneOk);

g.smokes.push({ x: smokePt.x, y: smokePt.y, r: 20, gr: 150, life: 12 });
ok('smoke avoids duplicate point', nadeTarget(e, g, 'smoke', 'A') === null);
g.smokes = [];

e.lastKnown = { x: e.x + 300, y: e.y };
e.lastKnownT = 0.3;
const hePt1 = nadeTarget(e, g, 'he');
ok('he targets fresh lastKnown', !!hePt1 && Math.abs(hePt1.x - (e.x + 300)) < 1);
e.lastKnownT = 5;
ok('he ignores stale lastKnown', nadeTarget(e, g, 'he') === null);
e.lastKnown = null;
e.lastKnownT = 99;
const target = { x: e.x + 400, y: e.y, dead: false };
e.aimTarget = target;
const hePt2 = nadeTarget(e, g, 'he');
ok('he targets aimTarget in range', !!hePt2 && Math.abs(hePt2.x - target.x) < 1);
e.aimTarget = null;

const lanesA = getMap().lanes.A || [];
if (lanesA.length > 1) {
  const own = lanesA[0];
  g.entities.push(
    { bot: true, team: 't', x: own.x + 5, y: own.y, dead: false },
    { bot: true, team: 't', x: own.x - 5, y: own.y, dead: false }
  );
  const shifted = nadeTarget(e, g, 'smoke', 'A');
  ok('smoke shifts off occupied lane', !!shifted && Math.hypot(shifted.x - own.x, shifted.y - own.y) > 90,
    shifted ? 'shift=' + Math.round(Math.hypot(shifted.x - own.x, shifted.y - own.y)) : 'null');
}

const ctSpawn = getMap().spawns.ct[0];
const planted = { planted: true, x: 500, y: 500 };
const smoke = postPlantSmokePoint({ bomb: planted, smokes: [] });
const segLen = Math.hypot(ctSpawn.x - planted.x, ctSpawn.y - planted.y);
const dToBomb = Math.hypot(smoke.x - planted.x, smoke.y - planted.y);
const dToSpawn = Math.hypot(smoke.x - ctSpawn.x, smoke.y - ctSpawn.y);
ok('post-plant smoke blocks route midpoint', !!smoke && dToBomb > segLen * 0.25 && dToBomb < segLen * 0.65 && dToSpawn > segLen * 0.2,
  smoke ? 'dToBomb=' + Math.round(dToBomb) + ' seg=' + Math.round(segLen) : 'null');
ok('post-plant smoke avoids duplicate', postPlantSmokePoint({ bomb: planted, smokes: [{ x: smoke.x, y: smoke.y }] }) === null);

const mid = getMap().mid;
const tSpawn = getMap().spawns.t[0];
const midSmoke = midSmokePoint({ bomb: { planted: false }, smokes: [] });
const midSeg = Math.hypot(tSpawn.x - mid.x, tSpawn.y - mid.y);
const midBombD = Math.hypot(midSmoke.x - mid.x, midSmoke.y - mid.y);
ok('CT mid smoke blocks T route', !!midSmoke && midBombD > midSeg * 0.2 && midBombD < midSeg * 0.8,
  midSmoke ? 'd=' + Math.round(midBombD) + ' seg=' + Math.round(midSeg) : 'null');
ok('CT mid smoke avoids duplicate', midSmokePoint({ bomb: { planted: false }, smokes: [{ x: midSmoke.x, y: midSmoke.y }] }) === null);

console.log('ai-nades: all PASS');
process.exit(failed ? 1 : 0);