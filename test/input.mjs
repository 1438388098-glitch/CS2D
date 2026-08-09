import assert from 'node:assert/strict';
import {
  setViewMode,
  toggleViewMode,
  switchWeapon,
  switchNade,
  setKey,
  setMouse,
  setMouseDown
} from '../src/input.js';

function makeGame(viewMode = 'top') {
  return {
    viewMode,
    input: {
      keys: {},
      mouse: { x: 0, y: 0, down: false }
    }
  };
}

function makeEnt() {
  return {
    dead: false,
    slot: 'knife',
    lastSlot: 'secondary',
    weapons: {
      primary: 'ak',
      secondary: 'glock',
      nades: { he: 1, flash: 1, smoke: 1 }
    },
    reloading: false,
    reloadT: 0,
    fireCd: 0,
    scoped: false
  };
}

const viewGame = makeGame();
setViewMode(viewGame, 'follow');
assert.equal(viewGame.viewMode, 'follow', 'setViewMode should accept valid mode');
setViewMode(viewGame, 'invalid');
assert.equal(viewGame.viewMode, 'top', 'setViewMode should fall back to top for unknown mode');

viewGame.viewMode = 'top';
toggleViewMode(viewGame);
assert.equal(viewGame.viewMode, 'follow', 'toggleViewMode should move top -> follow');
toggleViewMode(viewGame);
assert.equal(viewGame.viewMode, 'fps', 'toggleViewMode should move follow -> fps');
toggleViewMode(viewGame);
assert.equal(viewGame.viewMode, 'top', 'toggleViewMode should wrap fps -> top');

const ent = makeEnt();
switchWeapon(ent, 'primary');
assert.equal(ent.slot, 'primary', 'switchWeapon should change slot');
assert.equal(ent.lastSlot, 'knife', 'switchWeapon should remember previous slot');
assert.equal(ent.fireCd, 0.25, 'switchWeapon should enter fire cooldown');
assert.equal(ent.reloading, false, 'switchWeapon should cancel reload');
assert.equal(ent.scoped, false, 'switchWeapon should clear scope');

ent.lastSlot = 'secondary';
switchWeapon(ent, 'primary');
assert.equal(ent.lastSlot, 'secondary', 'switchWeapon should no-op when already in slot');

const noPrimary = makeEnt();
noPrimary.weapons.primary = null;
switchWeapon(noPrimary, 'primary');
assert.equal(noPrimary.slot, 'knife', 'switchWeapon should refuse missing primary');

const dead = makeEnt();
dead.dead = true;
switchWeapon(dead, 'secondary');
assert.equal(dead.slot, 'knife', 'switchWeapon should refuse dead entity');

const nadeEnt = makeEnt();
switchNade(nadeEnt, 'he');
assert.equal(nadeEnt.slot, 'nade:he', 'switchNade should enter nade slot');
assert.equal(nadeEnt.fireCd, 0.3, 'switchNade should enter fire cooldown');
assert.equal(nadeEnt.lastSlot, 'knife', 'switchNade should remember previous slot');

const noFlash = makeEnt();
noFlash.weapons.nades.flash = 0;
switchNade(noFlash, 'flash');
assert.equal(noFlash.slot, 'knife', 'switchNade should refuse empty nade');

const inputGame = makeGame();
setKey(inputGame, 'KeyW', true);
assert.equal(inputGame.input.keys.KeyW, true, 'setKey should store key state');
setMouse(inputGame, 12, 34);
assert.equal(inputGame.input.mouse.x, 12, 'setMouse should update x');
assert.equal(inputGame.input.mouse.y, 34, 'setMouse should update y');
setMouseDown(inputGame, true);
assert.equal(inputGame.input.mouse.down, true, 'setMouseDown should update mouse state');

console.log('input: all PASS');
