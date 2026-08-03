// Import official CS2 radar layouts into CS2D high-resolution grids.
// Output: src/official-maps.js
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve('D:/Claudeworkspace/CS2D');
const RADAR_DIR = path.join(ROOT, 'assets/radars');
const REF_DIR = 'C:/Users/20579/AppData/Local/Temp/opencode/cs2maps/data/radar_info';
const GW = 120;
const TILE = 16;
const OUT = path.join(ROOT, 'src/official-maps.js');

function decodePng(file) {
  const b = fs.readFileSync(file);
  let off = 8, idat = [], w = 0, h = 0;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
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

function parseRef(id) {
  const txt = fs.readFileSync(path.join(REF_DIR, `de_${id}.txt`), 'utf8');
  const kv = {};
  for (const m of txt.matchAll(/"([A-Za-z0-9_]+)"\s+"(-?[0-9.]+)"/g)) kv[m[1]] = Number(m[2]);
  return kv;
}

function nearestFloor(grid, gx, gy, r = 16) {
  const GH = grid.length, GW = grid[0].length;
  if (gx >= 0 && gy >= 0 && gx < GW && gy < GH && grid[gy][gx] === '.') return [gx, gy];
  for (let rr = 1; rr <= r; rr++) {
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && grid[ny][nx] === '.') return [nx, ny];
    }
  }
  return null;
}

function setRect(grid, x0, y0, x1, y1, ch) {
  for (let y = Math.max(0, y0); y <= Math.min(grid.length - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(grid[0].length - 1, x1); x++) if (grid[y][x] === '.') grid[y][x] = ch;
  }
}

function setSpawn(grid, cx, cy, ch) {
  const cells = [[cx, cy], [cx - 1, cy], [cx, cy - 1], [cx - 1, cy - 1]];
  if (cells.every(([x, y]) => grid[y] && grid[y][x] === '.')) {
    for (const [x, y] of cells) grid[y][x] = ch;
  } else if (grid[cy] && grid[cy][cx] === '.') {
    grid[cy][cx] = ch;
  }
}

function placeOfficialSpawn(grid, base, ch) {
  const p = nearestFloor(grid, base.fx, base.fy);
  if (!p) return null;
  const px = p[0], py = p[1];
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = px + dx, y = py + dy;
      const cells = [[x, y], [x - 1, y], [x, y - 1], [x - 1, y - 1]];
      if (cells.every(([xx, yy]) => grid[yy] && grid[yy][xx] === '.')) {
        for (const [xx, yy] of cells) grid[yy][xx] = ch;
        return { fx: x, fy: y };
      }
    }
  }
  setSpawn(grid, px, py, ch);
  return { fx: px, fy: py };
}

function bfs(grid, sx, sy) {
  const GH = grid.length, GW = grid[0].length;
  const d = Array.from({ length: GH }, () => Array(GW).fill(-1));
  const q = [[sx, sy]];
  d[sy][sx] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && d[ny][nx] === -1 && '.abct~≈^R'.includes(grid[ny][nx])) {
        d[ny][nx] = d[y][x] + 1;
        q.push([nx, ny]);
      }
    }
  }
  return d;
}

function buildRadarGrid(id) {
  const { w, h, out } = decodePng(path.join(RADAR_DIR, `de_${id}_radar_psd.png`));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (out[(y * w + x) * 4 + 3] > 32) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const GH = Math.max(10, Math.round(GW * bh / bw));
  const raw = Array.from({ length: GH }, () => Array(GW).fill(false));
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const px0 = Math.floor(x0 + gx * bw / GW), py0 = Math.floor(y0 + gy * bh / GH);
      const px1 = Math.min(w, Math.ceil(x0 + (gx + 1) * bw / GW)), py1 = Math.min(h, Math.ceil(y0 + (gy + 1) * bh / GH));
      let floor = 0, n = 0;
      for (let py = py0; py < py1; py++) for (let px = px0; px < px1; px++) {
        const i = (py * w + px) * 4;
        const r = out[i], g = out[i + 1], bl = out[i + 2], a = out[i + 3];
        if (a <= 32) continue;
        n++;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
        if (g > r && lum >= 24) floor++;
      }
      raw[gy][gx] = n > 0 && floor / n > 0.38;
    }
  }
  const floor = raw.map((row, gy) => row.map((v, gx) => {
    if (v) return true;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = gx + dx, ny = gy + dy;
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && raw[ny][nx]) n++;
    }
    return n >= 5;
  }));
  const seen = Array.from({ length: GH }, () => Array(GW).fill(false));
  const comps = [];
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    if (!floor[gy][gx] || seen[gy][gx]) continue;
    const q = [[gx, gy]]; seen[gy][gx] = true;
    const comp = [];
    while (q.length) {
      const [x, y] = q.pop(); comp.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && floor[ny][nx] && !seen[ny][nx]) {
          seen[ny][nx] = true; q.push([nx, ny]);
        }
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  const main = comps[0] || [];
  const cells = floor.map((r) => r.slice());
  let changed = true;
  while (changed) {
    changed = false;
    for (let ci = 1; ci < comps.length; ci++) {
      if (!comps[ci].length) continue;
      let best = null;
      for (const [x, y] of comps[ci]) for (const [mx, my] of main) {
        const d = Math.abs(x - mx) + Math.abs(y - my);
        if (!best || d < best.d) best = { d, x, y, mx, my };
      }
      if (best && best.d <= 8) {
        let cx = best.x, cy = best.y;
        while (cx !== best.mx) { cx += cx < best.mx ? 1 : -1; cells[cy][cx] = true; }
        while (cy !== best.my) { cy += cy < best.my ? 1 : -1; cells[cy][cx] = true; }
        for (const p of comps[ci]) main.push(p);
        comps[ci] = [];
        changed = true;
      }
    }
  }
  const grid = Array.from({ length: GH }, () => Array(GW).fill('#'));
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (cells[y][x]) grid[y][x] = '.';
  return grid;
}

function pruneUnreachable(grid) {
  const GH = grid.length, GW = grid[0].length;
  const seeds = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if ('tca b'.includes(grid[y][x])) seeds.push([x, y]);
  }
  if (!seeds.length) seeds.push([Math.floor(GW / 2), Math.floor(GH / 2)]);
  const seen = new Set();
  const q = seeds.slice();
  for (const [x, y] of seeds) seen.add(y * GW + x);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const k = ny * GW + nx;
      if (seen.has(k) || !'.abct~?^R'.includes(grid[ny][nx])) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if ('.abct~?^R'.includes(grid[y][x]) && !seen.has(y * GW + x)) grid[y][x] = '#';
  }
  return grid;
}

function placeSitesAndSpawns(grid, info, targets) {
  const GH = grid.length, GW = grid[0].length;
  const raw = {};
  for (const [key, nx, ny] of [['t', info.TSpawn_x, info.TSpawn_y], ['c', info.CTSpawn_x, info.CTSpawn_y], ['a', info.bombA_x, info.bombA_y], ['b', info.bombB_x, info.bombB_y]]) {
    const p = nearestFloor(grid, Math.round(nx * GW), Math.round(ny * GH));
    if (!p) throw new Error(`no floor near ${key}`);
    raw[key] = { fx: p[0], fy: p[1] };
  }
  setRect(grid, raw.a.fx - 2, raw.a.fy - 1, raw.a.fx + 1, raw.a.fy + 1, 'a');
  setRect(grid, raw.b.fx - 2, raw.b.fy - 1, raw.b.fx + 1, raw.b.fy + 1, 'b');
  const aC = [Math.round((raw.a.fx + raw.a.fx - 1) / 2), Math.round((raw.a.fy + raw.a.fy - 1) / 2)];
  const bC = [Math.round((raw.b.fx + raw.b.fx - 1) / 2), Math.round((raw.b.fy + raw.b.fy - 1) / 2)];
  const dA = bfs(grid, aC[0], aC[1]);
  const dB = bfs(grid, bC[0], bC[1]);

  const tSpawn = placeOfficialSpawn(grid, raw.t, 't');
  const cSpawn = placeOfficialSpawn(grid, raw.c, 'c');
  if (!tSpawn || !cSpawn) throw new Error('official spawn placement failed');
  const best = { tx: tSpawn.fx, ty: tSpawn.fy, cx: cSpawn.fx, cy: cSpawn.fy };
  return { grid, raw, spawn: best, aC, bC };
}

function addPlatform(grid, anchor, dir, tag) {
  const GH = grid.length, GW = grid[0].length;
  const [ax, ay] = anchor;
  const cands = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = ax + dx, y = ay + dy;
    if (x < 1 || y < 1 || x >= GW - 2 || y >= GH - 2) continue;
    const cells = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
    if (cells.every(([xx, yy]) => grid[yy][xx] === '.')) cands.push([x, y]);
  }
  if (!cands.length) return null;
  const [x, y] = cands[Math.floor(Math.abs(ax + ay) / 7) % cands.length];
  setRect(grid, x, y, x + 1, y + 1, '^');
  const rampPos = [[x - 1, y], [x + 2, y], [x, y - 1], [x, y + 2]];
  for (const [rx, ry] of rampPos) {
    if (rx >= 0 && ry >= 0 && rx < GW && ry < GH && grid[ry][rx] === '.') {
      grid[ry][rx] = 'R';
      break;
    }
  }
  return { x, y, face: dir };
}

function addVerticalLayers(grid, sites) {
  const highPoints = [];
  const anchors = [
    { site: 'A', anchor: [sites.A.fx, sites.A.fy], dir: Math.PI },
    { site: 'B', anchor: [sites.B.fx, sites.B.fy], dir: 0 }
  ];
  for (const item of anchors) {
    const p = addPlatform(grid, item.anchor, item.dir, item.site);
    if (p) highPoints.push({ x: (p.x + 1) * TILE, y: (p.y + 1) * TILE, face: p.face, site: item.site });
  }
  const center = [Math.floor(grid[0].length / 2), Math.floor(grid.length / 2)];
  const mid = nearestFloor(grid, center[0], center[1]);
  if (mid) {
    const p = addPlatform(grid, mid, -Math.PI / 2, 'mid');
    if (p) highPoints.push({ x: (p.x + 1) * TILE, y: (p.y + 1) * TILE, face: p.face, site: 'mid' });
  }
  return highPoints;
}

const SPEC = [
  { id: 'dust2', outId: 'dust2', name: '\u6c99\u6f20\u9057\u5740', accent: '#ff8a2a', targets: { A: 0, B: 0 } },
  { id: 'mirage', outId: 'canal', name: '\u8fd0\u6cb3\u5c0f\u9547', accent: '#6ad1a8', targets: { A: 0, B: 0 } },
  { id: 'inferno', outId: 'metro', name: '\u5730\u94c1\u67a2\u7ebd', accent: '#b08aff', targets: { A: 0, B: 0 } },
];

const outMaps = {};
for (const spec of SPEC) {
  const info = parseRef(spec.id);
  let grid = buildRadarGrid(spec.id);
  const placed = placeSitesAndSpawns(grid, info, spec.targets || {});
  grid = placed.grid;
  const sites = { A: placed.raw.a, B: placed.raw.b };
  const highPoints = addVerticalLayers(grid, sites);
  pruneUnreachable(grid);
  const rows = grid.map((r) => r.join(''));
  const GH = rows.length;
  let open = 0, wall = 0, vertical = 0;
  for (const row of rows) for (const c of row) {
    if ('.abct~≈^R'.includes(c)) open++;
    else if (c === '#') wall++;
    if (c === '^' || c === 'R') vertical++;
  }
  console.log(`${spec.outId}: ${GW}x${GH} open=${(open / (open + wall) * 100).toFixed(1)}% vertical=${vertical} highPoints=${highPoints.length} spawn=${JSON.stringify(placed.spawn)}`);
  outMaps[spec.outId] = {
    id: spec.outId,
    name: spec.name,
    accent: spec.accent,
    tile: TILE,
    rows,
    penPoints: [sites.A, sites.B].map((s) => ({ x: s.fx * TILE + TILE / 2, y: s.fy * TILE + TILE / 2 })),
    highPoints
  };
}
const js = `// Generated by scripts/import-official-maps.mjs from official CS2 radar assets.\n// Do not edit manually.\nexport const OFFICIAL_MAPS = ${JSON.stringify(outMaps, null, 2)};\n`;
fs.writeFileSync(OUT, js, 'utf8');
console.log('wrote', OUT, fs.statSync(OUT).size);
