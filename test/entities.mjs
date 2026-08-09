import assert from 'node:assert/strict';
import { WEAPONS } from '../src/config.js';
import { seedWorld } from '../src/ctx.js';
import {
  createEntity,
  spawnEntity,
  defaultPistol,
  weaponDef,
  wkey,
  ammoFor,
  reserveFor
} from '../src/entities.js';

seedWorld(20260804);

const t = createEntity('t', true);
assert.equal(t.team, 't', 'bot entity should keep team');
assert.equal(t.bot, true, 'bot flag should be preserved');
assert.equal(t.name, 'Rex', 'bot names should rotate from BOT_NAMES');
assert.equal(t.hp, 100, 'new entity should start at full hp');
assert.equal(t.slot, 'secondary', 'new entity should default to secondary slot');

const human = createEntity('ct', false);
assert.equal(human.bot, false, 'human entity should not be a bot');
assert.equal(human.name, 'You', 'human entity should use player name');
assert.equal(defaultPistol('ct'), 'usp', 'CT should default to USP');
assert.equal(defaultPistol('t'), 'glock', 'T should default to Glock');

const spawns = [{ x: 120, y: 240 }, { x: 480, y: 600 }];
spawnEntity(human, spawns, 1);
assert.equal(human.x, 480, 'spawnEntity should honor preferIdx');
assert.equal(human.y, 600, 'spawnEntity should set preferred y');
assert.equal(human.dead, false, 'spawn should revive entity');
assert.equal(human.hp, 100, 'spawn should restore hp');
assert.equal(human.weapons.secondary, 'usp', 'spawn should fill default CT pistol');

human.weapons.primary = 'ak';
human.slot = 'primary';
assert.equal(wkey(human), 'ak', 'wkey should return active primary');
assert.equal(weaponDef(human), WEAPONS.ak, 'weaponDef should resolve active primary');
assert.equal(ammoFor(human), WEAPONS.ak.mag, 'ammoFor should lazily initialize magazine');
assert.equal(reserveFor(human), WEAPONS.ak.reserve, 'reserveFor should lazily initialize reserve ammo');

human.slot = 'knife';
assert.equal(wkey(human), 'knife', 'wkey should return knife when active');
assert.equal(weaponDef(human), WEAPONS.knife, 'weaponDef should resolve knife');

console.log('entities: all PASS');
