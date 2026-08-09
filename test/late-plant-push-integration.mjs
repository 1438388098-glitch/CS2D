import assert from 'node:assert/strict';
import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { loadMap, findMapById, getMap } from '../src/map.js';
import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

loadMap(findMapById('dust2'));

function makeGame(roundTime) {
  const game = createGame({ team: 't', diff: 'normal', bots: 5, mapId: 'dust2', seed: 20260810 });
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.state = 'LIVE';
  game.roundTime = roundTime;
  game.roundDur = 115;
  game.time = 10;
  game.freezeT = 0;
  game.buyTime = 0;
  game.tAttackSite = 'A';
  game.bomb = { planted: false, dropped: false };
  const carrier = game.entities.find((e) => e.bot && e.team === 't');
  carrier.hasBomb = true;
  carrier.aimTarget = null;
  carrier.memory = [];
  carrier.lastKnown = null;
  carrier.path = null;
  carrier.repathT = 0;
  carrier.weapons.nades = { he: 0, flash: 0, smoke: 0 };
  carrier.igl = false;
  for (const e of game.entities) {
    if (e !== carrier) e.dead = true;
  }
  const ctSpawn = getMap().spawns.ct[0];
  carrier.x = ctSpawn.x;
  carrier.y = ctSpawn.y;
  return { game, carrier };
}

{
  const { game, carrier } = makeGame(60);
  const site = getMap().sites.A;
  const startD = Math.hypot(carrier.x - site.cx, carrier.y - site.cy);
  for (let i = 0; i < 90; i++) update(game, 1 / 30);
  const endD = Math.hypot(carrier.x - site.cx, carrier.y - site.cy);
  assert.equal(carrier.latePlantPush, true, 'late-round bomb carrier should enter late-plant push');
  assert.ok(endD < startD - 20, `late bomb carrier should move toward site (${startD.toFixed(0)} -> ${endD.toFixed(0)})`);
}

{
  const { game, carrier } = makeGame(30);
  for (let i = 0; i < 30; i++) update(game, 1 / 30);
  assert.notEqual(carrier.latePlantPush, true, 'early-round bomb carrier should not enter late-plant push');
}

console.log('late-plant-push-integration: all PASS');
