import { weaponHearRadius, hearGunshot, hearWorldSound, hearStep } from '../src/ai/senses.js';
import { BOT_AI } from '../src/config.js';
import { loadMap, findMapById, los } from '../src/map.js';
import { installMechTestMap } from './map-fixture.js';
installMechTestMap();
loadMap(findMapById('mech-test'));

function ok(name, cond) {
  if (!cond) throw new Error('senses: ' + name + ' FAIL');
  console.log('senses: ' + name + ' PASS');
}

const e = { x: 0, y: 0, anchorIdx: 0, lastKnown: null, lastKnownT: 99, memory: [] };
const game = { time: 10, lastSound: null, lastStep: null };

ok('sniper louder than pistol', weaponHearRadius({ kind: 'sniper' }) > weaponHearRadius({ kind: 'pistol' }));
ok('rifle louder than smg', weaponHearRadius({ kind: 'rifle' }) > weaponHearRadius({ kind: 'smg' }));

const shooter = { x: 300, y: 0 };
ok('near gunshot heard', hearGunshot(e, shooter, game, { kind: 'rifle' }) === true);
ok('hearing stores direction', !!e.lastHear && e.lastHear.angle !== undefined && e.lastHear.dist === 300);
ok('hearing stores approximate memory', !!e.lastKnown && Math.hypot(e.lastKnown.x - 300, e.lastKnown.y - 0) < 120);
ok('hearing base tuned', weaponHearRadius({ kind: 'rifle' }) === Math.round(BOT_AI.HEAR_RADIUS * 0.9 * 1.15));
const blurE = { x: 0, y: 0, anchorIdx: 2, lastKnown: null, lastKnownT: 99, memory: [] };
hearGunshot(blurE, shooter, game, { kind: 'rifle' });
ok('gunshot memory stays approximate', Math.hypot(blurE.lastKnown.x - 300, blurE.lastKnown.y) < 180);

const farE = { x: 0, y: 0, anchorIdx: 1, lastKnown: null, lastKnownT: 99, memory: [] };
const farShooter = { x: 5000, y: 0 };
ok('far gunshot ignored', hearGunshot(farE, farShooter, game, { kind: 'pistol' }) === false);
ok('open los true', los(game, 60, 60, 300, 60) === true);
ok('wall blocks los', los(game, 60, 20, 300, 20) === false);
const wallE = { x: 60, y: 20, anchorIdx: 2, lastKnown: null, lastKnownT: 99, memory: [] };
const wallShooter = { x: 300, y: 20 };
ok('muffled gunshot heard through wall', hearGunshot(wallE, wallShooter, game, { kind: 'rifle' }) === true);

game.lastSound = { x: 200, y: 0, t: 10, radius: 1000, conf: 0.5 };
ok('world sound heard', hearWorldSound(e, game) === true);
game.lastSound = { x: 200, y: 0, t: 9.2, radius: 1000, conf: 0.5 };
ok('stale world sound ignored', hearWorldSound(e, game) === false);
game.lastSound = { x: 5000, y: 0, t: 10, radius: 1000 };
ok('far world sound ignored', hearWorldSound(e, game) === false);

game.lastStep = { x: 100, y: 0, t: 10, walk: true, team: 't' };
const stepE = { x: 0, y: 0, team: 'ct', anchorIdx: 0, lastKnown: null, lastKnownT: 99, memory: [] };
ok('walk step heard', hearStep(stepE, game) === true);
game.lastStep = { x: 5000, y: 0, t: 10, walk: true, team: 't' };
ok('far step ignored', hearStep(stepE, game) === false);

console.log('senses: all PASS');
