import assert from 'node:assert/strict';
import { createGame, startMatch } from '../src/game.js';
import { getMap } from '../src/map.js';
import { updateBots } from '../src/ai/core.js';
import { botObjective } from '../src/ai/decisions.js';
import { shouldKeepPath } from '../src/ai/rules.js';

const g = createGame({ mapId: 'dust2', bots: 1, team: 'ct', mode: 'classic', seed: 7 });
startMatch(g);
g.state = 'LIVE';
g.freezeT = 0;
g.buyTime = 0;
g.roundTime = 1;
g.time = 1;
g.tAttackSite = 'A';

const e = g.entities.find((x) => x.bot && x.team === 'ct');
assert.ok(e, 'game should create a ct bot');
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

const spawn = getMap().spawns.ct[0];
e.x = spawn.x;
e.y = spawn.y;
const obj = botObjective(e, g);
assert.ok(obj && Number.isFinite(obj.x) && Number.isFinite(obj.y), 'objective should exist');
assert.ok(Math.hypot(obj.x - e.x, obj.y - e.y) > 120, 'test bot should start far enough to follow a real path');

e.path = null;
e.pathI = 0;
e.repathT = 0;
e._loopWatch = null;
e.navTime = 0;
e.stuckT = 0;
e.lastSample = { x: e.x, y: e.y };
e.vx = 0;
e.vy = 0;

updateBots(g, 1 / 60);
assert.ok(e.path && e.path.length > 0, 'bot should plan a path toward its objective');
assert.equal(e.repathT, 0, 'successful replan should not arm a stale repath cooldown');

const T = getMap().tile || 16;
const last = e.path[e.path.length - 1];
const goalDist = Math.hypot(last.x * T + T / 2 - e.x, last.y * T + T / 2 - e.y);
const startX = e.x;
const startY = e.y;
e.repathT = 0.5;
e._loopWatch = { t: e.navTime || 0, goal: goalDist };
e.x += 40;

shouldKeepPath(e, startX, startY, e.x, e.y);
assert.equal(e.path, null, 'loop watchdog should invalidate the stale path in this scenario');

updateBots(g, 1 / 60);
assert.ok(e.path && e.path.length > 0, 'invalidated path should be rebuilt on the next frame instead of waiting on repathT');
assert.ok(Math.hypot(e.vx, e.vy) > 20, 'bot should start moving immediately after an invalidated path is rebuilt');

console.log('ai-path-continuity: all PASS');
