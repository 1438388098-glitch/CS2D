// Integration gate for the independently designed Atrium demo map.
// Run: node test/atrium-map.mjs
import assert from 'node:assert/strict';
import '../src/modes.js';
import { MAPS } from '../src/config.js';
import { loadMap, getMap } from '../src/map.js';
import { MODE_MAPS } from '../src/modes.js';

function countChar(rows, ch) {
  let n = 0;
  for (const row of rows) for (const cell of row) if (cell === ch) n++;
  return n;
}

const def = MAPS.find((m) => m.id === 'atrium');
assert.ok(def, 'atrium should be registered in the bomb map pool');
assert.ok(MODE_MAPS.includes('atrium'), 'atrium should be part of regular bomb mode rotation');

const diag = loadMap(def);
const map = getMap();

assert.equal(diag.unreachable.length, 0, 'atrium should have no disconnected walkable tiles');
assert.ok(diag.walkableCount > 2000, `atrium walkable space should be playable, got ${diag.walkableCount}`);
assert.ok(map.sites.A && map.sites.B, 'atrium should contain both bomb sites');
assert.ok(map.spawns.t.length > 0 && map.spawns.ct.length > 0, 'atrium should contain both team spawns');
assert.ok(countChar(map.rows, 'C') > 120, 'atrium should use dense static cover');
assert.ok(countChar(map.rows, 'D') > 8, 'atrium should include destructible crate pockets');
assert.ok(countChar(map.rows, '=') > 12, 'atrium should include thin-wall angles');
assert.ok(countChar(map.rows, '^') > 12, 'atrium should include high-ground positions');
assert.ok(countChar(map.rows, 'o') > 2, 'atrium should include barrel hazards');

console.log(`atrium-map: all PASS (${map.w}x${map.h}, walkable=${diag.walkableCount})`);
