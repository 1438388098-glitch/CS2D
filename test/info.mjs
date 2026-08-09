import assert from 'node:assert/strict';
import { seedWorld } from '../src/ctx.js';
import { MSG, initInfo, report, query, prune, intelBroadcast, queryAll } from '../src/info.js';

seedWorld(20260804);

const game = { time: 2, mapW: 2400, mapH: 1800 };
initInfo(game);

const bot = {
  bot: true,
  team: 't',
  x: 100,
  y: 100,
  lastReport: {},
  aiParams: { intel: false }
};

report(game, bot, MSG.SIGHT, 200, 300);
assert.equal(game.info.t.length, 1, 'report should write to team info board');
assert.equal(game.commLog.length, 1, 'report should append comm log');

report(game, bot, MSG.SIGHT, 400, 500);
assert.equal(game.info.t.length, 1, 'report should respect per-type cooldown');

const seen = query(game, bot);
assert.equal(seen.type, MSG.SIGHT, 'query should return reported message type');
assert.equal(seen.age, 0, 'query should report fresh message age');

game.time = 20;
prune(game);
assert.equal(game.info.t.length, 0, 'prune should remove expired messages');
assert.equal(query(game, bot), null, 'query should ignore expired messages');

game.time = 0;
const intelBot = { bot: true, team: 't', x: 0, y: 0, lastReport: {}, aiParams: { intel: true } };
report(game, intelBot, MSG.SIGHT, 10, 20);
const precise = query(game, intelBot);
assert.equal(precise.x, 10, 'intel messages should keep exact coordinates');
assert.equal(precise.y, 20, 'intel messages should keep exact y coordinate');

intelBroadcast(game, 'ct-1', 80, 90);
assert.equal(queryAll(game, intelBot).length, 1, 'queryAll should return intel stream entries');
assert.deepEqual(MSG, { SIGHT: 'sight', DMG: 'dmg', SHOT: 'shot', KILL: 'kill', FOCUS: 'focus' }, 'MSG constants should stay stable');

console.log('info: all PASS');
