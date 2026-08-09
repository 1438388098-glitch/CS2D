import assert from 'node:assert/strict';
import { loadMap, findMapById, followPath } from '../src/map.js';

loadMap(findMapById('dust2'));

function stuckBot() {
  return {
    x: 400,
    y: 800,
    lastSample: { x: 400, y: 800 },
    path: [{ x: 18, y: 20 }],
    pathI: 0,
    stuckT: 2,
    stuckEscapes: 0,
    lastRerouteAt: -1,
    anchorIdx: 0
  };
}

const bot = stuckBot();
const ok = followPath(bot, 1 / 30, 235);
assert.equal(ok, true, 'followPath should stay active after rule-based reroute');
assert.equal(bot.stuckEscapes, 1, 'long-stuck bot should be rerouted once');
assert.ok(bot.lastRerouteAt >= 0, 'reroute should record cooldown timestamp');
assert.equal(bot.stuckT, 0, 'reroute should clear the stuck timer');
assert.ok(Array.isArray(bot.path) && bot.path.length > 0, 'reroute should build a fresh path');

const beforeEsc = bot.stuckEscapes;
const beforeRerouteAt = bot.lastRerouteAt;
bot.stuckT = 2;
bot.lastSample = { x: bot.x, y: bot.y };
const cooldownOk = followPath(bot, 1 / 30, 235);
assert.equal(cooldownOk, false, 'followPath should give up when cooldown blocks another reroute');
assert.equal(bot.stuckEscapes, beforeEsc, 'cooldown should prevent repeated stuck reroutes');
assert.equal(bot.lastRerouteAt, beforeRerouteAt, 'cooldown should not refresh the reroute timestamp');

const moving = stuckBot();
moving.x = 470;
moving.lastSample = { x: 400, y: 800 };
const movingOk = followPath(moving, 1 / 30, 235);
assert.equal(movingOk, true, 'moving bot should keep its current path');
assert.equal(moving.stuckEscapes, 0, 'movement should not count as stuck');
assert.ok(moving.stuckT < 2, 'movement should reduce the stuck timer');

console.log('path-stuck-integration: all PASS');
