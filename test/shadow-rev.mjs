// 阴影缓存失效：木箱/油桶摧毁后必须递增 game._shadowRev，驱动阴影纹理重建。
import assert from 'node:assert/strict';
import { loadMap, getGrid } from '../src/map.js';
import { destroyCrate, explodeBarrel } from '../src/combat.js';

loadMap({
  id: 'shadow-rev',
  name: 'shadow-rev',
  tile: 32,
  rows: ['.....', '.D.o.', '.....'],
  allowDisconnected: true
});

const game = { crates: [], barrels: [], entities: [], particles: [], smokes: [] };
const grid = getGrid();

const crate = { tx: 1, ty: 1, x: 48, y: 48, hp: 1 };
game.crates.push(crate);
destroyCrate(game, crate, { team: 'ct' });
assert.equal(grid[1][1], '.', 'destroyed crate opens grid');
assert.equal(game._shadowRev, 1, 'destroyed crate bumps shadow rev');

const barrel = { tx: 3, ty: 1, x: 112, y: 48, hp: 1 };
game.barrels.push(barrel);
explodeBarrel(game, barrel, { team: 'ct' });
assert.equal(grid[1][3], '.', 'destroyed barrel opens grid');
assert.equal(game._shadowRev, 2, 'destroyed barrel bumps shadow rev again');

console.log('shadow-rev: all PASS');
