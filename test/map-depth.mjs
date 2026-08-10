// Map depth gate: cover density, long sightline breaking, site defense cover.
// Run: node test/map-depth.mjs
import { MAPS } from '../src/config.js';
import { loadMap, getMap } from '../src/map.js';

const OPEN = new Set(['.', 'a', 'b', 't', 'c', '~', '\u2248']);
const COVER = new Set(['C', '^', 'R', '=', 'o', 'D']);
const isOpen = (c) => OPEN.has(c);
const isCover = (c) => COVER.has(c);
let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}
function countCoverNearSite(map, g, key, r = 4) {
  const T = map.tile;
  const s = map.sites[key];
  const tx0 = Math.floor(s.x0 / T), ty0 = Math.floor(s.y0 / T);
  const tx1 = Math.floor((s.x1 - 1) / T), ty1 = Math.floor((s.y1 - 1) / T);
  let n = 0;
  for (let y = ty0 - r; y <= ty1 + r; y++) {
    for (let x = tx0 - r; x <= tx1 + r; x++) {
      if (x >= 0 && y >= 0 && y < g.length && x < g[0].length && isCover(g[y][x])) n++;
    }
  }
  return n;
}
for (const id of ['dust2', 'canal', 'metro']) {
  const def = MAPS.find((m) => m.id === id);
  loadMap(def);
  const map = getMap();
  const g = map.grid;
  let open = 0, cover = 0;
  for (const row of g) for (const c of row) { if (isOpen(c)) open++; else if (isCover(c)) cover++; }
  const per100 = Math.round(cover / Math.max(1, open) * 1000) / 10;
  let maxRun = 0;
  for (let y = 0; y < g.length; y++) {
    let n = 0;
    for (let x = 0; x < g[0].length; x++) {
      if (isOpen(g[y][x])) n++;
      else { if (n > maxRun) maxRun = n; n = 0; }
    }
    if (n > maxRun) maxRun = n;
  }
  const siteCoverA = countCoverNearSite(map, g, 'A');
  const siteCoverB = countCoverNearSite(map, g, 'B');
  const vertical = g.flat().filter((c) => c === '^' || c === 'R').length;
  const gates = {
    dust2: { minVertical: 45, minSite: 6, maxRun: 130, minCover: 0.6 },
    canal: { minVertical: 15, minSite: 5, maxRun: 110, minCover: 0.3 },
    metro: { minVertical: 45, minSite: 5, maxRun: 120, minCover: 0.4 }
  }[id];
  ok(id + ' vertical depth', vertical >= gates.minVertical, 'vertical=' + vertical);
  ok(id + ' site cover', siteCoverA >= gates.minSite && siteCoverB >= gates.minSite, 'A=' + siteCoverA + ' B=' + siteCoverB);
  ok(id + ' sightline clean', maxRun <= gates.maxRun, 'maxRun=' + maxRun);
  ok(id + ' cover density', per100 >= gates.minCover, 'per100=' + per100);
  ok(id + ' highpoint labels', (map.highPoints || []).every((h) => /^(A|B|mid|long)$/.test(h.site)), 'labels=' + (map.highPoints || []).map((h) => h.site).join(','));
  ok(id + ' connected', map.diagnostics.unreachable.length === 0, 'unreachable=' + map.diagnostics.unreachable.length);
}
process.exit(failed ? 1 : 0);
