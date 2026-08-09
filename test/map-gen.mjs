import assert from 'node:assert/strict';
import { createBuilder, buildDust2, buildCanal, buildMetro, buildForge, buildHarbor } from '../src/map-gen.js';
import { loadMap } from '../src/map.js';

function countChar(rows, ch) {
  let count = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (cell === ch) count++;
    }
  }
  return count;
}

function hasChar(rows, ch) {
  return rows.some((row) => row.includes(ch));
}

const builder = createBuilder(6, 5);
assert.equal(builder.w, 6, 'builder should store width');
assert.equal(builder.h, 5, 'builder should store height');
assert.deepEqual(builder.rows(), ['######', '######', '######', '######', '######'], 'builder should start fully walled');

builder.room(1, 1, 3, 2);
builder.box(2, 2);
builder.crate(3, 2);
builder.site('A', 1, 3, 2, 1);
builder.site('B', 3, 3, 2, 1);
builder.spawn('t', 1, 4, 2, 1);
builder.spawn('ct', 3, 4, 2, 1);
builder.boxes(0, 0, 2, 1);
builder.tile(5, 0, '^');
builder.wall(5, 4);
builder.door(0, 4);

assert.deepEqual(
  builder.rows(),
  ['CC###^', '#...##', '#.CD##', '#aabb#', '.ttcc#'],
  'builder primitives should write expected tile chars'
);

assert.doesNotThrow(() => builder.room(-10, -10, 2, 2), 'room should ignore out-of-bounds tiles');
assert.doesNotThrow(() => builder.box(99, 99), 'box should ignore out-of-bounds tiles');
assert.doesNotThrow(() => builder.tile(-5, -5, 'x'), 'tile should ignore out-of-bounds tiles');

const corridor = createBuilder(5, 5);
corridor.corridor(1, 1, 2, 2);
assert.equal(corridor.rows()[1][1], '.', 'corridor should open a room');

const generatedMaps = [
  { name: 'dust2', rows: buildDust2().rows(), w: 60, h: 42 },
  { name: 'canal', rows: buildCanal().rows(), w: 64, h: 46 },
  { name: 'metro', rows: buildMetro().rows(), w: 58, h: 42 },
  { name: 'forge', rows: buildForge().rows(), w: 80, h: 52 },
  { name: 'harbor', rows: buildHarbor().rows(), w: 72, h: 48 }
];

for (const map of generatedMaps) {
  assert.equal(map.rows.length, map.h, `${map.name} should have expected row count`);
  for (const row of map.rows) {
    assert.equal(row.length, map.w, `${map.name} rows should have expected width`);
  }
  assert.ok(map.rows[0].split('').every((ch) => ch === '#'), `${map.name} should have top border`);
  assert.ok(map.rows.every((row) => row[0] === '#' && row[map.w - 1] === '#'), `${map.name} should have side borders`);
  assert.ok(hasChar(map.rows, 'a') && hasChar(map.rows, 'b'), `${map.name} should contain both sites`);
  assert.ok(hasChar(map.rows, 't') && hasChar(map.rows, 'c'), `${map.name} should contain both spawn teams`);
  assert.ok(hasChar(map.rows, 'C'), `${map.name} should contain cover crates`);
  assert.ok(hasChar(map.rows, 'D'), `${map.name} should contain destructible crates`);
  assert.ok(hasChar(map.rows, '='), `${map.name} should contain thin walls`);
  assert.ok(hasChar(map.rows, '^'), `${map.name} should contain high ground`);
  assert.ok(countChar(map.rows, 'a') > 0, `${map.name} should have walkable A site area`);
  assert.ok(countChar(map.rows, 'b') > 0, `${map.name} should have walkable B site area`);
  const diag = loadMap({ id: map.name, name: map.name, rows: map.rows, tile: 16 });
  assert.equal(diag.unreachable.length, 0, `${map.name} should have no unreachable walkable tiles`);
  assert.ok(diag.walkableCount > 1000, `${map.name} should have enough walkable space`);
}

console.log('map-gen: all PASS');
