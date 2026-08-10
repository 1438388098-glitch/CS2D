import { loadMap, getMap, findMapById } from '../src/map.js';
import { retreatPoint } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

loadMap(findMapById('dust2'));
const m = getMap();
const spawns = m.spawns.ct;
if (spawns.length < 2) {
  console.log('ai-retreat: all PASS (needs multi-spawn map)');
  process.exit(0);
}

const e = { team: 'ct', x: spawns[0].x + 200, y: spawns[0].y + 200, lastKnown: null };
const enemy1 = { team: 't', x: spawns[0].x + 10, y: spawns[0].y + 10, dead: false };
const enemy2 = { team: 't', x: spawns[1].x + 500, y: spawns[1].y + 500, dead: false };
const game = { entities: [e, enemy1, enemy2] };
const pt = retreatPoint(e, game);
const minD = (s) => Math.min(Math.hypot(s.x - enemy1.x, s.y - enemy1.y), Math.hypot(s.x - enemy2.x, s.y - enemy2.y));
const expected = spawns.reduce((a, b) => minD(b) > minD(a) ? b : a);
ok('retreat sneaks', pt.sneak === true);
ok('retreat picks safest spawn', Math.abs(pt.x - expected.x) < 1 && Math.abs(pt.y - expected.y) < 1,
  'pt=' + Math.round(pt.x) + ',' + Math.round(pt.y) + ' expected=' + Math.round(expected.x) + ',' + Math.round(expected.y));

console.log('ai-retreat: all PASS');
process.exit(failed ? 1 : 0);