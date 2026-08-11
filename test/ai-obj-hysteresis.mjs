import assert from 'node:assert/strict';
import { createGame, startMatch } from '../src/game.js';
import { botObjective } from '../src/ai/decisions.js';
import { updateBots } from '../src/ai/core.js';

const g = createGame({ mapId: 'dust2', bots: 1, team: 'ct', mode: 'classic', seed: 7 });
startMatch(g);
g.state = 'LIVE';
g.freezeT = 0;
g.buyTime = 0;
g.roundTime = 6;
g.time = 1;
g.tAttackSite = 'A';

const e = g.entities.find((x) => x.bot);
assert.ok(e, 'game should create a bot');
e.role = 'a';
e.hasBomb = false;
e.aimTarget = null;
e.lastKnown = null;
e.lastKnownT = 99;
e.lastHear = null;
e.memory = [];

const original = botObjective(e, g);
assert.ok(original && Number.isFinite(original.x) && Number.isFinite(original.y), 'objective should exist');
e.objCache = { x: e.x + 23, y: e.y };
e.cornerAimT = undefined;
e.prefireCount = 0;
e.objAt = g.time * 1000;

updateBots(g, 1 / 60);
assert.equal(e.vx, 0, 'bot should stop inside the arrival radius');
assert.equal(e.vy, 0, 'bot should stop inside the arrival radius');

e.x += 10;
updateBots(g, 1 / 60);
assert.equal(e.vx, 0, 'bot should stay stopped inside the resume hysteresis band');
assert.equal(e.vy, 0, 'bot should stay stopped inside the resume hysteresis band');

e.x += 70;
updateBots(g, 1 / 60);
assert.ok(Math.hypot(e.vx, e.vy) > 20, 'bot should resume once it leaves the resume hysteresis band');

console.log('ai-obj-hysteresis: all PASS');
