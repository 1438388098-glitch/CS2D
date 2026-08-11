import assert from 'node:assert/strict';
import { createGame, startMatch } from '../src/game.js';
import { updateBots } from '../src/ai/core.js';
import { pathTo } from '../src/map.js';

const g = createGame({ mapId: 'dust2', bots: 1, team: 'ct', mode: 'classic', seed: 11 });
startMatch(g);
g.state = 'LIVE';
g.freezeT = 0;
g.buyTime = 0;
g.roundTime = 5;
g.time = 1;
g.player.dead = true;
g.bomb = null;
g.tAttackSite = 'A';

const e = g.entities.find((x) => x.bot && x.team === 't' && !x.dead);
assert.ok(e, 'game should create a T bot');
for (const o of g.entities) if (o !== e) o.dead = true;
e.hasBomb = false;
e.igl = false;
e.netLane = undefined;
e.x = 760;
e.y = 1848;
e.vx = 0;
e.vy = 0;
e.path = null;
e.pathI = 0;
e.repathT = 0;
e.stuckT = 0;
e.lastSample = { x: e.x, y: e.y };
e.aimTarget = null;
e.lastKnown = null;
e.lastKnownT = 99;
e.lastHear = null;
e.memory = [];
e._nearObjKey = null;
e.objCache = { x: 760, y: 1650, peek: true };
e.objAt = g.time * 1000;
e.objKey = 'n|A|-|0|-';
e.aiParams = { ...e.aiParams, peekChance: 0 };
pathTo(e, 760, 1650);
e.repathT = 0.8;

assert.ok(e.path && e.path.length > 1, 'test setup should create a multi-waypoint path');
updateBots(g, 1 / 60);
e.objCache.peek = false;

for (let i = 0; i < 5; i++) updateBots(g, 1 / 60);
assert.ok(e.path, 'bot should keep or rebuild its path instead of coasting in a pathless cooldown');
assert.ok(e.repathT < 0.8, 'peek should not leave the bot blocked by the old repath cooldown');

console.log('ai-path-peek-continuity: all PASS');
