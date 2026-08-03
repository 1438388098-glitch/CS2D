// Map spatial metrics: CS2D ASCII maps vs official CS2 radar PNGs.
// Run: node test/map-stats.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { MAPS, TILE } from '../src/config.js';
import { loadMap, getMap, aStar, nearestWalkable } from '../src/map.js';

const SPEED = 235;
const LONG_RUN = 12;
const REF_DIR = path.resolve('assets/radars');
const REF_INFO = path.resolve('C:/Users/20579/AppData/Local/Temp/opencode/cs2maps/data/radar_info');

function isOpen(c) {
  return c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '~' || c === '≈';
}

function isCover(c) {
  return c === 'C' || c === '^' || c === '=' || c === 'o' || c === 'D';
}

function floodAreas(grid, pred) {
  const h = grid.length, w = grid[0].length;
  const seen = new Set();
  const areas = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!pred(grid[y][x]) || seen.has(y * w + x)) continue;
      const stack = [[x, y]];
      seen.add(y * w + x);
      let n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (seen.has(ny * w + nx) || !pred(grid[ny][nx])) continue;
          seen.add(ny * w + nx);
          stack.push([nx, ny]);
        }
      }
      areas.push(n);
    }
  }
  areas.sort((a, b) => b - a);
  return areas;
}

function runsOnLine(cells) {
  const runs = [];
  let n = 0;
  for (const c of cells) {
    if (isOpen(c)) n++;
    else {
      if (n > 0) runs.push(n);
      n = 0;
    }
  }
  if (n > 0) runs.push(n);
  return runs;
}

function runStats(grid) {
  const runs = [];
  for (const row of grid) runs.push(...runsOnLine(row));
  for (let x = 0; x < grid[0].length; x++) {
    runs.push(...runsOnLine(grid.map((r) => r[x])));
  }
  const long = runs.filter((r) => r >= LONG_RUN);
  return {
    avgRun: runs.length ? Math.round(runs.reduce((a, b) => a + b, 0) / runs.length * 10) / 10 : 0,
    maxRun: runs.length ? Math.max(...runs) : 0,
    longCount: long.length,
    longMax: long.length ? Math.max(...long) : 0
  };
}

function analyzeGrid(grid) {
  const h = grid.length, w = grid[0].length;
  let open = 0, cover = 0, solid = 0;
  for (const row of grid) {
    for (const c of row) {
      if (isOpen(c)) open++;
      else if (isCover(c)) cover++;
      else if (c === '#') solid++;
    }
  }
  const areas = floodAreas(grid, isOpen);
  const rs = runStats(grid);
  return {
    cells: w * h,
    open,
    solid,
    cover,
    openPct: Math.round(open / Math.max(1, open + solid) * 1000) / 10,
    coverPerOpen: Math.round(cover / Math.max(1, open) * 1000) / 10,
    areaCount: areas.length,
    areaMax: areas[0] || 0,
    areaAvg: areas.length ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length * 10) / 10 : 0,
    ...rs
  };
}

function centerOf(grid, ch) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === ch) { sx += x; sy += y; n++; }
    }
  }
  return n ? { x: Math.round(sx / n), y: Math.round(sy / n) } : null;
}

function distTime(sx, sy, tx, ty) {
  const tile = getMap()?.tile || TILE;
  const p = aStar(sx, sy, tx, ty);
  if (!p || !p.length) return null;
  let d = 0;
  for (let i = 1; i < p.length; i++) {
    d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  }
  return Math.round(d * tile / SPEED * 10) / 10;
}

function analyzeCs2d(id) {
  const def = MAPS.find((m) => m.id === id);
  loadMap(def);
  const map = getMap();
  const t = centerOf(map.grid, 't');
  const c = centerOf(map.grid, 'c');
  const out = analyzeGrid(map.grid);
  out.id = id;
  out.dist = {};
  for (const key of ['A', 'B']) {
    const s = map.sites[key];
    if (!s) continue;
    const tile = getMap()?.tile || TILE;
    const st = nearestWalkable(s.cx, s.cy);
    const tx = st.x, ty = st.y;
    out.dist['T->' + key] = distTime(t.x, t.y, tx, ty);
    out.dist['CT->' + key] = distTime(c.x, c.y, tx, ty);
  }
  return out;
}

function decodePng(file) {
  const b = fs.readFileSync(file);
  let off = 8, idat = [], w = 0, h = 0;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) {
      const i = x * bpp;
      for (let c = 0; c < bpp; c++) {
        let v = row[i + c];
        const a = x > 0 ? cur[i + c - bpp] : 0;
        const bv = prev[i + c];
        const av = x > 0 ? prev[i + c - bpp] : 0;
        if (f === 1) v = (v + a) & 255;
        else if (f === 2) v = (v + bv) & 255;
        else if (f === 3) v = (v + Math.floor((a + bv) / 2)) & 255;
        else if (f === 4) {
          const p = a + bv - av;
          const pa = Math.abs(p - a), pb = Math.abs(p - bv), pc = Math.abs(p - av);
          v = (v + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? bv : av))) & 255;
        }
        cur[i + c] = v;
      }
    }
    cur.copy(out, y * stride);
    cur.copy(prev);
  }
  return { w, h, out };
}

function parseRefInfo(id) {
  const file = path.join(REF_INFO, 'de_' + id + '.txt');
  if (!fs.existsSync(file)) return null;
  const txt = fs.readFileSync(file, 'utf8');
  const kv = {};
  for (const m of txt.matchAll(/"([A-Za-z0-9_]+)"\s+"(-?[0-9.]+)"/g)) {
    kv[m[1]] = Number(m[2]);
  }
  return kv;
}

function analyzeRadar(id) {
  const file = path.join(REF_DIR, 'de_' + id + '_radar_psd.png');
  if (!fs.existsSync(file)) return null;
  const { w, h, out } = decodePng(file);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out[(y * w + x) * 4 + 3] > 32) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const bw = Math.max(1, x1 - x0 + 1), bh = Math.max(1, y1 - y0 + 1);
  const gw = 144, gh = Math.max(4, Math.round(bh / bw * gw));
  const cellX = bw / gw, cellY = bh / gh;
  const grid = Array.from({ length: gh }, () => Array(gw).fill('#'));
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let floor = 0, n = 0;
      const px0 = Math.floor(x0 + gx * cellX), py0 = Math.floor(y0 + gy * cellY);
      const px1 = Math.min(w, Math.ceil(x0 + (gx + 1) * cellX));
      const py1 = Math.min(h, Math.ceil(y0 + (gy + 1) * cellY));
      for (let py = py0; py < py1; py++) {
        for (let px = px0; px < px1; px++) {
          const i = (py * w + px) * 4;
          const r = out[i], g = out[i + 1], bl = out[i + 2], a = out[i + 3];
          if (a <= 32) continue;
          n++;
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
          if (g > r && lum >= 24) floor++;
        }
      }
      grid[gy][gx] = n > 0 && floor / n > 0.45 ? '.' : '#';
    }
  }
  const out2 = analyzeGrid(grid);
  out2.coverPerOpen = Math.round(out2.solid / Math.max(1, out2.open) * 1000) / 10;
  out2.id = 'de_' + id;
  const info = parseRefInfo(id);
  if (info) {
    out2.dist = {};
    const t = { x: info.TSpawn_x * w, y: info.TSpawn_y * h };
    const c = { x: info.CTSpawn_x * w, y: info.CTSpawn_y * h };
    const diag = Math.hypot(w, h);
    for (const [key, px, py] of [['A', 'bombA_x', 'bombA_y'], ['B', 'bombB_x', 'bombB_y']]) {
      const s = { x: info[px] * w, y: info[py] * h };
      out2.dist['T->' + key] = Math.round(Math.hypot(s.x - t.x, s.y - t.y) / diag * 1000) / 10;
      out2.dist['CT->' + key] = Math.round(Math.hypot(s.x - c.x, s.y - c.y) / diag * 1000) / 10;
    }
  }
  return out2;
}

function fmtRow(o) {
  const d = o.dist || {};
  return [
    o.id.padEnd(9),
    String(o.openPct).padStart(6),
    String(o.coverPerOpen).padStart(6),
    String(o.areaCount).padStart(5),
    String(o.areaMax).padStart(7),
    String(o.avgRun).padStart(6),
    String(o.longCount).padStart(5),
    String(o.longMax).padStart(6),
    (d['T->A'] == null ? ' --' : String(d['T->A']).padStart(6)),
    (d['T->B'] == null ? ' --' : String(d['T->B']).padStart(6))
  ].join(' | ');
}

console.log('Map       Open%  Cover  Areas MaxArea AvgRun Runs>12 MaxRun T->A    T->B');
console.log('-- CS2D --');
for (const id of ['dust2', 'canal', 'metro']) {
  console.log(fmtRow(analyzeCs2d(id)));
}
console.log('-- Official CS2 radar (pixel analysis) --');
for (const id of ['dust2', 'mirage', 'inferno']) {
  const o = analyzeRadar(id);
  if (o) console.log(fmtRow(o));
  else console.log(id.padEnd(9) + ' | missing radar asset');
}

console.log('\nNotes:');
console.log('Cover = C/^/=/o/D per 100 open tiles for CS2D; solid non-floor cells for radar.');
console.log('Open% = open floor / (open floor + solid) inside the map bounding box.');
console.log('T->A/B for CS2D are aStar seconds; for official maps are normalized euclidean distance x10.');