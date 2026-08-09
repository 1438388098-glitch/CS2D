import assert from 'node:assert/strict';
import { computeMapMeta, validateRows } from '../src/map-editor.js';

function makeRows() {
  const w = 24, h = 18;
  const rows = Array.from({ length: h }, () => '#'.repeat(w));
  for (let y = 1; y < h - 1; y++) {
    let r = rows[y].split('');
    for (let x = 1; x < w - 1; x++) r[x] = '.';
    rows[y] = r.join('');
  }
  rows[2] = rows[2].slice(0, 4) + 'tt' + rows[2].slice(6);
  rows[15] = rows[15].slice(0, 4) + 'cc' + rows[15].slice(6);
  rows[5] = rows[5].slice(0, 4) + 'aa' + rows[5].slice(6);
  rows[12] = rows[12].slice(0, 17) + 'bb' + rows[12].slice(19);
  return rows;
}

const valid = makeRows();

{
  const meta = computeMapMeta(valid);
  assert.equal(meta.penPoints.length, 2, 'A/B export points should exist');
  assert.deepEqual(meta.penPoints[0], { x: 80, y: 88 }, 'A export point should use tile 16');
  assert.deepEqual(meta.penPoints[1], { x: 288, y: 200 }, 'B export point should use tile 16');
  assert.deepEqual(meta.highPoints, [], 'editor default highPoints should be empty');
}

{
  const res = validateRows(valid);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.unreachable, 0, 'valid map should have no unreachable tiles');
}

{
  const missingT = makeRows();
  missingT[2] = missingT[2].replace(/t/g, '.');
  const res = validateRows(missingT);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('T 出生点')), JSON.stringify(res.errors));
}

{
  const short = makeRows();
  short[3] = '##';
  const res = validateRows(short);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('行长度不一致')), JSON.stringify(res.errors));
}

{
  const walled = makeRows();
  for (let y = 11; y <= 13; y++) {
    const r = walled[y].split('');
    for (let x = 16; x <= 19; x++) r[x] = '#';
    walled[y] = r.join('');
  }
  const bRow = walled[12].split('');
  bRow[17] = 'b';
  bRow[18] = 'b';
  walled[12] = bRow.join('');
  const res = validateRows(walled);
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('不可达') || e.includes('无法到达')),
    JSON.stringify(res.errors)
  );
}

{
  const closeSpawns = makeRows();
  closeSpawns[15] = closeSpawns[15].replace('cc', '..');
  const row = closeSpawns[3].split('');
  row[4] = 'c';
  closeSpawns[3] = row.join('');
  const res = validateRows(closeSpawns);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('出生点太近')), JSON.stringify(res.errors));
}

console.log('map-editor-export: all PASS');
