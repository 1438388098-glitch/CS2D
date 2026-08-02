import { readFileSync, writeFileSync } from 'fs';
const p = 'D:/Claudeworkspace/CS2D/src/config.js';
let s = readFileSync(p, 'utf8');
const FIRST = {
  glock: 0.1, usp: 0.08, p250: 0.1, deagle: 0.06,
  mac10: 0.22, mp9: 0.22, p90: 0.2,
  xm: 0.65,
  ak: 0.08, m4: 0.08,
  awp: 0.1
};
for (const [wid, v] of Object.entries(FIRST)) {
  const start = s.indexOf(wid + ': {');
  if (start < 0) { console.log('MISS ' + wid); continue; }
  const end = s.indexOf('ballistic: {', start);
  if (end < 0 || end > start + 500) { console.log('NO ballistic ' + wid); continue; }
  const seg = s.slice(end, end + 200);
  const m = seg.match(/(first: )[0-9.]+/);
  if (!m) { console.log('NO first ' + wid); continue; }
  s = s.slice(0, end + m.index) + m[1] + v + s.slice(end + m.index + m[0].length);
  console.log(wid + ' first -> ' + v);
}
writeFileSync(p, s);
console.log('done');
