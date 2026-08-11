import { registerMap } from '../src/registry.js';
import { loadMap } from '../src/map.js';
import { createGame } from '../src/game.js';
import { createEntity } from '../src/entities.js';
import { updateBots } from '../src/ai/core.js';

const rows = [];
rows.push('#'.repeat(50));
rows.push('#a.........t.................................................#');
for (let y = 0; y < 16; y++) rows.push('#' + '.'.repeat(48) + '#');
rows.push('#..........c..................................................#');
rows.push('#..........b..................................................#');
rows.push('#'.repeat(50));
registerMap({ id: 'ai-fog-vis', name: 'ai-fog-vis', accent: '#888', rows, allowDisconnected: true });
loadMap({ id: 'ai-fog-vis', name: 'ai-fog-vis', rows, tile: 32 });

function setup() {
  const game = createGame({ fog: true, mapId: 'ai-fog-vis', bots: 0, diff: 'easy' });
  game.state = 'LIVE';
  game.roundTime = 60;
  game.time = 0;
  game.freezeT = 0;
  game.buyTime = 0;
  game.smokes = [];
  const viewer = createEntity('ct', true);
  viewer.x = 320;
  viewer.y = 320;
  viewer.angle = 0;
  viewer.dead = false;
  viewer.aiParams = { view: 2000 };
  viewer.aimTarget = null;
  viewer.aimLostT = 0;
  viewer.repathT = 0;
  viewer.lastKnown = null;
  viewer.lastKnownT = 99;
  const enemy = createEntity('t', true);
  enemy.x = 420;
  enemy.y = 320;
  enemy.dead = false;
  enemy.hasBomb = false;
  enemy.hp = 100;
  game.entities = [viewer, enemy];
  return { game, viewer, enemy };
}

function ok(name, cond) {
  if (!cond) throw new Error('ai-fog-lost: ' + name + ' FAIL');
  console.log('ai-fog-lost: ' + name + ' PASS');
}

{
  const { game, viewer, enemy } = setup();
  updateBots(game, 1 / 30);
  ok('bot acquires enemy inside fog radius', viewer.aimTarget === enemy);
}

{
  const { game, viewer, enemy } = setup();
  updateBots(game, 1 / 30);
  viewer.aimLostT = 2;
  enemy.x = 650;
  updateBots(game, 1 / 30);
  ok('bot keeps target beyond old 540px fog radius', viewer.aimTarget === enemy);
}

{
  const { game, viewer, enemy } = setup();
  updateBots(game, 1 / 30);
  viewer.aimLostT = 2;
  game.smokes = [{ x: 420, y: 320, r: 80 }];
  updateBots(game, 1 / 30);
  ok('bot loses target through smoke', viewer.aimTarget === null);
}

console.log('ai-fog-lost: all PASS');
