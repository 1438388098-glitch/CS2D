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

const FALLBACK_REF = {
  dust2: { TSpawn_x: 0.3875, TSpawn_y: 0.9031, CTSpawn_x: 0.6125, CTSpawn_y: 0.2054, bombA_x: 0.8107, bombA_y: 0.1539, bombB_x: 0.1893, bombB_y: 0.1163 },
  mirage: { TSpawn_x: 0.8625, TSpawn_y: 0.3591, CTSpawn_x: 0.2792, CTSpawn_y: 0.6955, bombA_x: 0.5375, bombA_y: 0.7636, bombB_x: 0.2292, bombB_y: 0.2818 },
  inferno: { TSpawn_x: 0.1042, TSpawn_y: 0.6795, CTSpawn_x: 0.8958, CTSpawn_y: 0.3462, bombA_x: 0.8217, bombA_y: 0.7026, bombB_x: 0.4792, bombB_y: 0.2094 }
};
function parseRef(id) {
  const file = path.join(REF_DIR, `de_${id}.txt`);
  if (!fs.existsSync(file)) return FALLBACK_REF[id] || FALLBACK_REF.dust2;
  const txt = fs.readFileSync(file, 'utf8');
  const kv = {};
  for (const m of txt.matchAll(/"([A-Za-z0-9_]+)"\s+"(-?[0-9.]+)"/g)) kv[m[1]] = Number(m[2]);
  return Object.keys(kv).length ? kv : (FALLBACK_REF[id] || FALLBACK_REF.dust2);
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

function buildRadarGrid(id, opts = {}) {
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
  const GW = opts.gridWidth || 120;
  const GH = Math.max(10, Math.round(GW * bh / bw));
  const floorRatio = opts.floorRatio ?? 0.38;
  const bridgeDist = opts.bridgeDist ?? 8;
  const dilateNeighbors = opts.dilateNeighbors ?? 5;
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
      raw[gy][gx] = n > 0 && floor / n > floorRatio;
    }
  }
  const floor = raw.map((row, gy) => row.map((v, gx) => {
    if (v) return true;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = gx + dx, ny = gy + dy;
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && raw[ny][nx]) n++;
    }
    return n >= dilateNeighbors;
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
      if (best && best.d <= bridgeDist) {
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


function officialFloorGrid(id, floorRatio = 0.15, gridWidth = 120) {
  const { w, h, out } = decodePng(path.join(RADAR_DIR, `de_${id}_radar_psd.png`));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (out[(y * w + x) * 4 + 3] > 32) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const GH = Math.max(10, Math.round(gridWidth * bh / bw));
  const ref = Array.from({ length: GH }, () => Array(gridWidth).fill(false));
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < gridWidth; gx++) {
    const px0 = Math.floor(x0 + gx * bw / gridWidth), py0 = Math.floor(y0 + gy * bh / GH);
    const px1 = Math.min(w, Math.ceil(x0 + (gx + 1) * bw / gridWidth)), py1 = Math.min(h, Math.ceil(y0 + (gy + 1) * bh / GH));
    let floor = 0, n = 0;
    for (let py = py0; py < py1; py++) for (let px = px0; px < px1; px++) {
      const i = (py * w + px) * 4, r = out[i], g = out[i + 1], bl = out[i + 2], a = out[i + 3];
      if (a <= 32) continue;
      n++;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      if (g > r && lum >= 24) floor++;
    }
    if (n > 0 && floor / n > floorRatio) ref[gy][gx] = true;
  }
  return ref;
}
function forceOfficialFloor(grid, id, opts = {}) {
  const ref = officialFloorGrid(id, opts.floorRatio ?? 0.15, grid[0].length);
  const H = Math.min(grid.length, ref.length), W = Math.min(grid[0].length, ref[0].length);
  let added = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ref[y][x] && grid[y][x] === '#') { grid[y][x] = '.'; added++; }
  }
  return { added };
}
function connectOpenComponents(grid) {
  const GH = grid.length, GW = grid[0].length;
  const seen = Array.from({ length: GH }, () => Array(GW).fill(false));
  const comps = [];
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    if (seen[gy][gx] || !'.abct~\u2248^R'.includes(grid[gy][gx])) continue;
    const q = [[gx, gy]]; seen[gy][gx] = true; const comp = [];
    while (q.length) {
      const [x, y] = q.pop(); comp.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && !seen[ny][nx] && '.abct~\u2248^R'.includes(grid[ny][nx])) {
          seen[ny][nx] = true; q.push([nx, ny]);
        }
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  if (comps.length <= 1) return 0;
  const mainSet = new Set(comps[0].map(([x, y]) => y * GW + x));
  let bridges = 0;
  for (let ci = 1; ci < comps.length; ci++) {
    let best = null;
    for (const [x, y] of comps[ci]) {
      for (const key of mainSet) {
        const mx = key % GW, my = Math.floor(key / GW);
        const d = Math.abs(x - mx) + Math.abs(y - my);
        if (!best || d < best.d) best = { d, x, y, mx, my };
      }
    }
    if (!best) continue;
    let cx = best.x, cy = best.y;
    while (cx !== best.mx) { cx += cx < best.mx ? 1 : -1; if (grid[cy][cx] === '#') grid[cy][cx] = '.'; }
    while (cy !== best.my) { cy += cy < best.my ? 1 : -1; if (grid[cy][cx] === '#') grid[cy][cx] = '.'; }
    for (const [x, y] of comps[ci]) mainSet.add(y * GW + x);
    bridges++;
  }
  return bridges;
}


function openAreas(grid, iters = 0) {
  const GH = grid.length, GW = grid[0].length;
  let g = grid;
  for (let it = 0; it < iters; it++) {
    const next = g.map((r) => r.slice());
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
      if (g[y][x] !== '#') continue;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if ('.abct~\u2248^R'.includes(g[ny][nx])) { n++; break; }
      }
      if (n > 0) next[y][x] = '.';
    }
    g = next;
  }
  return g;
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
      if (seen.has(k) || !'.abct~\u2248^R'.includes(grid[ny][nx])) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if ('.abct~\u2248^R'.includes(grid[y][x]) && !seen.has(y * GW + x)) grid[y][x] = '#';
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

// Depth pass: add cover along main lanes, around sites/mid and on long sightlines.
// Critical A* cells stay walkable; a connectivity restore removes cover that would cut routes.
const DEPTH_WALK = '.abct~\u2248^R';
const DEPTH_OPEN = '.abct~\u2248';
const DEPTH_COVER = 'C^R=oD';
function depthWalk(c) { return DEPTH_WALK.includes(c); }
function depthOpen(c) { return DEPTH_OPEN.includes(c); }
function depthCover(c) { return DEPTH_COVER.includes(c); }
function depthNeighbors(g, x, y) {
  let n = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && ny < g.length && nx < g[0].length && depthWalk(g[ny][nx])) n++;
  }
  return n;
}
function depthPathCells(g, sx, sy, tx, ty) {
  const GH = g.length, GW = g[0].length;
  if (sx < 0 || sy < 0 || tx < 0 || ty < 0 || sx >= GW || sy >= GH || tx >= GW || ty >= GH) return [];
  if (!depthWalk(g[sy][sx]) || !depthWalk(g[ty][tx])) return [];
  const parent = new Map();
  const q = [[sx, sy]];
  parent.set(sy * GW + sx, null);
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) {
      const cells = [];
      let cur = ty * GW + tx;
      while (cur !== null) {
        cells.push([cur % GW, Math.floor(cur / GW)]);
        const prev = parent.get(cur);
        if (prev === null) break;
        cur = prev;
      }
      return cells.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * GW + nx;
      if (nx < 0 || ny < 0 || ny >= GH || nx >= GW || parent.has(k) || !depthWalk(g[ny][nx])) continue;
      parent.set(k, y * GW + x);
      q.push([nx, ny]);
    }
  }
  return [];
}
function depthSiteBounds(s) {
  return { x0: s.fx - 2, y0: s.fy - 1, x1: s.fx + 1, y1: s.fy + 1 };
}
function depthInsideSite(x, y, sites) {
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (!s) continue;
    const b = depthSiteBounds(s);
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}
function depthSafe(g, critical, sites, x, y) {
  if (x < 0 || y < 0 || y >= g.length || x >= g[0].length) return false;
  if (g[y][x] !== '.') return false;
  if (critical.has(y * g[0].length + x)) return false;
  if (depthInsideSite(x, y, sites)) return false;
  return depthNeighbors(g, x, y) >= 2;
}
function depthPlace(g, critical, sites, x, y, ch, placed) {
  if (!depthSafe(g, critical, sites, x, y)) return false;
  g[y][x] = ch;
  placed.push([x, y]);
  return true;
}
function depthConnectivity(g) {
  const GH = g.length, GW = g[0].length;
  let start = null;
  for (let y = 0; y < GH && !start; y++) for (let x = 0; x < GW; x++) {
    if (depthWalk(g[y][x])) { start = [x, y]; break; }
  }
  if (!start) return { total: 0, unreachable: [] };
  const seen = new Set([start[1] * GW + start[0]]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * GW + nx;
      if (nx < 0 || ny < 0 || ny >= GH || nx >= GW || seen.has(k) || !depthWalk(g[ny][nx])) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  const unreachable = [];
  let total = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!depthWalk(g[y][x])) continue;
    total++;
    if (!seen.has(y * GW + x)) unreachable.push([x, y]);
  }
  return { total, unreachable };
}
function depthRestore(g, placed) {
  for (let pass = 0; pass < 30; pass++) {
    const conn = depthConnectivity(g);
    if (!conn.unreachable.length) return conn;
    const bad = new Set(conn.unreachable.map(([x, y]) => y * g[0].length + x));
    let removed = false;
    for (let i = placed.length - 1; i >= 0; i--) {
      const [x, y] = placed[i];
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
        const k = (y + dy) * g[0].length + (x + dx);
        if (bad.has(k)) near = true;
      }
      if (!near) continue;
      g[y][x] = '.';
      placed.splice(i, 1);
      removed = true;
      break;
    }
    if (!removed) break;
  }
  return depthConnectivity(g);
}


function depthBreakLongestRun(grid, sites, highPoints, limit = 60) {
  const GH = grid.length, GW = grid[0].length;
  const runs = [];
  for (let y = 0; y < GH; y++) {
    let run = [];
    for (let x = 0; x < GW; x++) {
      if (depthOpen(grid[y][x])) run.push([x, y]);
      else { if (run.length >= limit) runs.push(run); run = []; }
    }
    if (run.length >= limit) runs.push(run);
  }
  runs.sort((a, b) => b.length - a.length);
  const seen = new Set();
  let added = 0;
  for (const run of runs) {
    if (added >= 16) break;
    for (const frac of [0.5]) {
      if (added >= 16) break;
      const pi = Math.floor(run.length * frac);
      if (pi <= 0 || pi >= run.length - 1) continue;
      const [x, y] = run[pi];
      if (x < 1 || y < 1 || x >= GW - 1 || y >= GH - 1) continue;
      const key = y * GW + x;
      if (seen.has(key) || grid[y][x] !== '.' || depthInsideSite(x, y, sites)) continue;
      grid[y][x] = '^';
      highPoints.push({ x: (x + 1) * TILE, y: (y + 1) * TILE, face: 0, site: 'long' });
      seen.add(key);
      for (const [rx, ry] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (rx >= 0 && ry >= 0 && rx < GW && ry < GH && grid[ry][rx] === '.') {
          grid[ry][rx] = 'R';
          break;
        }
      }
      added++;
    }
  }
  return added;
}

function depthBreakRunsVertical(grid, highPoints, limit = 60) {
  const GH = grid.length, GW = grid[0].length;
  let added = 0;
  const seen = new Set();
  const tryBreak = (cells) => {
    if (cells.length < limit || added >= 2) return;
    for (const frac of [0.4, 0.6]) {
      if (added >= 2) break;
      const pi = Math.floor(cells.length * frac);
      if (pi <= 0 || pi >= cells.length - 1) continue;
      const [x, y] = cells[pi];
      const key = y * GW + x;
      if (seen.has(key)) continue;
      const [nx, ny] = cells[Math.min(cells.length - 1, pi + 1)];
      const face = Math.atan2(ny - y, nx - x);
      const p = addPlatform(grid, [x, y], face, 'long');
      if (p) {
        highPoints.push({ x: (p.x + 1) * TILE, y: (p.y + 1) * TILE, face: p.face, site: 'long' });
        seen.add(key);
        added++;
      }
    }
  };
  for (let y = 0; y < GH; y++) {
    let run = [];
    for (let x = 0; x < GW; x++) {
      if (depthOpen(grid[y][x])) run.push([x, y]);
      else { tryBreak(run); run = []; }
    }
    tryBreak(run);
  }
  for (let x = 0; x < GW; x++) {
    let run = [];
    for (let y = 0; y < GH; y++) {
      if (depthOpen(grid[y][x])) run.push([x, y]);
      else { tryBreak(run); run = []; }
    }
    tryBreak(run);
  }
  return added;
}

function depthBreakLongRuns(g, critical, sites, placed, limit = 44, maxPerRun = 2) {
  const GH = g.length, GW = g[0].length;
  let added = 0;
  const tryBreak = (cells) => {
    if (cells.length < limit) return 0;
    const picks = [Math.floor(cells.length * 0.4), Math.floor(cells.length * 0.6)];
    let n = 0;
    for (const pi of picks) {
      if (n >= maxPerRun) break;
      const [x, y] = cells[pi];
      const ch = (n % 2 === 0) ? 'C' : 'o';
      if (depthPlace(g, critical, sites, x, y, ch, placed)) n++;
      else if (pi > 0 && depthPlace(g, critical, sites, cells[pi - 1][0], cells[pi - 1][1], ch, placed)) n++;
      else if (pi < cells.length - 1 && depthPlace(g, critical, sites, cells[pi + 1][0], cells[pi + 1][1], ch, placed)) n++;
    }
    added += n;
    return n;
  };
  for (let y = 0; y < GH; y++) {
    let run = [];
    for (let x = 0; x < GW; x++) {
      if (depthOpen(g[y][x])) run.push([x, y]);
      else { tryBreak(run); run = []; }
    }
    tryBreak(run);
  }
  for (let x = 0; x < GW; x++) {
    let run = [];
    for (let y = 0; y < GH; y++) {
      if (depthOpen(g[y][x])) run.push([x, y]);
      else { tryBreak(run); run = []; }
    }
    tryBreak(run);
  }
  return added;
}
function enrichCover(grid, sites, spawn, highPoints, depthOpts = {}) {
  const GW = grid[0].length, GH = grid.length;
  const critical = new Set();
  const paths = [];
  const addPath = (sx, sy, tx, ty, label) => {
    const cells = depthPathCells(grid, sx, sy, tx, ty);
    if (!cells.length) return;
    for (const [x, y] of cells) critical.add(y * GW + x);
    paths.push({ label, cells });
  };
  const tSpawn = spawn ? [spawn.tx, spawn.ty] : null;
  const cSpawn = spawn ? [spawn.cx, spawn.cy] : null;
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (!s) continue;
    if (tSpawn) addPath(tSpawn[0], tSpawn[1], s.fx, s.fy, 'T->' + key);
    if (cSpawn) addPath(cSpawn[0], cSpawn[1], s.fx, s.fy, 'CT->' + key);
  }
  const center = [Math.floor(GW / 2), Math.floor(GH / 2)];
  const mid = nearestFloor(grid, center[0], center[1]);
  if (mid && tSpawn) addPath(tSpawn[0], tSpawn[1], mid[0], mid[1], 'T->mid');
  if (mid && cSpawn) addPath(cSpawn[0], cSpawn[1], mid[0], mid[1], 'CT->mid');
  const placed = [];
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (!s) continue;
    const b = depthSiteBounds(s);
    const cells = [];
    for (let r = 1; r <= 4; r++) {
      for (let x = b.x0 - r; x <= b.x1 + r; x++) {
        for (const y of [b.y0 - r, b.y1 + r]) if (x >= 0 && y >= 0 && x < GW && y < GH) cells.push([x, y]);
      }
      for (let y = b.y0 - r; y <= b.y1 + r; y++) {
        for (const x of [b.x0 - r, b.x1 + r]) if (x >= 0 && y >= 0 && x < GW && y < GH) cells.push([x, y]);
      }
    }
    cells.sort((a, b2) => (Math.abs(a[0] - cSpawn[0]) + Math.abs(a[1] - cSpawn[1])) - (Math.abs(b2[0] - cSpawn[0]) + Math.abs(b2[1] - cSpawn[1])));
    let n = 0;
    for (const [x, y] of cells) {
      if (n >= (depthOpts.siteCover === undefined ? 6 : depthOpts.siteCover)) break;
      const ch = (n % 3 === 0) ? 'o' : 'C';
      if (depthPlace(grid, critical, sites, x, y, ch, placed)) n++;
      else if (depthPlace(grid, critical, sites, x - 1, y, ch, placed)) n++;
    }
  }
  let lane = 0;
  for (const { label, cells } of paths) {
    if (!label.startsWith('T->')) continue;
    // 沿主路等间隔铺掩体（每段约 8 格一块，保证 lane 内有多块连续掩体）
    const step = Math.max(4, Math.floor(cells.length / 8));
    const start = Math.floor(cells.length * 0.14);
    const end = Math.floor(cells.length * 0.45);
    for (let i = start; i < end; i += step) {
      const [x, y] = cells[i];
      const [nx, ny] = cells[Math.min(cells.length - 1, i + 1)];
      const dx = nx - x, dy = ny - y;
      let ox = 0, oy = 0;
      if (Math.abs(dx) >= Math.abs(dy)) { oy = 1; if (i % 2) oy = -1; }
      else { ox = 1; if (i % 2) ox = -1; }
      const ch = (lane % 4 === 0) ? 'o' : 'C';
      if (depthPlace(grid, critical, sites, x + ox, y + oy, ch, placed)) lane++;
      else if (depthPlace(grid, critical, sites, x - ox, y - oy, ch, placed)) lane++;
    }
  }
  if (mid) {
    const cands = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 4) continue;
      const x = mid[0] + dx, y = mid[1] + dy;
      if (x >= 0 && y >= 0 && x < GW && y < GH && grid[y][x] === '.') cands.push([x, y, Math.hypot(dx, dy)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    let n = 0;
    for (const [x, y] of cands) {
      if (n >= 4) break;
      const ch = (n === 2) ? 'o' : 'C';
      if (depthPlace(grid, critical, sites, x, y, ch, placed)) n++;
    }
  }
  depthBreakRunsVertical(grid, highPoints, depthOpts.runLimit === undefined ? 60 : depthOpts.runLimit);
  depthBreakLongestRun(grid, sites, highPoints, depthOpts.runLimit === undefined ? 60 : depthOpts.runLimit);
  depthBreakLongRuns(grid, critical, sites, placed, depthOpts.longLimit === undefined ? 40 : depthOpts.longLimit, 2);
  let extraHigh = 0;
  for (const { label, cells } of paths) {
    if (!label.startsWith('T->')) continue;
    const tPlatforms = depthOpts.tPlatforms === undefined ? 2 : depthOpts.tPlatforms;
    for (let pi = 0; pi < tPlatforms; pi++) {
      const frac = tPlatforms === 1 ? 0.45 : 0.25 + pi * (0.5 / (tPlatforms - 1));
      const idx = Math.floor(cells.length * frac);
      if (idx <= 0 || idx >= cells.length - 1) continue;
      const [x, y] = cells[idx];
      const [nx, ny] = cells[Math.min(cells.length - 1, idx + 1)];
      const face = Math.atan2(ny - y, nx - x);
      const p = addPlatform(grid, [x, y], face, label.slice(3));
      if (p) {
        highPoints.push({ x: (p.x + 1) * TILE, y: (p.y + 1) * TILE, face: p.face, site: label.slice(3) });
        extraHigh++;
      }
    }
  }

  const conn = depthRestore(grid, placed);
  if (conn.unreachable.length) {
    const bad = conn.unreachable[0];
    const near = placed.filter(([x, y]) => Math.abs(x - bad[0]) + Math.abs(y - bad[1]) <= 2);
    console.error('depth debug bad=' + bad.join(',') + ' near=' + JSON.stringify(near));
    throw new Error('cover depth pass disconnected map: ' + conn.unreachable.length + ' first=' + bad.join(','));
  }
  return placed.length;
}
const SPEC = [
  { id: 'dust2', outId: 'dust2', name: '\u6c99\u6f20\u9057\u5740', accent: '#ff8a2a', targets: { A: 0, B: 0 }, floorRatio: 0.38, bridgeDist: 8, dilateNeighbors: 5, depth: { siteCover: 12, longLimit: 9999, tPlatforms: 2, runLimit: 9999 } },
  { id: 'mirage', outId: 'canal', name: '\u8fd0\u6cb3\u5c0f\u9547', accent: '#6ad1a8', targets: { A: 0, B: 0 }, gridWidth: 160, floorRatio: 0.10, bridgeDist: 30, dilateNeighbors: 2, forceOfficialFloor: true, openAreas: 2, depth: { siteCover: 8, longLimit: 9999, tPlatforms: 0, runLimit: 9999 } },
  { id: 'inferno', outId: 'metro', name: '\u5730\u94c1\u67a2\u7ebd', accent: '#b08aff', targets: { A: 0, B: 0 }, gridWidth: 160, floorRatio: 0.15, bridgeDist: 6, dilateNeighbors: 3, forceOfficialFloor: true, openAreas: 2, depth: { siteCover: 4, longLimit: 9999, tPlatforms: 2, runLimit: 9999 } },
];

const outMaps = {};
for (const spec of SPEC) {
  const info = parseRef(spec.id);
  let grid = buildRadarGrid(spec.id, spec);
  if (spec.forceOfficialFloor) {
    const forced = forceOfficialFloor(grid, spec.id, spec);
    connectOpenComponents(grid);
    grid = openAreas(grid, spec.openAreas || 0);
  }
  const placed = placeSitesAndSpawns(grid, info, spec.targets || {});
  grid = placed.grid;
  const sites = { A: placed.raw.a, B: placed.raw.b };
  const highPoints = addVerticalLayers(grid, sites);
  pruneUnreachable(grid);
  const coverCount = enrichCover(grid, sites, placed.spawn, highPoints, spec.depth || {});
  pruneUnreachable(grid);
  const rows = grid.map((r) => r.join(''));
  const GH = rows.length;
  let open = 0, wall = 0, vertical = 0;
  for (const row of rows) for (const c of row) {
    if ('.abct~≈^R'.includes(c)) open++;
    else if (c === '#') wall++;
    if (c === '^' || c === 'R') vertical++;
  }
  console.log(`${spec.outId}: ${GW}x${GH} open=${(open / (open + wall) * 100).toFixed(1)}% cover=${coverCount} vertical=${vertical} highPoints=${highPoints.length} spawn=${JSON.stringify(placed.spawn)}`);
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
