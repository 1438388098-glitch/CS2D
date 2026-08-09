import assert from 'node:assert/strict';
import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { loadMap, findMapById, getMap } from '../src/map.js';
import { createGame, startMatch } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { update } from '../src/game.js';

loadMap(findMapById('dust2'));

function makeGame(primary, money) {
  const game = createGame({ team: 't', diff: 'normal', bots: 5, mapId: 'dust2', seed: 20260809 });
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.state = 'LIVE';
  game.roundTime = 100;
  game.roundDur = 115;
  game.time = 10;
  game.freezeT = 0;
  game.buyTime = 0;
  const t = game.entities.find((e) => e.bot && e.team === 't' && !e.hasBomb);
  t.aimTarget = null;
  t.lastKnown = null;
  t.memory = [];
  t.path = null;
  t.repathT = 0;
  t.money = money;
  t.weapons.primary = primary;
  t.weapons.nades = { he: 0, flash: 0, smoke: 0 };
  t.igl = false;
  for (const e of game.entities) {
    if (e !== t) e.dead = true;
  }
  const site = getMap().sites.A;
  t.x = site.cx;
  t.y = site.cy;
  return { game, t };
}

{
  const { game, t } = makeGame('ak', 1800);
  const spawn = getMap().spawns.t[0];
  const startD = Math.hypot(t.x - spawn.x, t.y - spawn.y);
  for (let i = 0; i < 90; i++) update(game, 1 / 30);
  const endD = Math.hypot(t.x - spawn.x, t.y - spawn.y);
  assert.equal(t.ecoRetreat, true, 'late low-money rifle bot should enter eco retreat');
  assert.ok(endD < startD - 20, `eco bot should move back toward T spawn (${startD.toFixed(0)} -> ${endD.toFixed(0)})`);
}

{
  const { game, t } = makeGame('p250', 1800);
  for (let i = 0; i < 90; i++) update(game, 1 / 30);
  assert.notEqual(t.ecoRetreat, true, 'pistol holder should not enter rifle eco retreat');
}

console.log('eco-retreat-integration: all PASS');
