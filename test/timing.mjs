// Timing 校准工具：测量 T→A/B、CT→A/B、CT 回防时间（px 距离 / 235px/s）
import { MAPS, TILE } from '../src/config.js';
import { loadMap, getMap, aStar, nearestWalkable } from '../src/map.js';

const SPEED = 235; // 跑步基准（px/s）

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
  const path = aStar(sx, sy, tx, ty);
  if (!path || !path.length) return null;
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    d += Math.hypot(dx, dy);
  }
  return d * tile / SPEED;
}

function run(mapId) {
  const def = MAPS.find((m) => m.id === mapId);
  loadMap(def);
  const map = getMap();
  const grid = map.grid;
  const t = centerOf(grid, 't');
  const c = centerOf(grid, 'c');
  const sites = map.sites;
  const out = { map: mapId };
  for (const k of ['A', 'B']) {
    const s = sites[k];
    if (!s) continue;
    const tile = getMap()?.tile || TILE;
    const st = nearestWalkable(s.cx, s.cy);
    const tx = st.x, ty = st.y;
    out['T→' + k] = distTime(t.x, t.y, tx, ty);
    out['CT→' + k] = distTime(c.x, c.y, tx, ty);
    out['T先到' + k] = out['T→' + k] !== null && out['CT→' + k] !== null
      ? out['CT→' + k] - out['T→' + k] : null;
    out['CT回防' + k] = out['CT→' + k];
  }
  return out;
}

console.log('地图        T→A    T→B    CT→A   CT→B   T先到A  T先到B  CT回防A  CT回防B');
for (const m of ['dust2', 'canal', 'metro']) {
  const r = run(m);
  const f = (k) => r[k] === null ? '  --  ' : r[k].toFixed(1).padStart(6);
  console.log(m.padEnd(9) + ' ' + f('T→A') + ' ' + f('T→B') + ' ' + f('CT→A') + ' ' + f('CT→B') +
    ' ' + f('T先到A') + ' ' + f('T先到B') + ' ' + f('CT回防A') + ' ' + f('CT回防B'));
}

console.log('\n解读：T先到 = CT 到达时间 - T 到达时间（正值 = T 先到，CT 需要更早移动才跟得上）');
console.log('参考：CS 类图 CT 先到 0.5~1.5s 属防守方合理；T 先到 > 1.5s 为 T 速攻优势，< 0 为 CT 站桩优势');
