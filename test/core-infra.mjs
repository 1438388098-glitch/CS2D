import assert from 'node:assert/strict';
import { createBus } from '../src/bus.js';
import { createContext, mulberry32, seedWorld, ctx as globalCtx } from '../src/ctx.js';
import {
  registerWeapon,
  getWeapon,
  getWeapons,
  registerMap,
  getMapDef,
  getMaps,
  registerMode,
  getMode,
  getModes,
  hasMode
} from '../src/registry.js';
import { ARCHETYPES, rollPersonality, assignArchetypes } from '../src/persona.js';

function sequence(rand, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(rand());
  return out;
}

const bus = createBus();
const seen = [];
const unsubscribe = bus.on('event', (payload) => seen.push(payload));
bus.emit('event', 1);
assert.deepEqual(seen, [1], 'bus should deliver payload to handler');
unsubscribe();
bus.emit('event', 2);
assert.deepEqual(seen, [1], 'bus unsubscribe should remove handler');
bus.clear();
bus.emit('event', 3);
assert.deepEqual(seen, [1], 'bus clear should remove all handlers');

let handlerError = '';
const originalConsoleError = console.error;
console.error = (...args) => {
  handlerError = args.map(String).join(' ');
};
try {
  const errorBus = createBus();
  const calls = [];
  errorBus.on('boom', () => {
    throw new Error('boom');
  });
  errorBus.on('boom', () => calls.push('ok'));
  assert.doesNotThrow(() => errorBus.emit('boom', null), 'bus should isolate handler errors');
  assert.deepEqual(calls, ['ok'], 'bus should continue after a failing handler');
  assert.match(handlerError, /handler error/, 'bus should report handler errors');
} finally {
  console.error = originalConsoleError;
}

const a = mulberry32(123);
const b = mulberry32(123);
assert.deepEqual(sequence(a, 8), sequence(b, 8), 'mulberry32 should be deterministic for same seed');
for (const value of sequence(mulberry32(123), 32)) {
  assert.ok(value >= 0 && value < 1, 'mulberry32 should return values in [0, 1)');
}
assert.notDeepEqual(sequence(mulberry32(1), 8), sequence(mulberry32(2), 8), 'mulberry32 should differ across seeds');

const customCtx = createContext({ rand: () => 0.5 });
assert.equal(customCtx.rand(), 0.5, 'createContext should accept custom rand');
assert.equal(customCtx.seed, null, 'createContext should default seed to null');
assert.equal(customCtx.getService('missing'), null, 'createContext should return null for unknown service');
customCtx.setService('audio', { play: 'play' });
assert.equal(customCtx.getService('audio').play, 'play', 'createContext service should be retrievable');
assert.equal(customCtx.service, customCtx.services, 'createContext service getter should alias services');

const seededA = createContext({ seed: 123 });
const seededB = createContext({ seed: 123 });
assert.equal(seededA.seed, 123, 'createContext should keep provided seed');
assert.deepEqual(sequence(seededA.rand, 8), sequence(seededB.rand, 8), 'createContext seeded rand should be deterministic');

const savedSeed = globalCtx.seed;
const savedRand = globalCtx.rand;
try {
  seedWorld(42);
  const worldSeq = sequence(globalCtx.rand, 8);
  seedWorld(42);
  assert.deepEqual(sequence(globalCtx.rand, 8), worldSeq, 'seedWorld should replay the same sequence');
  assert.equal(globalCtx.seed, 42, 'seedWorld should store the unsigned seed');
} finally {
  globalCtx.seed = savedSeed;
  globalCtx.rand = savedRand;
}

const weaponId = registerWeapon('infra-test-weapon', { price: 0, dmg: 1 });
assert.equal(weaponId, 'infra-test-weapon', 'registerWeapon should return weapon id');
assert.deepEqual(getWeapon(weaponId), { price: 0, dmg: 1 }, 'registerWeapon should store weapon stats');
assert.ok(Object.isFrozen(getWeapon(weaponId)), 'registerWeapon should freeze stored stats');
assert.equal(getWeapon('missing-weapon'), null, 'getWeapon should return null for unknown id');
assert.ok(getWeapons().has(weaponId), 'getWeapons should include registered weapon');
assert.throws(() => registerWeapon(), /invalid args/, 'registerWeapon should reject missing id');
assert.throws(() => registerWeapon('x'), /invalid args/, 'registerWeapon should reject missing stats');

const mapId = registerMap({ id: 'infra-test-map', name: 'Infra Test Map' });
assert.equal(mapId, 'infra-test-map', 'registerMap should return map id');
assert.equal(getMapDef(mapId).name, 'Infra Test Map', 'registerMap should store map def');
assert.equal(getMapDef('missing-map'), null, 'getMapDef should return null for unknown id');
assert.ok(getMaps().has(mapId), 'getMaps should include registered map');

const modeId = registerMode({ id: 'infra-test-mode', name: 'Infra Test Mode' });
assert.equal(modeId, 'infra-test-mode', 'registerMode should return mode id');
assert.equal(getMode(modeId).name, 'Infra Test Mode', 'registerMode should store mode def');
assert.equal(getMode('missing-mode'), null, 'getMode should return null for unknown id');
assert.ok(hasMode(modeId), 'hasMode should return true for registered mode');
assert.equal(hasMode('missing-mode'), false, 'hasMode should return false for unknown id');
assert.ok(getModes().has(modeId), 'getModes should include registered mode');

const personalityA = rollPersonality(123);
const personalityB = rollPersonality(123);
assert.deepEqual(personalityA, personalityB, 'rollPersonality should be deterministic for same seed');
assert.deepEqual(Object.keys(personalityA).sort(), ['aggression', 'riskT', 'steadiness', 'teamwork'], 'rollPersonality should return four traits');
for (const value of Object.values(personalityA)) {
  assert.ok(value >= 0.3 && value <= 1.0, 'rollPersonality trait should stay in range');
}

const makeBots = (count) => Array.from({ length: count }, () => ({}));
for (const count of [1, 2, 3, 4, 5]) {
  const team = makeBots(count);
  assignArchetypes(team, 999);
  for (const bot of team) {
    assert.ok(ARCHETYPES[bot.archetype], `assigned archetype should be known for team size ${count}`);
  }
}
const emptyTeam = [];
assert.doesNotThrow(() => assignArchetypes(emptyTeam, 1), 'assignArchetypes should accept empty team');

const team2 = makeBots(2);
assignArchetypes(team2, 777);
assert.equal(team2[0].archetype, 'breacher', 'team of 2 should include a breacher');

const team3 = makeBots(3);
assignArchetypes(team3, 777);
assert.equal(team3[0].archetype, 'breacher', 'team of 3 should include a breacher');
assert.equal(team3[1].archetype, 'support', 'team of 3 should include a support');

const team5 = makeBots(5);
assignArchetypes(team5, 777);
assert.equal(team5[0].archetype, 'breacher', 'team of 5 should include a breacher');
assert.equal(team5[1].archetype, 'support', 'team of 5 should include a support');
assert.equal(team5[2].archetype, 'sniper', 'team of 5 should include a sniper');

console.log('core-infra: all PASS');
