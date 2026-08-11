import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';

const game = createGame();
assert.ok(game.spectate, 'game should initialize spectate state');
assert.equal(game.spectate.speed, 1, 'death spectate should default to 1x');
game.spectate.speed = 8;
assert.equal(game.spectate.speed, 8, 'death spectate speed should be mutable');

console.log('game-spectate: all PASS');
