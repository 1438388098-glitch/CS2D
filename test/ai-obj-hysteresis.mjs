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

const e = g.entities.find((x) => x.bot && x.team === 'ct');
assert.ok(e, 'game should create a bot');
for (const o of g.entities) {
  if (o.bot && o !== e) o.dead = true;
}
e.role = 'a';
e.highPointT = 99;
e.holdShiftT = 999;
e.hasBomb = false;
e.aimTarget = null;
e.lastKnown = null;
e.lastKnownT = 99;
e.lastHear = null;
e.memory = [];

const original = botObjective(e, g);
assert.ok(original && Number.isFinite(original.x) && Number.isFinite(original.y), 'objective should exist');
e.x = original.x - 20;
e.y = original.y;
e.objCache = { x: original.x, y: original.y };
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

e.x += 10;
g.info.ct.length = 0;
g.info.t.length = 0;
g.hotSiteCache = { tick: -1, site: null };
g.hotSiteShotOnly = false;
g.bomb = { x: e.x, y: e.y, planted: false, dropped: true, site: null, timer: 0, defusing: false, defuseT: 0 };
e.objKey = '';
e.objAt = g.time * 1000;
updateBots(g, 1 / 60);
assert.equal(e.objKey, 'd|A|-|0|-', 'bomb drop should produce a real objective key change');
assert.equal(e.vx, 0, 'bot should stay stopped when a real objective key changes while still near');
assert.equal(e.vy, 0, 'bot should stay stopped when a real objective key changes while still near');

g.info.ct.push({ type: 'sight', x: e.x + 300, y: e.y, t: g.time, srcX: e.x, srcY: e.y, intel: false, igl: false, conf: 1 });
const speeds = [];
for (let i = 0; i < 10; i++) {
  updateBots(g, 1 / 60);
  speeds.push(Math.hypot(e.vx, e.vy));
}
assert.ok(speeds.every((s) => s < 20), 'holding bot should ignore shared intel instead of rebuilding a path every frame: ' + speeds.join(','));

e.x += 70;
updateBots(g, 1 / 60);
assert.ok(Math.hypot(e.vx, e.vy) > 20, 'bot should resume once it leaves the resume hysteresis band');

console.log('ai-obj-hysteresis: all PASS');
