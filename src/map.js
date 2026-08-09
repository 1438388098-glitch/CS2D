import { TILE, MAPS } from './config.js';
import { clamp } from './utils.js';
import { shouldKeepPath, canRerouteAgain, shouldUnstuck } from './ai/rules.js';

let MAP = null;
const DEFAULT_TILE = TILE;
function tileSize() { return MAP ? MAP.tile : DEFAULT_TILE; }

function growSiteBounds(rows, cells, T) {
  if (!cells || !cells.length) return null;
  const pad = T <= 20 ? 8 : 4;
  let cx = 0, cy = 0;
  for (const [x, y] of cells) { cx += x; cy += y; }
  cx /= cells.length;
  cy /= cells.length;
  const w = rows[0].length;
  const seen = new Set(cells.map(([x, y]) => y * w + x));
  const q = cells.slice();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  while (q.length) {
    const [x, y] = q.shift();
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= rows.length) continue;
      const k = ny * w + nx;
      if (seen.has(k)) continue;
      if (!walkableTile(rows, nx, ny)) continue;
      if (Math.hypot(nx - cx, ny - cy) > pad) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return { x0, y0, x1, y1 };
}

function scanTiles(rows, T) {
  const sites = { A: null, B: null };
  const siteCells = { A: [], B: [] };
  const spawns = { t: [], ct: [] };
  for (let ty = 0; ty < rows.length; ty++) {
    for (let tx = 0; tx < rows[ty].length; tx++) {
      const c = rows[ty][tx];
      if (c === 'a' || c === 'b') {
        const key = c === 'a' ? 'A' : 'B';
        siteCells[key].push([tx, ty]);
        if (!sites[key]) sites[key] = { x0: tx, y0: ty, x1: tx, y1: ty };
        else {
          sites[key].x0 = Math.min(sites[key].x0, tx);
          sites[key].y0 = Math.min(sites[key].y0, ty);
          sites[key].x1 = Math.max(sites[key].x1, tx);
          sites[key].y1 = Math.max(sites[key].y1, ty);
        }
      }
      if (c === 't') spawns.t.push({ x: tx * T + T / 2, y: ty * T + T / 2 });
      if (c === 'c') spawns.ct.push({ x: tx * T + T / 2, y: ty * T + T / 2 });
    }
  }
  const result = {};
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (!s) continue;
    const b = growSiteBounds(rows, siteCells[key], T);
    if (!b) continue;
    result[key] = {
      x0: b.x0 * T, y0: b.y0 * T,
      x1: (b.x1 + 1) * T, y1: (b.y1 + 1) * T,
      cx: (b.x0 + b.x1 + 1) * T / 2,
      cy: (b.y0 + b.y1 + 1) * T / 2,
      label: key
    };
  }
  return { sites: result, spawns };
}

function buildHolds(sites, rows, T) {
  const holds = {};
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (!s) continue;
    const tx0 = Math.floor(s.x0 / T), ty0 = Math.floor(s.y0 / T);
    const tx1 = Math.floor((s.x1 - 1) / T), ty1 = Math.floor((s.y1 - 1) / T);
    const anchors = [];
    const cx = (tx0 + tx1) / 2, cy = (ty0 + ty1) / 2;
    for (const [px, py] of [[tx0 + 2, ty0 + 2], [tx1 - 2, ty0 + 2], [tx0 + 2, ty1 - 2], [tx1 - 2, ty1 - 2]]) {
      if (px >= 0 && py >= 0 && px < rows[0].length && py < rows.length && walkableTile(rows, px, py)) {
        anchors.push({ x: px * T + T / 2, y: py * T + T / 2 });
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
        entry = { x: ex * T + T / 2, y: ey * T + T / 2 };
      }
    }
    if (!anchors.length) {
      anchors.push({ x: (tx0 + 1) * T, y: (ty0 + 1) * T });
    }
    holds[key] = { anchors, entry: entry || { x: s.cx, y: s.cy } };
  }
  return holds;
}

function walkableTile(rows, tx, ty) {
  return walkableChar(rows[ty][tx]);
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

function buildClearPoints(map) {
  const list = [];
  const sp = map.spawns.t[0];
  if (!sp) return list;
  const tsp = nearestWalkable(sp.x, sp.y);
  if (!tsp) return list;
  const T = map.tile;
  for (const key of ['A', 'B']) {
    const s = map.sites[key];
    if (!s) continue;
    const st = nearestWalkable(s.cx, s.cy);
    if (!st) continue;
    const path = aStar(tsp.x, tsp.y, st.x, st.y);
    if (!path) continue;
    let start = 0;
    for (let i = 0; i < path.length; i++) {
      const px = path[i].x * T + T / 2, py = path[i].y * T + T / 2;
      if (Math.hypot(px - s.cx, py - s.cy) < 460) { start = Math.max(0, i - 4); break; }
    }
    const step = Math.max(2, Math.floor(70 / T));
    for (let i = start; i < path.length; i += step) {
      const p = path[i];
      const next = path[Math.min(path.length - 1, i + step)];
      const px = p.x * T + T / 2, py = p.y * T + T / 2;
      list.push({
        x: px, y: py,
        face: Math.atan2(next.y - p.y, next.x - p.x),
        site: key,
        dist: Math.hypot(px - s.cx, py - s.cy)
      });
    }
  }
  return list;
}

function buildPreaimPoints(sites, holds) {
  const list = [];
  for (const key of ['A', 'B']) {
    const s = sites[key];
    const h = holds[key];
    if (!s || !h) continue;
    for (const a of h.anchors) {
      list.push({ x: a.x, y: a.y, site: key, face: Math.atan2(s.cy - a.y, s.cx - a.x) });
    }
  }
  return list;
}

const warnedDisconnected = new Set();

const MAP_LAYOUT = {
  dust2: { entryDist: 340, holdDists: [100, 190, 300] },
  canal: { entryDist: 420, holdDists: [80, 150, 220] },
  metro: { entryDist: 340, holdDists: [140, 260, 380] },
  // 大型边境熔炉图（150×140）：地图更大，攻防距离更长，按实际比例放大
  'foundry-port': { entryDist: 560, holdDists: [200, 360, 520] },
  'foundry-ridge': { entryDist: 560, holdDists: [200, 360, 520] },
  'foundry-ruin': { entryDist: 560, holdDists: [200, 360, 520] },
  // forge 程序化熔炉（80×52）：中等尺寸
  forge: { entryDist: 420, holdDists: [140, 240, 340] },
  // 单挑小图（1v1）：紧凑攻防，防 AI 站太远摸不到
  'duel-pit': { entryDist: 260, holdDists: [70, 120, 170] },
  'duel-alley': { entryDist: 260, holdDists: [70, 120, 170] },
  'duel-forge': { entryDist: 260, holdDists: [70, 120, 170] },
  // 自定义编辑器地图：默认中等布局，避免回退 dust2 缩放参数在小图上失效
  'custom-map': { entryDist: 420, holdDists: [140, 240, 340] }
};

function buildLanes(map) {
  const lanes = { A: [], B: [] };
  const sp = map.spawns.t[0];
  if (!sp) return lanes;
  const tsp = nearestWalkable(sp.x, sp.y);
  if (!tsp) return lanes;
  const T = map.tile;
  for (const key of ['A', 'B']) {
    const s = map.sites[key];
    const main = map.entries[key];
    if (!s || !main) continue;
    lanes[key].push(main);
    const cands = [];
    for (let ty = Math.floor(s.y0 / T) - 3; ty <= Math.floor(s.y1 / T) + 3; ty++) {
      for (let tx = Math.floor(s.x0 / T) - 3; tx <= Math.floor(s.x1 / T) + 3; tx++) {
        if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
        if (map.grid[ty][tx] !== '.') continue;
        const inSite = tx >= Math.floor(s.x0 / T) && tx < Math.floor(s.x1 / T) && ty >= Math.floor(s.y0 / T) && ty < Math.floor(s.y1 / T);
        if (inSite) continue;
        const nt = nearestWalkable(tx * T + T / 2, ty * T + T / 2);
        if (!nt) continue;
        const path = aStar(tsp.x, tsp.y, nt.x, nt.y);
        if (!path || path.length < 3) continue;
        const px = tx * T + T / 2, py = ty * T + T / 2;
        cands.push({ x: px, y: py, d: Math.hypot(px - main.x, py - main.y), path });
      }
    }
    cands.sort((a, b) => b.d - a.d);
    let added = 0;
    for (const c of cands) {
      if (added >= 2) break;
      const tooClose = lanes[key].some((l) => Math.hypot(l.x - c.x, l.y - c.y) < 160);
      if (tooClose) continue;
      lanes[key].push({ x: c.x, y: c.y });
      added++;
    }
  }
  return lanes;
}

export function loadMap(mapDef) {
  const T = mapDef.tile || TILE;
  const rows = mapDef.rows;
  const w = rows[0].length;
  const h = rows.length;
  const grid = rows.map((r) => r.split(''));
  const { sites, spawns } = scanTiles(rows, T);
  PATH_CACHE.clear();
  const diag = checkConnectivity(rows);
  if (diag.unreachable.length && !(mapDef.allowDisconnected || warnedDisconnected.has(mapDef.id))) {
    warnedDisconnected.add(mapDef.id);
    console.warn('[map] ' + mapDef.name + ' 有 ' + diag.unreachable.length + ' 个不可达格: ' +
      diag.unreachable.slice(0, 20).map((p) => p.x + ',' + p.y).join(' '));
  }
  MAP = {
    id: mapDef.id,
    name: mapDef.name,
    accent: mapDef.accent || '#ff8a2a',
    grid, rows, w, h,
    tile: T,
    W: w * T, H: h * T,
    center: { x: w * T / 2, y: h * T / 2 },
    sites, spawns,
    holds: buildHolds(sites, rows, T),
    barrels: (() => {
      const list = [];
      for (let ty = 0; ty < rows.length; ty++) {
        for (let tx = 0; tx < rows[ty].length; tx++) {
          if (rows[ty][tx] === 'o') list.push({ tx, ty, x: tx * T + T / 2, y: ty * T + T / 2, hp: 2 });
        }
      }
      return list;
    })(),
    crates: (() => {
      const list = [];
      for (let ty = 0; ty < rows.length; ty++) {
        for (let tx = 0; tx < rows[ty].length; tx++) {
          if (rows[ty][tx] === 'D') list.push({ tx, ty, x: tx * T + T / 2, y: ty * T + T / 2, hp: 2 });
        }
      }
      return list;
    })(),
    penPoints: mapDef.penPoints || [],
    highPoints: mapDef.highPoints || [],
    diagnostics: diag
  };
  const tsp = spawns.t[0] && nearestWalkable(spawns.t[0].x, spawns.t[0].y);
  MAP.entries = {};
  MAP.mid = null;
  if (tsp) {
    for (const key of ['A', 'B']) {
      const s = sites[key];
      if (!s) continue;
      const st = nearestWalkable(s.cx, s.cy);
      const path = aStar(tsp.x, tsp.y, st.x, st.y);
      if (!path) continue;
      const anchors = [];
      const wanted = (MAP_LAYOUT[mapDef.id] && MAP_LAYOUT[mapDef.id].holdDists) || (mapDef.id === 'metro' ? [140, 260, 380] : [100, 190, 300]);
      const tpx = tsp.x * T + T / 2, tpy = tsp.y * T + T / 2;
      for (const w of wanted) {
        let best = null, bestD = Infinity;
        for (let pi = 0; pi < path.length; pi++) {
          const p = path[pi];
          const px = p.x * T + T / 2, py = p.y * T + T / 2;
          const d = Math.hypot(px - s.cx, py - s.cy);
          const score = Math.abs(d - w);
          if (score < bestD && !anchors.some((c) => Math.hypot(c.x - px, c.y - py) < 70)) {
            bestD = score;
            best = { x: px, y: py, pi };
          }
        }
        if (best) {
          const prev = path[Math.max(0, best.pi - 1)];
          const ppx = prev.x * T + T / 2, ppy = prev.y * T + T / 2;
          best.face = Math.atan2(ppy - best.y, ppx - best.x);
          anchors.push(best);
        }
      }
      let entry = null, bestE = Infinity;
      for (const p of path) {
        const px = p.x * T + T / 2, py = p.y * T + T / 2;
        const d = Math.hypot(px - s.cx, py - s.cy);
        const entryDist = (MAP_LAYOUT[mapDef.id] && MAP_LAYOUT[mapDef.id].entryDist) || 340;
        const score = Math.abs(d - entryDist);
        if (score < bestE) { bestE = score; entry = { x: px, y: py }; }
      }
      if (entry) {
        for (const a of anchors) a.face = Math.atan2(entry.y - a.y, entry.x - a.x);
        MAP.entries[key] = entry;
      }
      if (anchors.length >= 2) MAP.holds[key].anchors = anchors;
    }
    const centerTile = nearestWalkable(MAP.W / 2, MAP.H / 2);
    const ctSpawnTile = spawns.ct[0] && nearestWalkable(spawns.ct[0].x, spawns.ct[0].y);
    let midTile = centerTile;
    if (ctSpawnTile && centerTile) {
      const midPath = aStar(ctSpawnTile.x, ctSpawnTile.y, centerTile.x, centerTile.y);
      if (midPath && midPath.length > 4) {
        midTile = midPath[Math.min(midPath.length - 1, Math.floor(midPath.length * 0.55))];
      }
    }
    if (midTile) MAP.mid = { x: midTile.x * T + T / 2, y: midTile.y * T + T / 2 };
  }
  MAP.clearPoints = buildClearPoints(MAP);
  MAP.lanes = buildLanes(MAP);
  MAP.clearChains = { A: [], B: [] };
  for (const cp of MAP.clearPoints) MAP.clearChains[cp.site].push(cp);
  for (const k of ['A', 'B']) MAP.clearChains[k].sort((a, b) => a.dist - b.dist);
  MAP.preaimPoints = buildPreaimPoints(MAP.sites, MAP.holds);
  return diag;
}

export function getMap() { return MAP; }

export function getGrid() { return MAP ? MAP.grid : []; }

export function getMapDiagnostics() { return MAP ? MAP.diagnostics : { walkableCount: 0, unreachable: [] }; }

// 纯判定：瓦片字符是否可走（无状态，供 raycast 等独立于全局 MAP 的模块使用）
export function walkableChar(c) {
  return c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '~' || c === '≈' || c === '^' || c === 'R';
}

export function walkable(tx, ty) {
  if (!MAP) return false;
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return false;
  return walkableChar(MAP.grid[ty][tx]);
}

// 寻路可用：与 walkable 一致（^ 高台可站且可作寻路目标/中间节点，见 test mech-tile-semantics）
export function pathable(tx, ty) {
  if (!MAP) return false;
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return false;
  return walkableChar(MAP.grid[ty][tx]);
}

// 像素坐标 -> 瓦片字符
export function tileAt(x, y) {
  if (!MAP) return '#';
  const tx = Math.floor(x / tileSize()), ty = Math.floor(y / tileSize());
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return '#';
  return MAP.grid[ty][tx];
}

export function groundElevationAt(x, y) {
  if (!MAP) return 0;
  const T = tileSize();
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return 0;
  const c = MAP.grid[ty][tx];
  if (c === '^') return T;
  if (c === 'R') return T * 0.5;
  return 0;
}

export function passable(x, y) {
  return walkable(Math.floor(x / tileSize()), Math.floor(y / tileSize()));
}

// 子弹/视线的擦角容差判定（拟合真实 CS 物理）：
// 采样点落在墙格边缘 6px 内、且相邻瓦片可通行时，视为可擦角通过
export function passableTolerant(x, y) {
  if (passable(x, y)) return true;
  const fx = Math.floor(x / tileSize()), fy = Math.floor(y / tileSize());
  if (!MAP || fx < 0 || fy < 0 || fx >= MAP.w || fy >= MAP.h) return false;
  const ox = (x - fx * tileSize()) / tileSize(), oy = (y - fy * tileSize()) / tileSize();
  const TOL = 0.12;
  if (ox < TOL && walkable(fx - 1, fy)) return true;
  if (ox > 1 - TOL && walkable(fx + 1, fy)) return true;
  if (oy < TOL && walkable(fx, fy - 1)) return true;
  if (oy > 1 - TOL && walkable(fx, fy + 1)) return true;
  return false;
}

export function collideCircle(ent) {
  const r = ent.moveRad !== undefined ? ent.moveRad : ent.rad;
  const x0 = Math.floor((ent.x - r) / tileSize()), x1 = Math.floor((ent.x + r) / tileSize());
  const y0 = Math.floor((ent.y - r) / tileSize()), y1 = Math.floor((ent.y + r) / tileSize());
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (walkable(tx, ty)) continue;
      const wx = tx * tileSize(), wy = ty * tileSize();
      const cx = clamp(ent.x, wx, wx + tileSize()), cy = clamp(ent.y, wy, wy + tileSize());
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
    for (const s of game.smokes || []) {
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
  if (sx < 0 || sy < 0 || tx < 0 || ty < 0 || sx >= MAP.w || sy >= MAP.h || tx >= MAP.w || ty >= MAP.h) return null;
  const key = (x, y) => y * MAP.w + x;
  const cacheKey = sx + ',' + sy + '->' + tx + ',' + ty;
  // 确定性：缓存不设 wall-clock TTL（Date.now 依赖会让同 seed 两次运行结果不同），
  // 只依赖显式失效（loadMap / invalidatePathCache 在地形变化时调用）+ FIFO 容量裁剪
  const failHit = FAIL_CACHE.get(cacheKey);
  if (failHit) return null;
  const hit = PATH_CACHE.get(cacheKey);
  if (hit) return hit.path ? hit.path.slice() : null;
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
  while (heap.length && iter < 50000) {
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
  if (FAIL_CACHE.size > 128) {
    const keys = [...FAIL_CACHE.keys()];
    for (let i = 0; i < Math.min(64, keys.length); i++) FAIL_CACHE.delete(keys[i]);
  }
  if (!result) FAIL_CACHE.set(cacheKey, true);
  if (PATH_CACHE.size > 256) {
    const keys = [...PATH_CACHE.keys()];
    for (let i = 0; i < Math.min(128, keys.length); i++) PATH_CACHE.delete(keys[i]);
  }
  PATH_CACHE.set(cacheKey, { path: result });
  return result ? result.slice() : null;
}

const PATH_CACHE = new Map();
const FAIL_CACHE = new Map();

// 路径缓存失效：地图格子变化（炸桶/炸箱等）后调用，保证寻路与真实地形一致且可复现
export function invalidatePathCache() {
  PATH_CACHE.clear();
  FAIL_CACHE.clear();
}

export function nearestWalkable(px, py) {
  if (!MAP) return null;
  const tx = clamp(Math.floor(px / tileSize()), 0, MAP.w - 1);
  const ty = clamp(Math.floor(py / tileSize()), 0, MAP.h - 1);
  if (walkable(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r < 32; r++) {
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

// 无出生点地图兜底：就近返回团队侧的可行走格中心（像素坐标）
export function fallbackSpawn(team) {
  if (!MAP) return null;
  const T = tileSize();
  const rowsY = team === 't'
    ? [3, 4, 2, 5, 1, 6]
    : [MAP.h - 4, MAP.h - 5, MAP.h - 3, MAP.h - 6, MAP.h - 2, MAP.h - 7];
  for (const ty of rowsY) {
    if (ty < 0 || ty >= MAP.h) continue;
    for (let tx = 0; tx < MAP.w; tx++) {
      if (walkable(tx, ty)) return { x: tx * T + T / 2, y: ty * T + T / 2 };
    }
  }
  const t = nearestWalkable(MAP.W / 2, MAP.H / 2);
  return t ? { x: t.x * T + T / 2, y: t.y * T + T / 2 } : null;
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
  let path = aStar(s.x, s.y, t.x, t.y);
  if (!path) {
    outer:
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = t.x + dx, ny = t.y + dy;
          if (nx < 0 || ny < 0 || nx >= MAP.w || ny >= MAP.h || !walkable(nx, ny)) continue;
          path = aStar(s.x, s.y, nx, ny);
          if (path) break outer;
        }
      }
    }
  }
  e.path = path || null;
  e.pathI = 0;
  e.stuckT = 0;
  e.lastSample = { x: e.x, y: e.y };
}

// 纯地图视线（无烟雾）：路径平滑/短接用，仅判断地形遮挡
export function clearLos(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1) return true;
  const steps = Math.ceil(d / 8);
  for (let i = 0; i <= steps; i++) {
    const x = ax + (bx - ax) * i / steps;
    const y = ay + (by - ay) * i / steps;
    if (losBlocked(x, y)) return false;
  }
  return true;
}

export function followPath(e, dt, speed, skip = 0, scan = 0) {
  if (skip > 48) { e.path = null; e.pathI = 0; return false; }
  if (!MAP || !e.path || e.pathI >= e.path.length) { e.path = null; return false; }
  e.navTime = (e.navTime || 0) + dt;
  const wp = e.path[e.pathI];
  const wx = wp.x * tileSize() + tileSize() / 2, wy = wp.y * tileSize() + tileSize() / 2;
  const dx = wx - e.x, dy = wy - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 16) {
    e.pathI++;
    if (e.pathI >= e.path.length) { e.path = null; return false; }
    return followPath(e, dt, speed, skip + 1, scan);
  }
  // 路径短接（string pulling）：当前位置能直线看到更远的路点则跳过中间点，
  // 减少 4 连通 A* 的阶梯/贴墙角抖动。跳过只做前进方向收紧，绝不改路径终点语义。
  if (e.path.length - e.pathI > 1) {
    let skipped = false;
    for (let i = e.pathI + 1; i < e.path.length; i++) {
      const nw = e.path[i];
      const nx = nw.x * tileSize() + tileSize() / 2, ny = nw.y * tileSize() + tileSize() / 2;
      if (clearLos(e.x, e.y, nx, ny)) {
        e.pathI = i;
        skipped = true;
      } else break;
    }
    if (skipped) {
      const nwp = e.path[e.pathI];
      e.vx = (nwp.x * tileSize() + tileSize() / 2 - e.x) / Math.max(1, Math.hypot(nwp.x * tileSize() + tileSize() / 2 - e.x, nwp.y * tileSize() + tileSize() / 2 - e.y)) * speed * (e.walking ? 0.55 : 1);
      e.vy = (nwp.y * tileSize() + tileSize() / 2 - e.y) / Math.max(1, Math.hypot(nwp.x * tileSize() + tileSize() / 2 - e.x, nwp.y * tileSize() + tileSize() / 2 - e.y)) * speed * (e.walking ? 0.55 : 1);
      e.moving = true;
      e.angle = Math.atan2(nwp.y * tileSize() + tileSize() / 2 - e.y, nwp.x * tileSize() + tileSize() / 2 - e.x);
      if (scan) {
        let a = e.angle + scan;
        const twoPi = Math.PI * 2;
        a = ((a % twoPi) + twoPi) % twoPi;
        e.angle = a;
      }
      const moved2 = Math.hypot(e.x - (e.lastSample ? e.lastSample.x : e.x), e.y - (e.lastSample ? e.lastSample.y : e.y));
      if (shouldKeepPath(e, e.lastSample ? e.lastSample.x : e.x, e.lastSample ? e.lastSample.y : e.y, e.x, e.y)) {
        e.stuckT = Math.max(0, (e.stuckT || 0) - dt);
        e.lastSample = { x: e.x, y: e.y };
      }
      return true;
    }
  }
  const spd = speed * (e.walking ? 0.55 : 1);
  e.vx = dx / d * spd;
  e.vy = dy / d * spd;
  e.moving = true;
  e.angle = Math.atan2(dy, dx);
  if (scan) {
    let a = e.angle + scan;
    const twoPi = Math.PI * 2;
    a = ((a % twoPi) + twoPi) % twoPi;
    e.angle = a;
  }
  const moved = Math.hypot(e.x - (e.lastSample ? e.lastSample.x : e.x), e.y - (e.lastSample ? e.lastSample.y : e.y));
  if (shouldKeepPath(e, e.lastSample ? e.lastSample.x : e.x, e.lastSample ? e.lastSample.y : e.y, e.x, e.y)) {
    e.stuckT = Math.max(0, (e.stuckT || 0) - dt);
    e.lastSample = { x: e.x, y: e.y };
  } else if (moved < Math.max(4, speed * dt * 0.3)) {
    e.stuckT = (e.stuckT || 0) + dt;
    if (shouldUnstuck(e, e.stuckT, moved) && canRerouteAgain(e, e.lastRerouteAt, e.navTime)) {
      e.stuckEscapes = (e.stuckEscapes || 0) + 1;
      e.lastRerouteAt = e.navTime;
      const sideDir = (e.anchorIdx || 0) % 2 ? 1 : -1;
      const sideAng = e.stuckEscapes > 2 ? Math.atan2(wy - e.y, wx - e.x) + Math.PI / 2 * sideDir : 0;
      pathTo(e, wx + Math.cos(sideAng) * 80, wy + Math.sin(sideAng) * 80);
      e.stuckT = 0;
      e.lastSample = { x: e.x, y: e.y };
      return true;
    }
    if (e.stuckT > 1.5) {
      e.path = null;
      e.pathI = 0;
      e.stuckT = 0;
      e.lastSample = { x: e.x, y: e.y };
      return false;
    }
  }
  return true;
}

export function inSite(x, y, site) {
  return x >= site.x0 && x < site.x1 && y >= site.y0 && y < site.y1;
}

export function nearestSite(x, y) {
  if (!MAP) return null;
  if (!MAP.sites.A || !MAP.sites.B) return null;
  const da = Math.hypot(x - MAP.sites.A.cx, y - MAP.sites.A.cy);
  const db = Math.hypot(x - MAP.sites.B.cx, y - MAP.sites.B.cy);
  return da < db ? MAP.sites.A : MAP.sites.B;
}

export function isWater(x, y) {
  if (!MAP) return false;
  const tx = Math.floor(x / tileSize()), ty = Math.floor(y / tileSize());
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
