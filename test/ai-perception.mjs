import { registerMap } from '../src/registry.js';
import { loadMap, getMap } from '../src/map.js';
import { createGame } from '../src/game.js';
import { createEntity } from '../src/entities.js';
import { findVisibleEnemy } from '../src/ai/perception.js';

function ok(name, cond) {
  if (!cond) throw new Error('ai-perception: ' + name + ' FAIL');
  console.log('ai-perception: ' + name + ' PASS');
}

const rows = [];
rows.push('########################################');
for (let y = 0; y < 30; y++) rows.push('#' + '.'.repeat(38) + '#');
rows.push('########################################');
registerMap({ id: 'percept-open', name: 'percept-open', accent: '#888', rows });
loadMap({ id: 'percept-open', name: 'percept-open', rows, tile: 32 });

const g = createGame();
g.entities = [];
g.smokes = [];
g.time = 0;
const viewer = createEntity('t', true);
viewer.x = 320; viewer.y = 320; viewer.angle = 0; viewer.dead = false;
viewer.aiParams = { view: 2000 };
g.entities.push(viewer);

const close = createEntity('ct', true);
close.x = 420; close.y = 320; close.dead = false; close.hasBomb = false; close.hp = 100;
g.entities.push(close);

const carrier = createEntity('ct', true);
carrier.x = 1000; carrier.y = 320; carrier.dead = false; carrier.hasBomb = true; carrier.hp = 100;
g.entities.push(carrier);

const target = findVisibleEnemy(viewer, g);
ok('prioritizes bomb carrier', target === carrier);

g.entities = g.entities.filter((e) => e !== carrier);
g.time = 0.1;
g.spatial = null;
const planter = createEntity('ct', true);
planter.x = 800; planter.y = 320; planter.dead = false; planter.plantT = 1; planter.hp = 100;
g.entities.push(planter);
const target2 = findVisibleEnemy(viewer, g);
ok('prioritizes planter', target2 === planter);

console.log('ai-perception: all PASS');
