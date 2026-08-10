// metro 特化：CT 回防 A 点推荐路线（backlog candidate-156，地图模块）
//
// 背景：metro（地铁）CT 从 B/中路回防 A 点时，旧逻辑按"欧氏距离"从 clearChains 选回防点。
//       本图 CT 出生区在右上、A 点位于右下，中央被墙体隔开，实际路径必须走左侧走廊绕行——
//       欧氏距离会把"看着近、绕远路"的进点排到前面（如 CT 出生点到东侧进点欧氏更近但路径更远），
//       且全员扎堆 T 主通道，被安弹后的架枪线收割。
//
// 方案：纯函数 retakeRoute(map, fromX, fromY, siteCenter[, opts])：
//   - 只读传入的 map（grid/tile/sites/w/h），自带确定性 BFS 寻路，不依赖全局状态/RNG/时间；
//   - 按寻路路径长度选回防进点（近），并偏好 CT 半场侧（东侧）夹击入口（安全）；
//   - 超出最大绕行上限时退回最短侧，保证"近且不绕远"；
//   - 返回 { route(像素路径), tiles(瓦片路径), target(包点中心), entry(进点), entryName, side,
//           site, firstDir(初始朝向), face(进点预瞄朝向), entryLen, pathLen }。
import { walkableChar } from './map.js';

// metro A 点回防进点表（瓦片坐标，随调用时按 walkable 过滤，地图改动时自动跳过失效点）
const METRO_A_ENTRIES = [
  { x: 116, y: 115, side: 'lane', name: 'A-west-lane' },
  { x: 124, y: 119, side: 'lane', name: 'A-south-lane' },
  { x: 128, y: 120, side: 'lane', name: 'A-south-lane-deep' },
  { x: 134, y: 110, side: 'east', name: 'A-east-mid' },
  { x: 135, y: 114, side: 'east', name: 'A-east-low' }
];

// 东侧（CT 半场侧）进点的安全加成（tile 单位）：路径差不多时优先走侧翼夹击
const SAFETY_BIAS = 16;
// 允许的最大绕行量（tile 单位）：强制侧超过该量则退回最短侧，避免"绕远路"
const MAX_DETOUR = 20;

function walkableAt(grid, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  return walkableChar(grid[y][x]);
}

// 确定性 4 连通 BFS 最短路径（无启发式、无缓存，结果只由 grid/起终点决定）
function shortestPath(grid, w, h, sx, sy, tx, ty) {
  if (!walkableAt(grid, w, h, sx, sy) || !walkableAt(grid, w, h, tx, ty)) return null;
  if (sx === tx && sy === ty) return [{ x: sx, y: sy }];
  const key = (x, y) => y * w + x;
  const came = new Map();
  const seen = new Uint8Array(w * h);
  const q = [[sx, sy]];
  seen[key(sx, sy)] = 1;
  let head = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;
  while (head < q.length) {
    const cur = q[head++];
    if (cur[0] === tx && cur[1] === ty) { found = true; break; }
    for (const [dx, dy] of dirs) {
      const nx = cur[0] + dx, ny = cur[1] + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = key(nx, ny);
      if (seen[k]) continue;
      if (!walkableAt(grid, w, h, nx, ny)) continue;
      seen[k] = 1;
      came.set(k, [cur[0], cur[1]]);
      q.push([nx, ny]);
    }
  }
  if (!found) return null;
  const path = [];
  let cx = tx, cy = ty;
  while (!(cx === sx && cy === sy)) {
    path.push({ x: cx, y: cy });
    const p = came.get(key(cx, cy));
    if (!p) break;
    cx = p[0]; cy = p[1];
  }
  path.push({ x: sx, y: sy });
  path.reverse();
  return path;
}

// 局部最近可行走瓦片（环形扫描，与 map.js nearestWalkable 语义一致但不读全局 MAP）
function nearestWalkableTile(grid, w, h, px, py, T) {
  const tx = Math.max(0, Math.min(w - 1, Math.floor(px / T)));
  const ty = Math.max(0, Math.min(h - 1, Math.floor(py / T)));
  if (walkableAt(grid, w, h, tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r < 64; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && walkableAt(grid, w, h, nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

function siteLabelOf(map, scx, scy) {
  if (scx === undefined || scy === undefined || !map.sites) return null;
  for (const key of ['A', 'B']) {
    const s = map.sites[key];
    if (s && Math.hypot(s.cx - scx, s.cy - scy) < 8) return key;
  }
  let best = null, bd = Infinity;
  for (const key of ['A', 'B']) {
    const s = map.sites[key];
    if (!s) continue;
    const d = Math.hypot(s.cx - scx, s.cy - scy);
    if (d < bd) { bd = d; best = key; }
  }
  return best;
}

// 候选回防进点：metro A 用固化表（按 walkable 过滤）；其余地图扫描站点外环可走格
function collectEntries(map, grid, w, h, T, siteLabel, site) {
  if (map.id === 'metro' && siteLabel === 'A') {
    return METRO_A_ENTRIES
      .filter((en) => walkableAt(grid, w, h, en.x, en.y))
      .map((en) => ({ ...en, px: { x: en.x * T + T / 2, y: en.y * T + T / 2 } }));
  }
  const x0 = Math.floor(site.x0 / T) - 2, y0 = Math.floor(site.y0 / T) - 2;
  const x1 = Math.floor((site.x1 - 1) / T) + 2, y1 = Math.floor((site.y1 - 1) / T) + 2;
  const list = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!walkableAt(grid, w, h, x, y)) continue;
      if (x > x0 && y > y0 && x < x1 && y < y1) continue;
      list.push({ x, y, side: 'direct', name: 'perimeter' });
    }
  }
  return list.map((en) => ({ ...en, px: { x: en.x * T + T / 2, y: en.y * T + T / 2 } }));
}

// 核心：metro 特化的 CT 回防 A 点推荐路线（纯函数、确定性）
export function retakeRoute(map, fromX, fromY, siteCenter, opts = {}) {
  if (!map || !siteCenter || !map.tile || fromX === undefined || fromY === undefined) return null;
  const T = map.tile;
  const grid = map.grid || (map.rows ? map.rows.map((r) => (typeof r === 'string' ? r.split('') : r)) : null);
  if (!grid || !grid.length || !grid[0].length) return null;
  const w = map.w || grid[0].length;
  const h = map.h || grid.length;
  const from = nearestWalkableTile(grid, w, h, fromX, fromY, T);
  if (!from) return null;
  const scx = siteCenter.cx !== undefined ? siteCenter.cx : siteCenter.x;
  const scy = siteCenter.cy !== undefined ? siteCenter.cy : siteCenter.y;
  if (scx === undefined || scy === undefined) return null;
  const siteLabel = siteLabelOf(map, scx, scy);
  const site = (siteLabel && map.sites && map.sites[siteLabel]) || { x0: scx, y0: scy, x1: scx + T, y1: scy + T };
  const entries = collectEntries(map, grid, w, h, T, siteLabel, site);
  if (!entries.length) return null;

  const withLen = [];
  for (const en of entries) {
    const p = shortestPath(grid, w, h, from.x, from.y, en.x, en.y);
    if (!p || p.length < 1) continue;
    withLen.push({ ...en, len: p.length, path: p });
  }
  if (!withLen.length) return null;

  const lane = withLen.filter((en) => en.side === 'lane');
  const east = withLen.filter((en) => en.side === 'east');
  const laneBest = lane.length ? lane.reduce((a, b) => (b.len < a.len ? b : a)) : null;
  const eastBest = east.length ? east.reduce((a, b) => (b.len < a.len ? b : a)) : null;

  const side = opts.side || 'auto';
  let chosen = null;
  if (side === 'lane' && laneBest) chosen = laneBest;
  else if (side === 'east' && eastBest) chosen = eastBest;
  else {
    // auto：路径长度优先，东侧（CT 半场侧）进点给安全加成
    chosen = withLen.reduce((a, b) => {
      const sa = a.len - (a.side === 'east' ? SAFETY_BIAS : 0);
      const sb = b.len - (b.side === 'east' ? SAFETY_BIAS : 0);
      return sb < sa ? b : a;
    });
  }
  // 绕行上限：强制侧明显绕远时退回最短侧（保证"近且不绕远"）
  if (laneBest && eastBest && chosen.side === 'east' && chosen.len > laneBest.len + MAX_DETOUR) chosen = laneBest;
  if (laneBest && eastBest && chosen.side === 'lane' && chosen.len > eastBest.len + MAX_DETOUR) chosen = eastBest;

  // 完整回防路线 = 当前位 → 选进点 → 进点 → 包点中心（进点后直达 A 站内，供清点推进）
  const siteTile = nearestWalkableTile(grid, w, h, scx, scy, T);
  let routeTiles = chosen.path;
  let tail = null;
  if (siteTile && !(siteTile.x === chosen.x && siteTile.y === chosen.y)) {
    tail = shortestPath(grid, w, h, chosen.x, chosen.y, siteTile.x, siteTile.y);
    if (tail && tail.length > 1) routeTiles = routeTiles.concat(tail.slice(1));
  }
  const route = routeTiles.map((t) => ({ x: t.x * T + T / 2, y: t.y * T + T / 2 }));
  let firstDir = 0;
  if (route.length >= 2) {
    const a = route[1];
    firstDir = Math.atan2(a.y - fromY, a.x - fromX);
  } else {
    const t = route[0];
    firstDir = Math.atan2(t.y - fromY, t.x - fromX);
  }
  // 预瞄朝向：从进点朝包点中心（进点处面向 A 内，而非顺着来路）
  const face = Math.atan2(scy - chosen.px.y, scx - chosen.px.x);
  return {
    route,
    tiles: routeTiles,
    target: siteTile ? { x: siteTile.x * T + T / 2, y: siteTile.y * T + T / 2 } : { x: scx, y: scy },
    entry: { x: chosen.px.x, y: chosen.px.y },
    entryName: chosen.name,
    side: chosen.side,
    site: siteLabel,
    firstDir,
    face,
    entryLen: chosen.len,
    pathLen: routeTiles.length
  };
}
