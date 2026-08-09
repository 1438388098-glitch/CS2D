import assert from 'node:assert/strict';
import { WEAPONS, PRICES, ECONOMY, ROUND, DIFF, resolveDiff } from '../src/config.js';

const KINDS = new Set(['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'knife']);
const MOVE_KEYS = ['stand', 'walk', 'run', 'crouch'];

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

const weaponIds = Object.keys(WEAPONS);
assert.ok(weaponIds.length >= 10, `expected >=10 weapons, got ${weaponIds.length}`);

for (const id of weaponIds) {
  const w = WEAPONS[id];
  assert.ok(w && typeof w === 'object', `${id} weapon def should exist`);
  assert.ok(KINDS.has(w.kind), `${id} kind should be known`);
  assert.ok(isFiniteNumber(w.price) && w.price >= 0, `${id} price invalid`);
  assert.ok(isFiniteNumber(w.dmg) && w.dmg > 0, `${id} dmg invalid`);
  assert.ok(isFiniteNumber(w.rpm) && w.rpm > 0, `${id} rpm invalid`);
  assert.ok(isFiniteNumber(w.mag) && w.mag >= 0, `${id} mag invalid`);
  assert.ok(isFiniteNumber(w.reserve) && w.reserve >= 0, `${id} reserve invalid`);
  assert.ok(isFiniteNumber(w.reload) && w.reload >= 0, `${id} reload invalid`);
  assert.ok(isFiniteNumber(w.spread) && w.spread >= 0, `${id} spread invalid`);
  assert.ok(isFiniteNumber(w.speed) && w.speed > 0, `${id} speed invalid`);
  assert.ok(isFiniteNumber(w.range) && w.range > 0, `${id} range invalid`);
  if (w.auto !== undefined) assert.equal(typeof w.auto, 'boolean', `${id} auto invalid`);
  if (w.scoped !== undefined) assert.equal(typeof w.scoped, 'boolean', `${id} scoped invalid`);
  if (w.pellets !== undefined) {
    assert.ok(Number.isInteger(w.pellets) && w.pellets > 0, `${id} pellets invalid`);
  }
  if (w.ballistic) {
    assert.ok(isFiniteNumber(w.ballistic.first) && w.ballistic.first > 0, `${id} ballistic.first invalid`);
    assert.ok(isFiniteNumber(w.ballistic.perShot) && w.ballistic.perShot >= 0, `${id} ballistic.perShot invalid`);
    assert.ok(isFiniteNumber(w.ballistic.max) && w.ballistic.max >= w.ballistic.first, `${id} ballistic.max invalid`);
    assert.ok(isFiniteNumber(w.ballistic.recover) && w.ballistic.recover >= 0, `${id} ballistic.recover invalid`);
    if (w.ballistic.move) {
      for (const key of MOVE_KEYS) {
        assert.ok(isFiniteNumber(w.ballistic.move[key]) && w.ballistic.move[key] > 0, `${id} ballistic.move.${key} invalid`);
      }
    }
  }
  if (w.falloff) {
    assert.ok(isFiniteNumber(w.falloff.start) && w.falloff.start > 0, `${id} falloff.start invalid`);
    assert.ok(isFiniteNumber(w.falloff.end) && w.falloff.end > w.falloff.start, `${id} falloff.end invalid`);
    assert.ok(isFiniteNumber(w.falloff.min) && w.falloff.min > 0 && w.falloff.min <= 1, `${id} falloff.min invalid`);
  }
}

for (const [key, value] of Object.entries(PRICES)) {
  assert.ok(isFiniteNumber(value) && value >= 0, `PRICES.${key} invalid`);
}

assert.ok(ECONOMY.START_MONEY > 0, 'ECONOMY.START_MONEY invalid');
assert.ok(ECONOMY.MONEY_CAP > ECONOMY.START_MONEY, 'ECONOMY.MONEY_CAP invalid');
for (const [key, value] of Object.entries(ECONOMY)) {
  if (key === 'LOSS_BONUS') continue;
  assert.ok(isFiniteNumber(value) && value >= 0, `ECONOMY.${key} invalid`);
}
assert.ok(ECONOMY.LOSS_BONUS.length >= 4, 'ECONOMY.LOSS_BONUS invalid');
for (const v of ECONOMY.LOSS_BONUS) assert.ok(isFiniteNumber(v) && v >= 0, 'ECONOMY.LOSS_BONUS value invalid');

for (const [key, value] of Object.entries(ROUND)) {
  assert.ok(isFiniteNumber(value) && value > 0, `ROUND.${key} invalid`);
}

for (const key of ['easy', 'normal', 'hard']) {
  const d = DIFF[key];
  for (const field of ['react', 'spreadMult', 'view', 'strafe', 'aimSpeed', 'idealMin', 'idealMax', 'rushChance', 'rotateChance', 'saveChance']) {
    assert.ok(isFiniteNumber(d[field]) && d[field] >= 0, `${key}.${field} invalid`);
  }
  assert.ok(d.idealMax >= d.idealMin, `${key}.idealMax should be >= idealMin`);
}

for (const level of [1, 6, 12]) {
  const d = resolveDiff('hell', level);
  assert.ok(d && d.note, `hell level ${level} should resolve`);
  assert.ok(isFiniteNumber(d.react) && d.react > 0, `hell level ${level} react invalid`);
}

console.log('config-validation: all PASS');
