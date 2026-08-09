import assert from 'node:assert/strict';
import {
  ballisticOf,
  moveFactor,
  effectiveSpread,
  updateShotStreak,
  registerShot,
  headshotChance,
  distanceFalloff
} from '../src/ballistic.js';

const weapon = {
  spread: 2,
  ballistic: {
    first: 0.5,
    perShot: 0.2,
    max: 3,
    recover: 1.8,
    move: { stand: 1, walk: 0.5, run: 2, crouch: 0.75 }
  }
};

assert.equal(ballisticOf(weapon), weapon.ballistic, 'ballisticOf should return weapon ballistic config');
assert.equal(moveFactor(weapon, { vx: 0, vy: 0, crouched: false }), 1, 'standing still should use stand factor');
assert.equal(moveFactor(weapon, { vx: 20, vy: 0, crouched: false }), 0.5, 'slow movement should use walk factor');
assert.equal(moveFactor(weapon, { vx: 100, vy: 0, crouched: false, walking: false }), 2, 'fast movement should use run factor');
assert.equal(moveFactor(weapon, { vx: 0, vy: 0, crouched: true }), 0.75, 'standing while crouching should use crouch factor');
assert.equal(moveFactor(weapon, { vx: 100, vy: 0, crouched: true, walking: false }), 2, 'moving while crouching should lose the crouch accuracy bonus');
assert.equal(moveFactor(weapon, { vx: 20, vy: 0, crouched: true, walking: true }), 0.75, 'slow crouch movement should keep crouch accuracy');
assert.equal(moveFactor(weapon, { vx: 0, vy: 0, crouched: false, airborneT: 0.1 }), 2.4, 'airborne state should use the airborne penalty');

assert.equal(effectiveSpread(weapon, { vx: 0, vy: 0, shotStreak: 0, crouched: false, spreadMult: 1 }), 1, 'first shot spread should use first and stand factors');
assert.equal(effectiveSpread(weapon, { vx: 0, vy: 0, shotStreak: 2, crouched: false, spreadMult: 1 }), 2.8, 'streak spread should scale with perShot');

const shot = { shotStreak: 2, shotStreakT: 0.1 };
updateShotStreak(shot, 0.2);
assert.equal(shot.shotStreak, 0, 'streak should reset after timer drains');
registerShot(shot);
assert.equal(shot.shotStreak, 1, 'registerShot should increment streak');
assert.equal(shot.shotStreakT, 0.5, 'registerShot should restore streak timer');

assert.equal(headshotChance({ kind: 'sniper', range: 900 }, { rad: 20 }, 0, 0), 0.55, 'point-blank sniper should use max headshot chance');
const shotgunClose = headshotChance({ kind: 'shotgun', range: 900 }, { rad: 20 }, 1000, 0);
assert.ok(shotgunClose >= 0.03 && shotgunClose < 0.1, 'badly aimed shotgun should stay at headshot floor');

assert.equal(distanceFalloff({ kind: 'pistol' }, 400), 1, 'pistol falloff should start at 1');
assert.equal(distanceFalloff({ kind: 'pistol' }, 900), 0.75, 'pistol falloff should end at configured minimum');
assert.equal(distanceFalloff({ falloff: { start: 100, end: 200, min: 0.5 } }, 150), 0.75, 'custom falloff should interpolate between bounds');

console.log('ballistic: all PASS');
