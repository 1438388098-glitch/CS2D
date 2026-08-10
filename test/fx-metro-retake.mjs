// metro CT 回防 A 点推荐路线（backlog candidate-156，地图模块）
// 背景：metro（地铁）CT 从 B/中路回防 A 点时，旧逻辑按"欧氏距离"从 clearChains 选回防点。
//       本图 CT 出生区在右上、A 点位于右下，中央墙体隔开，实际路径必须走左侧走廊绕行——
//       欧氏距离会把"看着近、绕远路"的进点排到前面（如 CT 出生点到东侧进点欧氏更近但路径更远），
//       且全员扎堆 T 主通道被架枪线收割。
// 纯函数、确定性：retakeRoute 只读 map 参数，自带 BFS 寻路，不读 RNG/Date/全局状态。
import { loadMap, getMap, walkableChar } from '../src/map.js';
import { OFFICIAL_MAPS } from '../src/official-maps.js';
import { retakeRoute } from '../src/retake-route.js';

function ok(name, cond, detail = '') {
  if (!cond) throw new Error('fx-metro-retake: ' + name + ' FAIL' + (detail ? ' ' + detail : ''));
  console.log('fx-metro-retake: ' + name + ' PASS');
}

// 测试内局部 BFS：验证 retakeRoute 返回的路径确为最短路径（与模块实现独立）
function bfsLen(grid, w, h, sx, sy, tx, ty) {
  function walk(x, y) { return x >= 0 && y >= 0 && x < w && y < h && walkableChar(grid[y][x]); }
  if (!walk(sx, sy) || !walk(tx, ty)) return null;
  const key = (x, y) => y * w + x;
  const dist = new Uint32Array(w * h).fill(0xffffffff);
  const q = [[sx, sy]];
  dist[key(sx, sy)] = 0;
  let head = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < q.length) {
    const [x, y] = q[head++];
    if (x === tx && y === ty) return dist[key(x, y)];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = key(nx, ny);
      if (dist[k] !== 0xffffffff || !walk(nx, ny)) continue;
      dist[k] = dist[key(x, y)] + 1;
      q.push([nx, ny]);
    }
  }
  return null;
}

loadMap(OFFICIAL_MAPS.metro);
const map = getMap();
const T = map.tile;
const siteA = map.sites.A;
const siteB = map.sites.B;

// ---- 基础契约：非空 / 确定性 / 不改输入 ----
const rrBsite = retakeRoute(map, 1232, 512, siteA);
ok('metro A returns non-null route', !!rrBsite);
ok('route non-empty', rrBsite.route.length > 10);
ok('tiles non-empty', rrBsite.tiles.length > 10 && rrBsite.tiles.length === rrBsite.pathLen);
ok('entryLen > 0', rrBsite.entryLen > 0);
ok('site label A', rrBsite.site === 'A');
ok('deterministic', JSON.stringify(retakeRoute(map, 1232, 512, siteA)) === JSON.stringify(rrBsite));
ok('inputs not mutated', map.id === 'metro' && siteA.cx === 2128 && siteA.cy === 1768);

// ---- 路线有效性：全程可走、相邻瓦片 4 连通、起终点正确 ----
{
  const grid = map.grid, w = map.w, h = map.h;
  let allWalk = true, allAdj = true;
  for (let i = 0; i < rrBsite.tiles.length; i++) {
    const t = rrBsite.tiles[i];
    if (!walkableChar(grid[t.y][t.x])) allWalk = false;
    if (i > 0) {
      const p = rrBsite.tiles[i - 1];
      if (Math.abs(t.x - p.x) + Math.abs(t.y - p.y) !== 1) allAdj = false;
    }
  }
  ok('all route tiles walkable', allWalk);
  ok('route tiles 4-adjacent', allAdj);
  const firstPx = rrBsite.route[0];
  ok('route starts at CT position', Math.hypot(firstPx.x - 1232, firstPx.y - 512) <= T * 1.5,
    'off=' + Math.round(Math.hypot(firstPx.x - 1232, firstPx.y - 512)));
  const lastPx = rrBsite.route[rrBsite.route.length - 1];
  ok('route ends at A site center', Math.hypot(lastPx.x - siteA.cx, lastPx.y - siteA.cy) <= T,
    'off=' + Math.round(Math.hypot(lastPx.x - siteA.cx, lastPx.y - siteA.cy)));
}
ok('firstDir finite', Number.isFinite(rrBsite.firstDir) && rrBsite.firstDir >= -Math.PI && rrBsite.firstDir <= Math.PI);
ok('face finite', Number.isFinite(rrBsite.face));
ok('entryLen is shortest path to entry', (() => {
  const entryTile = rrBsite.tiles[rrBsite.entryLen - 1];
  return rrBsite.entryLen === bfsLen(map.grid, map.w, map.h, 77, 32, entryTile.x, entryTile.y) + 1;
})());

// ---- 侧向选点：B 点防守走主通道（近），A 点附近守员走东侧（安全侧夹击） ----
ok('B-site auto picks lane', retakeRoute(map, 1232, 512, siteA).side === 'lane');
ok('near-A auto picks east flank', retakeRoute(map, 2088, 1896, siteA).side === 'east');
ok('near-A forced east keeps east', retakeRoute(map, 2088, 1896, siteA, { side: 'east' }).side === 'east');

// ---- 避免绕远路（欧氏 vs 路径）：CT 出生点(2280,856) ----
// 欧氏距离：东侧进点(134,110) 比 主通道进点(116,115) 更近（57.6 vs 67.2 tile）
// 实际路径：主通道 217 < 东侧 245 —— 路径感知的 retakeRoute 必须选主通道
{
  const csp = map.spawns.ct[0];
  const eucEast = Math.hypot(134 - Math.floor(csp.x / T), 110 - Math.floor(csp.y / T));
  const eucLane = Math.hypot(116 - Math.floor(csp.x / T), 115 - Math.floor(csp.y / T));
  ok('east looks closer by euclid (trap precondition)', eucEast < eucLane,
    'east=' + eucEast.toFixed(1) + ' lane=' + eucLane.toFixed(1));
  const rr = retakeRoute(map, csp.x, csp.y, siteA);
  ok('ct-spawn avoids euclid trap: picks lane', rr.side === 'lane');
  const eastPathMin = Math.min(
    bfsLen(map.grid, map.w, map.h, Math.floor(csp.x / T), Math.floor(csp.y / T), 134, 110),
    bfsLen(map.grid, map.w, map.h, Math.floor(csp.x / T), Math.floor(csp.y / T), 135, 114)
  );
  ok('chosen entry path shorter than east flank', rr.entryLen < eastPathMin + 1,
    'chosen=' + rr.entryLen + ' eastMin=' + eastPathMin);
}

// ---- 强制侧绕行上限：B 点强制东侧 → 绕远超过上限，退回最短侧 ----
{
  const rr = retakeRoute(map, 1232, 512, siteA, { side: 'east' });
  ok('forced-east from B-site falls back to lane (no detour)', rr.side === 'lane', 'side=' + rr.side);
}

// ---- metro B 点回退：非 A 特化时走通用外围进点 ----
{
  const rr = retakeRoute(map, 1232, 512, siteB);
  ok('metro B falls back to generic entries', !!rr && rr.side === 'direct' && rr.route.length > 1);
}

// ---- 非法输入返回 null ----
ok('null map returns null', retakeRoute(null, 100, 100, siteA) === null);
ok('missing site center returns null', retakeRoute(map, 100, 100, {}) === null);

// ---- 通用地图（dust2）回退：非 metro 也能给出直达路线 ----
{
  loadMap(OFFICIAL_MAPS.dust2);
  const d2 = getMap();
  const rr = retakeRoute(d2, d2.spawns.ct[0].x, d2.spawns.ct[0].y, d2.sites.A);
  ok('dust2 generic route non-null', !!rr && rr.route.length > 1);
  ok('dust2 route ends at A', rr.route && Math.hypot(rr.route[rr.route.length - 1].x - d2.sites.A.cx, rr.route[rr.route.length - 1].y - d2.sites.A.cy) <= d2.tile * 1.5);
}

console.log('fx-metro-retake: all PASS');
process.exit(0);
