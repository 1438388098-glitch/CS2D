import assert from 'node:assert/strict';
import { quickThrow } from '../src/input.js';

function makeEnt(nade) {
  return {
    dead: false,
    fireCd: 0,
    weapons: { primary: null, secondary: 'glock', knife: 'knife', nades: { he: 1, flash: 1, smoke: 1 } },
    slot: 'secondary',
    lastSlot: 'knife',
    x: 100,
    y: 100,
    angle: 0
  };
}

function makeGame() {
  return {
    grenades: [],
    entities: [],
    smokes: [],
    player: null,
    time: 0
  };
}

for (const nade of ['he', 'flash', 'smoke']) {
  const e = makeEnt(nade);
  const game = makeGame();
  quickThrow(e, nade, game);
  assert.equal(game.grenades.length, 1, `${nade} should be thrown`);
  assert.equal(game.grenades[0].kind, nade, `${nade} grenade kind should match`);
  assert.ok(e.fireCd > 0, `${nade} should enter fire cooldown`);
  assert.equal(e.slot, 'secondary', `${nade} should return to last weapon`);
}

console.log('quick-throw: all PASS');
