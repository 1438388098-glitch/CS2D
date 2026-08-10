import { loadMap, getMap, findMapById } from '../src/map.js';
import { ctHotSite } from '../src/ai/decisions.js';
import { plantBomb, defuseBomb } from '../src/bomb.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

loadMap(findMapById('dust2'));
const m = getMap();
const a = m.sites.A;
const b = m.sites.B;
const game = {
  time: 10,
  info: { ct: [], t: [] },
  hotSiteCache: null,
  entities: [{ team: 't', x: a.cx, y: a.cy, dead: false, lastShot: 0 }]
};

ok('no shared intel means no hot site', ctHotSite(game) === null);

game.hotSiteCache = null;
game.time = 10.1;
game.info.ct.push({ type: 'sight', x: a.cx, y: a.cy, t: 10.05 }, { type: 'sight', x: a.cx, y: a.cy, t: 10.05 });
ok('shared intel marks A hot', ctHotSite(game) === 'A');

game.hotSiteCache = null;
game.time = 10.2;
game.info.ct = [{ type: 'sight', x: b.cx, y: b.cy, t: 10.15 }, { type: 'sight', x: b.cx, y: b.cy, t: 10.15 }];
ok('shared intel marks B hot', ctHotSite(game) === 'B');

game.hotSiteCache = null;
game.time = 10.3;
game.info.ct = [{ type: 'shot', x: a.cx, y: a.cy, t: 10.25 }, { type: 'shot', x: a.cx, y: a.cy, t: 10.25 }];
ok('shot-only hot marked', ctHotSite(game) === 'A' && game.hotSiteShotOnly === true);
game.hotSiteCache = null;
game.time = 10.4;
game.info.ct = [{ type: 'sight', x: a.cx, y: a.cy, t: 10.35 }, { type: 'shot', x: a.cx, y: a.cy, t: 10.35 }];
ok('sight hot not shot-only', ctHotSite(game) === 'A' && game.hotSiteShotOnly === false);

{
  const g = { bomb: null, dt: 1 / 30, time: 10, lastSound: null };
  const e = { hasBomb: true, x: a.cx, y: a.cy, plantT: 0, plantSoundAt: 0, team: 't', plants: 0, money: 0 };
  for (let i = 0; i < 16; i++) plantBomb(e, g);
  ok('plant progress sound', !!g.lastSound && g.lastSound.radius > 500 && g.lastSound.t === 10, JSON.stringify(g.lastSound));
}
{
  const g = { bomb: { planted: true, x: b.cx, y: b.cy, timer: 30, defusing: false, defuseT: 0 }, dt: 1 / 30, time: 11, lastSound: null };
  const e = { team: 'ct', weapons: { kit: true }, defuseT: 0, defuses: 0 };
  for (let i = 0; i < 16; i++) defuseBomb(e, g);
  ok('defuse progress sound', !!g.lastSound && g.lastSound.radius > 500 && g.lastSound.t === 11, JSON.stringify(g.lastSound));
}

console.log('ai-fairness: all PASS');
process.exit(failed ? 1 : 0);