// Regenerate docs/map-preview.html from the current official map data.
// Run: node scripts/build-map-preview.mjs
import fs from 'node:fs';
import path from 'node:path';
import { MAPS } from '../src/config.js';
import { loadMap, getMap, aStar, nearestWalkable } from '../src/map.js';

const ROOT = path.resolve('D:/Claudeworkspace/CS2D');
const OUT = path.join(ROOT, 'docs/map-preview.html');
const SPEED = 235;
const OPEN = new Set(['.', 'a', 'b', 't', 'c', '~', '\u2248']);
const COVER = new Set(['C', '^', 'R', '=', 'o', 'D']);
const isOpen = (c) => OPEN.has(c);
const isCover = (c) => COVER.has(c);

function centerOf(grid, ch) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (grid[y][x] === ch) { sx += x; sy += y; n++; }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}
function distTime(sx, sy, tx, ty, tile) {
  const p = aStar(Math.round(sx), Math.round(sy), Math.round(tx), Math.round(ty));
  if (!p) return null;
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return Math.round(d * tile / SPEED * 100) / 100;
}
function buildMapPayload(id) {
  const def = MAPS.find((m) => m.id === id);
  loadMap(def);
  const map = getMap();
  const T = map.tile;
  const grid = map.grid;
  let open = 0, wall = 0, cover = 0, vertical = 0;
  for (const row of grid) for (const c of row) {
    if (isOpen(c)) open++;
    else if (c === '#') wall++;
    else if (isCover(c)) cover++;
    if (c === '^' || c === 'R') vertical++;
  }
  const t = centerOf(grid, 't');
  const c = centerOf(grid, 'c');
  const timing = {};
  for (const key of ['A', 'B']) {
    const s = map.sites[key];
    const st = nearestWalkable(s.cx, s.cy);
    const tT = distTime(t.x, t.y, st.x, st.y, T);
    const cT = distTime(c.x, c.y, st.x, st.y, T);
    timing[key] = { tx: st.x, ty: st.y, t: tT, ct: cT, diff: tT !== null && cT !== null ? tT - cT : null };
  }
  return {
    id: def.id,
    name: def.name,
    accent: def.accent,
    tile: def.tile,
    rows: def.rows,
    penPoints: def.penPoints || [],
    highPoints: def.highPoints || [],
    metrics: {
      open,
      wall,
      cover,
      vertical,
      openPct: Math.round(open / Math.max(1, open + wall) * 1000) / 10,
      wallPerOpen: Math.round(wall / Math.max(1, open) * 1000) / 10,
      coverPerOpen: Math.round(cover / Math.max(1, open) * 1000) / 10,
      highPoints: (def.highPoints || []).length,
      tile: T,
      timing
    }
  };
}
const payload = {
  dust2: buildMapPayload('dust2'),
  canal: buildMapPayload('canal'),
  metro: buildMapPayload('metro')
};
let html = fs.readFileSync(path.join(ROOT, 'docs/map-preview.html'), 'utf8');
html = html.replace(/<title>.*?<\/title>/, '<title>CS2D 地图深度预览</title>');
html = html.replace(/<h1>.*?<\/h1>/, '<h1>CS2D 地图深度预览</h1>');
html = html.replace(/<p class="sub">.*?<\/p>/, '<p class="sub">官方雷达重建 · 掩体密度 · 垂直纵深 · 出生点与站点直达时间</p>');
html = html.replace(/const MAPS = \{[\s\S]*?\};/, 'const MAPS = ' + JSON.stringify(payload) + ';');
if (!html.includes('const MAPS = {')) throw new Error('map payload not embedded');
fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote', OUT, fs.statSync(OUT).size);
