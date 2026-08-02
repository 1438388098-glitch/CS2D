import { TILE, MAPS } from './config.js';
import { clamp } from './utils.js';

let MAP = null;

function scanTiles(rows) {
  const sites = { A: null, B: null };
  const spawns = { t: [], ct: [] };
  for (let ty = 0; ty < rows.length; ty++) {
    for (let tx = 0; tx < rows[ty].length; tx++) {
      const c = rows[ty][tx];
      if (c === 'a' || c === 'b') {
        const key = c === 'a' ? 'A' : 'B';
        if (!sites[key]) sites[key] = { x0: tx, y0: ty, x1: tx, y1: ty };
        else {
          sites[key].x0 = Math.min(sites[key].x0, tx);
          sites[key].y0 = Math.min(sites[key].y0, ty);
          sites[key].x1 = Math.max(sites[key].x1, tx);
          sites[key].y1 = Math.max(sites[key].y1, ty);
        }
      }
      if (c === 't') spawns.t.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
      if (c === 'c') spawns.ct.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
    }
  }
  const result = {};
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (!s) continue;
    result[key] = {
      x0: s.x0 * TILE, y0: s.y0 * TILE,
      x1: (s.x1 + 1) * TILE, y1: (s.y1 + 1) * TILE,
      cx: (s.x0 + s.x1 + 1) * TILE / 2,
      cy: (s.y0 + s.y1 + 1) * TILE / 2,
      label: key
    };
  }
  return { sites: result, spawns };
}

function buildHolds(sites, rows) {
  const holds = {};
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (!s) continue;
    const tx0 = Math.floor(s.x0 / TILE), ty0 = Math.floor(s.y0 / TILE);
    const tx1 = Math.floor((s.x1 - 1) / TILE), ty1 = Math.floor((s.y1 - 1) / TILE);
    const anchors = [];
    const cx = (tx0 + tx1) / 2, cy = (ty0 + ty1) / 2;
    for (const [px, py] of [[tx0 + 2, ty0 + 2], [tx1 - 2, ty0 + 2], [tx0 + 2, ty1 - 2], [tx1 - 2, ty1 - 2]]) {
      if (px >= 0 && py >= 0 && px < rows[0].length && py < rows.length && walkableTile(rows, px, py)) {
        anchors.push({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 });
      }
    }
    // 入口点：扫描站点四边外侧的可走格，取离站点中心方向最近的
    let entry = null;
    let bestD = Infinity;
    const edges = [];
    for (let x = tx0; x <= tx1; x++) {
      edges.push([x, ty0 - 1], [x, ty1 + 1]);
    }
    for (let y = ty0; y <= ty1; y++) {
      edges.push([tx0 - 1, y], [tx1 + 1, y]);
    }
    for (const [ex, ey] of edges) {
      if (ex < 0 || ey < 0 || ex >= rows[0].length || ey >= rows.length) continue;
      if (!walkableTile(rows, ex, ey)) continue;
      const d = Math.hypot(ex - cx, ey - cy);
      if (d < bestD) {
        bestD = d;
        entry = { x: ex * TILE + TILE / 2, y: ey * TILE + TILE / 2 };
      }
    }
    if (!anchors.length) {
      anchors.push({ x: (tx0 + 1) * TILE, y: (ty0 + 1) * TILE });
    }
    holds[key] = { anchors, entry: entry || { x: s.cx, y: s.cy } };
  }
  return holds;
}

function walkableTile(rows, tx, ty) {
  const c = rows[ty][tx];
  return c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '~' || c === '≈' || c === '^';
}

function checkConnectivity(rows) {
  const w = rows[0].length, h = rows.length;
  const start = (() => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (walkableTile(rows, x, y)) return [x, y];
      }
    }
    return null;
  })();
  if (!start) return { walkableCount: 0, unreachable: [] };
  const seen = new Set();
  const queue = [start];
  seen.add(start[1] * w + start[0]);
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (seen.has(k)) continue;
      if (!walkableTile(rows, nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  const unreachable = [];
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (walkableTile(rows, x, y)) {
        total++;
        if (!seen.has(y * w + x)) unreachable.push({ x, y });
      }
    }
  }
  return { walkableCount: total, unreachable };
}

export function loadMap(mapDef) {
  const rows = mapDef.rows;
  const w = rows[0].length;
  const h = rows.length;
  const grid = rows.map((r) => r.split(''));
  const { sites, spawns } = scanTiles(rows);
  PATH_CACHE.clear();
  const diag = checkConnectivity(rows);
  if (diag.unreachable.length) {
    console.warn('[map] ' + mapDef.name + ' 有 ' + diag.unreachable.length + ' 个不可达格: ' +
      diag.unreachable.slice(0, 20).map((p) => p.x + ',' + p.y).join(' '));
  }
  MAP = {
    id: mapDef.id,
    name: mapDef.name,
    accent: mapDef.accent || '#ff8a2a',
    grid, rows, w, h,
    W: w * TILE, H: h * TILE,
    center: { x: w * TILE / 2, y: h * TILE / 2 },
    sites, spawns,
    holds: buildHolds(sites, rows),
    barrels: (() => {
      const list = [];
      for (let ty = 0; ty < rows.length; ty++) {
        for (let tx = 0; tx < rows[ty].length; tx++) {
          if (rows[ty][tx] === 'o') list.push({ tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, hp: 2 });
        }
      }
      return list;
    })(),
    crates: (() => {
      const list = [];
      for (let ty = 0; ty < rows.length; ty++) {
        for (let tx = 0; tx < rows[ty].length; tx++) {
          if (rows[ty][tx] === 'D') list.push({ tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, hp: 2 });
        }
      }
      return list;
    })(),
    penPoints: mapDef.penPoints || [],
    highPoints: mapDef.highPoints || [],
    diagnostics: diag
  };
  return diag;
}

export function getMap() { return MAP; }

export function getGrid() { return MAP ? MAP.grid : []; }

export function getMapDiagnostics() { return MAP ? MAP.diagnostics : { walkableCount: 0, unreachable: [] }; }

export function walkable(tx, ty) {
  if (!MAP) return false;
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return false;
  const c = MAP.grid[ty][tx];
  return c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '~' || c === '≈' || c === '^';
}

// 寻路可用（^ 高台可站不可越，排除在寻路外）
export function pathable(tx, ty) {
  if (!MAP) return false;
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return false;
  const c = MAP.grid[ty][tx];
  return c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '~' || c === '≈';
}

// 像素坐标 -> 瓦片字符
export function tileAt(x, y) {
  if (!MAP) return '#';
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return '#';
  return MAP.grid[ty][tx];
}

export function passable(x, y) {
  return walkable(Math.floor(x / TILE), Math.floor(y / TILE));
}

// 子弹/视线的擦角容差判定（拟合真实 CS 物理）：
// 采样点落在墙格边缘 6px 内、且相邻瓦片可通行时，视为可擦角通过
export function passableTolerant(x, y) {
  if (passable(x, y)) return true;
  const fx = Math.floor(x / TILE), fy = Math.floor(y / TILE);
  if (!MAP || fx < 0 || fy < 0 || fx >= MAP.w || fy >= MAP.h) return false;
  const ox = (x - fx * TILE) / TILE, oy = (y - fy * TILE) / TILE;
  const TOL = 0.12;
  if (ox < TOL && walkable(fx - 1, fy)) return true;
  if (ox > 1 - TOL && walkable(fx + 1, fy)) return true;
  if (oy < TOL && walkable(fx, fy - 1)) return true;
  if (oy > 1 - TOL && walkable(fx, fy + 1)) return true;
  return false;
}

export function collideCircle(ent) {
  const r = ent.rad;
  const x0 = Math.floor((ent.x - r) / TILE), x1 = Math.floor((ent.x + r) / TILE);
  const y0 = Math.floor((ent.y - r) / TILE), y1 = Math.floor((ent.y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (walkable(tx, ty)) continue;
      const wx = tx * TILE, wy = ty * TILE;
      const cx = clamp(ent.x, wx, wx + TILE), cy = clamp(ent.y, wy, wy + TILE);
      const dx = ent.x - cx, dy = ent.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (r - d) / d;
        ent.x += dx * push;
        ent.y += dy * push;
      }
    }
  }
  if (MAP) {
    ent.x = clamp(ent.x, r, MAP.W - r);
    ent.y = clamp(ent.y, r, MAP.H - r);
  }
}

// 视线阻挡：薄墙可看穿；高台观察者无视矮掩体(C)；深水/实墙/油桶阻挡
function losBlocked(x, y, optH) {
  if (passableTolerant(x, y)) return false;
  const c = tileAt(x, y);
  if (c === '=') return false;
  if (c === 'C' && optH === 1) return false;
  return true;
}

export function los(game, ax, ay, bx, by, optH) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1) return true;
  // 步长与 fireRay 子弹采样一致（6px），保证视线与命中判定对称（擦角结果相同）
  const steps = Math.ceil(d / 6);
  for (let i = 0; i <= steps; i++) {
    const x = ax + (bx - ax) * i / steps;
    const y = ay + (by - ay) * i / steps;
    if (losBlocked(x, y, optH)) return false;
    for (const s of game.smokes) {
      const dx = x - s.x, dy = y - s.y;
      const rr = s.r + 8;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (Math.hypot(x - s.x, y - s.y) < s.r + 8) return false;
    }
  }
  const obsw = tileAt(ax, ay) === '≈';
  const tgtw = tileAt(bx, by) === '≈';
  if (tgtw && !obsw) return false;
  return true;
}

export function aStar(sx, sy, tx, ty) {
  if (!MAP || !walkable(tx, ty)) return null;
  const key = (x, y) => y * MAP.w + x;
  const cacheKey = sx + ',' + sy + '->' + tx + ',' + ty;
  const now = Date.now();
  const hit = PATH_CACHE.get(cacheKey);
  if (hit && now - hit.time < 150) return hit.path ? hit.path.slice() : null;
  const start = key(sx, sy);
  const g = new Map(), came = new Map(), closed = new Set();
  const heap = [];
  function push(n) {
    let i = heap.length;
    heap.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= n.f) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = n;
  }
  function pop() {
    if (!heap.length) return undefined;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < heap.length && heap[l].f < last.f) s = l;
        if (r < heap.length && heap[r].f < heap[s].f) s = r;
        if (s === i) break;
        heap[i] = heap[s];
        i = s;
      }
      heap[i] = last;
    }
    return top;
  }
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
  g.set(start, 0);
  push({ x: sx, y: sy, f: h(sx, sy), k: start });
  let iter = 0;
  let result = null;
  while (heap.length && iter < 4000) {
    iter++;
    const n = pop();
    if (n.x === tx && n.y === ty) {
      const path = [];
      let cx = tx, cy = ty;
      while (true) {
        path.push({ x: cx, y: cy });
        const p = came.get(key(cx, cy));
        if (!p || (p.x === sx && p.y === sy)) break;
        cx = p.x; cy = p.y;
      }
      if (path[path.length - 1].x !== sx || path[path.length - 1].y !== sy) path.push({ x: sx, y: sy });
      result = path.reverse();
      break;
    }
    closed.add(n.k);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = n.x + dx, ny = n.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP.w || ny >= MAP.h) continue;
      const k = key(nx, ny);
      if (closed.has(k)) continue;
      if (!walkable(nx, ny)) continue;
      if (!pathable(nx, ny) && !(nx === tx && ny === ty)) continue;
      const ng = g.get(n.k) + 1;
      if (ng < (g.get(k) === undefined ? 1e9 : g.get(k))) {
        g.set(k, ng);
        came.set(k, { x: n.x, y: n.y });
        push({ x: nx, y: ny, f: ng + h(nx, ny), k });
      }
    }
  }
  if (PATH_CACHE.size > 256) {
    const now2 = Date.now();
    for (const [k, v] of PATH_CACHE) {
      if (now2 - v.time > 1000) PATH_CACHE.delete(k);
    }
  }
  PATH_CACHE.set(cacheKey, { time: now, path: result });
  return result ? result.slice() : null;
}

const PATH_CACHE = new Map();

export function nearestWalkable(px, py) {
  if (!MAP) return null;
  const tx = clamp(Math.floor(px / TILE), 0, MAP.w - 1);
  const ty = clamp(Math.floor(py / TILE), 0, MAP.h - 1);
  if (walkable(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx >= 0 && ny >= 0 && nx < MAP.w && ny < MAP.h && walkable(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

export function pathTo(e, tx, ty) {
  if (!MAP) { e.path = null; e.pathI = 0; return; }
  const s = nearestWalkable(e.x, e.y);
  const t = nearestWalkable(tx, ty);
  if (!s || !t) { e.path = null; e.pathI = 0; return; }
  if (s.x === t.x && s.y === t.y) {
    e.path = [{ x: s.x, y: s.y }];
    e.pathI = 0;
    e.stuckT = 0;
    e.lastSample = { x: e.x, y: e.y };
    return;
  }
  e.path = aStar(s.x, s.y, t.x, t.y) || null;
  e.pathI = 0;
  e.stuckT = 0;
  e.lastSample = { x: e.x, y: e.y };
}

export function followPath(e, dt, speed) {
  if (!MAP || !e.path || e.pathI >= e.path.length) { e.path = null; return false; }
  const wp = e.path[e.pathI];
  const wx = wp.x * TILE + TILE / 2, wy = wp.y * TILE + TILE / 2;
  const dx = wx - e.x, dy = wy - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 16) {
    e.pathI++;
    if (e.pathI >= e.path.length) { e.path = null; return false; }
    return followPath(e, dt, speed);
  }
  const spd = speed * (e.walking ? 0.55 : 1);
  e.vx = dx / d * spd;
  e.vy = dy / d * spd;
  e.moving = true;
  return true;
}

export function inSite(x, y, site) {
  return x >= site.x0 && x < site.x1 && y >= site.y0 && y < site.y1;
}

export function nearestSite(x, y) {
  if (!MAP) return null;
  const da = Math.hypot(x - MAP.sites.A.cx, y - MAP.sites.A.cy);
  const db = Math.hypot(x - MAP.sites.B.cx, y - MAP.sites.B.cy);
  return da < db ? MAP.sites.A : MAP.sites.B;
}

export function isWater(x, y) {
  if (!MAP) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const c = MAP.grid[ty] && MAP.grid[ty][tx];
  return c === '~' || c === '≈';
}

export function findMapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

loadMap(MAPS[0] || {
  id: 'default', name: '默认地图', accent: '#ff8a2a',
  rows: (() => {
    const b = [];
    for (let i = 0; i < 45; i++) b.push('#'.repeat(60));
    return b;
  })()
});
