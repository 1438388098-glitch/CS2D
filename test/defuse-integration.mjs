import assert from 'node:assert/strict';
import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { loadMap, findMapById } from '../src/map.js';
import { createGame, startMatch } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { botActions } from '../src/ai/actions.js';

loadMap(findMapById('dust2'));

function makeDefuser() {
  const game = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: 'dust2' });
  const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
  initUi(document, canvasStub, game);
  startMatch(game);
  game.state = 'LIVE';
  game.roundTime = 30;
  game.time = 10;
  game.dt = 1 / 30;
  const ct = game.entities.find((e) => e.bot && e.team === 'ct');
  ct.aimTarget = null;
  ct.lastKnown = null;
  ct.lastKnownT = 99;
  ct.memory = [];
  ct.prefireCount = 0;
  ct.defuseT = 0;
  ct.defuseSmokeRound = 0;
  ct.weapons.kit = false;
  return { game, ct };
}

{
  const { game, ct } = makeDefuser();
  game.bomb = { planted: true, defusing: false, timer: 15, x: ct.x, y: ct.y, site: 'A' };
  botActions(ct, game, 1 / 30);
  assert.ok(ct.defuseT > 0, 'near CT with a real defuse window should start defusing');
}

{
  const { game, ct } = makeDefuser();
  game.bomb = { planted: true, defusing: false, timer: 10, x: ct.x, y: ct.y, site: 'A' };
  botActions(ct, game, 1 / 30);
  assert.equal(ct.defuseT, 0, 'CT should not start a defuse that cannot finish inside the bomb timer');
}

console.log('defuse-integration: all PASS');
