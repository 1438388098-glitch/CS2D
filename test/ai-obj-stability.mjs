// AI objective cache regression: a fresh alert must refresh once, but the
// same alert must not invalidate the objective cache on every following frame.
import assert from 'node:assert/strict';
import { createGame, startMatch } from '../src/game.js';
import { botObjective } from '../src/ai/decisions.js';

const g = createGame({ mapId: 'dust2', bots: 2, team: 'ct', mode: 'classic', seed: 7 });
startMatch(g);
g.state = 'LIVE';
g.freezeT = 0;
g.buyTime = 0;
g.roundTime = 0;
g.time = 1;

const e = g.entities.find((x) => x.bot);
assert.ok(e, 'game should create a bot');
e.hasBomb = true;
e.lastKnown = null;
e.lastKnownT = 99;
e.lastHear = null;
e.memory = [];
e.objCache = null;
e.objAt = 0;
e.objKey = '';
e.objAlertKey = '';

botObjective(e, g);
const baseAt = e.objAt;
assert.ok(baseAt > 0, 'objective cache should be populated');

g.time += 1;
e.lastKnown = { x: e.x + 80, y: e.y, conf: 0.6, t: g.time };
e.lastKnownT = 0;
botObjective(e, g);
const refreshAt = e.objAt;
assert.ok(refreshAt > baseAt, 'new alert should refresh the objective once');

g.time += 1 / 60;
e.lastKnownT += 1 / 60;
const again = botObjective(e, g);
assert.equal(e.objAt, refreshAt, 'same alert should not refresh objective every frame');
assert.equal(again, e.objCache, 'same alert should reuse the cached objective');

// A lastHear that stays inside its fresh window must only override once.
{
  e.objCache = null;
  e.objAt = 0;
  e.objKey = '';
  e.lastKnown = null;
  e.lastKnownT = 99;
  e.lastHear = null;

  botObjective(e, g);
  const hearBaseAt = e.objAt;
  g.time += 0.05;
  e.lastHear = { angle: 0, dist: 80, x: e.x + 80, y: e.y, t: g.time, conf: 0.55 };
  botObjective(e, g);
  const hearRefreshAt = e.objAt;
  assert.ok(hearRefreshAt > hearBaseAt, 'fresh lastHear should refresh the objective once');

  g.time += 1 / 60;
  const hearAgain = botObjective(e, g);
  assert.equal(e.objAt, hearRefreshAt, 'same lastHear should not refresh objective every frame');
  assert.equal(hearAgain, e.objCache, 'same lastHear should reuse the cached objective');
}

console.log('ai-obj-stability: all PASS');
