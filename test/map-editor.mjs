// Map editor pure logic tests.
import { computeMapMeta, validateRows } from '../src/map-editor.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} editor ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}
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
const meta = computeMapMeta(valid);
ok('meta penPoints', meta.penPoints.length === 2, JSON.stringify(meta.penPoints));
const res = validateRows(valid);
ok('valid map', res.ok, JSON.stringify(res.errors));
const missingB = makeRows();
missingB[12] = missingB[12].replace(/b/g, '.');
const bad = validateRows(missingB);
ok('missing B rejected', !bad.ok && bad.errors.some((e) => e.includes('B')));
const brokenRows = ['###', '###'];
const empty = validateRows(brokenRows);
ok('broken rows rejected', !empty.ok);
process.exit(failed ? 1 : 0);
