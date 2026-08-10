import { loadMap, getMap, findMapById } from '../src/map.js';
import { clutchPlantSite } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

loadMap(findMapById('dust2'));
const m = getMap();
const game = { roundDur: 115, roundTime: 105 };
const atB = { x: m.sites.B.cx, y: m.sites.B.cy };
ok('clutch picks closer site', clutchPlantSite(atB, game, m.sites.A) === m.sites.B);
game.roundTime = 90;
ok('normal time keeps planned site', clutchPlantSite(atB, game, m.sites.A) === m.sites.A);
game.roundTime = 105;
const atA = { x: m.sites.A.cx, y: m.sites.A.cy };
ok('already near site keeps site', clutchPlantSite(atA, game, m.sites.A) === m.sites.A);

console.log('ai-clutch: all PASS');
process.exit(failed ? 1 : 0);