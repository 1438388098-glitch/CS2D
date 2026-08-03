// Official-style map quality gate for dust2/canal/metro.
// Run: node test/official-maps.mjs
import { MAPS } from '../src/config.js';
import { loadMap, getMap, aStar, nearestWalkable } from '../src/map.js';

const SPEED = 235;
let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}
function centerOf(grid, ch) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (grid[y][x] === ch) { sx += x; sy += y; n++; }
  }
  return n ? { x: Math.round(sx / n), y: Math.round(sy / n) } : null;
}
function distTime(sx, sy, tx, ty, tile) {
  const p = aStar(sx, sy, tx, ty);
  if (!p) return null;
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return d * tile / SPEED;
}
const EXPECTED_SPAWNS = {
  dust2: { t: [47, 117], c: [74, 27] },
  canal: { t: [104, 40], c: [34, 77] },
  metro: { t: [13, 80], c: [108, 41] }
};
for (const id of ['dust2', 'canal', 'metro']) {
  const def = MAPS.find((m) => m.id === id);
  ok(`${id} exists`, !!def);
  if (!def) continue;
  loadMap(def);
  const map = getMap();
  const tile = map.tile || 40;
  ok(`${id} high-res tile`, tile >= 12, `tile=${tile}`);
  ok(`${id} dimensions`, map.w >= 100 && map.h >= 90, `${map.w}x${map.h}`);
  ok(`${id} sites`, map.sites.A && map.sites.B, JSON.stringify(map.sites));
  ok(`${id} spawns`, map.spawns.t.length > 0 && map.spawns.ct.length > 0);
  ok(`${id} connected`, map.diagnostics && map.diagnostics.unreachable.length === 0, `unreachable=${map.diagnostics?.unreachable.length}`);
  const t = centerOf(map.grid, 't');
  const c = centerOf(map.grid, 'c');
  const exp = EXPECTED_SPAWNS[id];
  ok(`${id} official spawns`, exp && Math.hypot(t.x - exp.t[0], t.y - exp.t[1]) <= 3 && Math.hypot(c.x - exp.c[0], c.y - exp.c[1]) <= 3, `T=(${t.x},${t.y}) CT=(${c.x},${c.y})`);
  ok(`${id} spawn separation`, Math.hypot(t.x - c.x, t.y - c.y) >= 50, `dist=${Math.hypot(t.x - c.x, t.y - c.y).toFixed(0)}`);
  for (const k of ['A', 'B']) {
    const s = map.sites[k];
    const st = nearestWalkable(s.cx, s.cy);
    const tx = st.x, ty = st.y;
    const ta = distTime(t.x, t.y, tx, ty, tile);
    const ca = distTime(c.x, c.y, tx, ty, tile);
    ok(`${id} reachable ${k}`, ta !== null && ca !== null, `T=${ta?.toFixed(2)} CT=${ca?.toFixed(2)}`);
  }
  const vertical = map.grid.flat().filter((c) => c === '^' || c === 'R').length;
  ok(`${id} vertical layer`, vertical >= 6, `tiles=${vertical} highPoints=${map.highPoints?.length || 0}`);
}
process.exit(failed ? 1 : 0);
