import assert from 'node:assert/strict';
import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { loadMap, findMapById, getMap } from '../src/map.js';
import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

loadMap(findMapById('dust2'));

function makeCt(freshIntel) {
  const game = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: 'dust2', seed: 20260809 });
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.state = 'LIVE';
  game.roundTime = 45;
  game.roundDur = 115;
  game.time = 10;
  game.freezeT = 0;
  game.buyTime = 0;
  const ct = game.entities.find((e) => e.bot && e.team === 'ct');
  ct.role = 'a';
  ct.aimTarget = null;
  ct.memory = [];
  ct.path = null;
  ct.repathT = 0;
  ct.lastKnown = freshIntel ? { x: ct.x + 10, y: ct.y + 10 } : null;
  ct.lastKnownT = freshIntel ? 2 : 99;
  ct.weapons.nades = { he: 0, flash: 0, smoke: 0 };
  ct.igl = false;
  for (const e of game.entities) {
    if (e !== ct) e.dead = true;
  }
  const tSpawn = getMap().spawns.t[0];
  ct.x = tSpawn.x;
  ct.y = tSpawn.y;
  return { game, ct };
}

function homePoint() {
  const hold = getMap().holds && getMap().holds.A;
  return hold && hold.anchors && hold.anchors.length ? hold.anchors[0] : getMap().spawns.ct[0];
}

{
  const { game, ct } = makeCt(false);
  const home = homePoint();
  const startD = Math.hypot(ct.x - home.x, ct.y - home.y);
  for (let i = 0; i < 90; i++) update(game, 1 / 30);
  const endD = Math.hypot(ct.x - home.x, ct.y - home.y);
  assert.equal(ct.repositionOnIntel, true, 'far CT without fresh intel should reposition home');
  assert.ok(endD < startD - 20, `CT should move back to home point (${startD.toFixed(0)} -> ${endD.toFixed(0)})`);
}

{
  const { game, ct } = makeCt(true);
  for (let i = 0; i < 30; i++) update(game, 1 / 30);
  assert.notEqual(ct.repositionOnIntel, true, 'CT with fresh intel should not abandon the active direction');
}

console.log('intel-reposition-integration: all PASS');
