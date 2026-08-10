// 掩体节奏审查：找"2 秒移动距离（470px）内无掩体"的可走点
import { MAPS, TILE } from '../src/config.js';
import '../src/modes.js';
import { loadMap, getMap } from '../src/map.js';

const COVER_R = Math.round(470 / TILE); // 约 12 瓦片
const isCover = (c) => c === 'C' || c === '^' || c === '=' || c === 'o' || c === 'D' || c === '#';
const isWalk = (c) => c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '~' || c === '≈';

for (const m of ['dust2', 'canal', 'metro', 'atrium']) {
  loadMap(MAPS.find((x) => x.id === m));
  const map = getMap();
  const g = map.grid;
  const COVER_R = Math.round(470 / (map.tile || TILE));
  const exposed = [];
  for (let y = 1; y < g.length - 1; y++) {
    for (let x = 1; x < g[y].length - 1; x++) {
      if (!isWalk(g[y][x])) continue;
      let minD = Infinity;
      for (let dy = -COVER_R; dy <= COVER_R; dy++) {
        for (let dx = -COVER_R; dx <= COVER_R; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || ny >= g.length || nx >= g[ny].length) continue;
          if (isCover(g[ny][nx])) {
            const d = Math.hypot(dx, dy);
            if (d < minD) minD = d;
          }
        }
      }
      if (minD > COVER_R) exposed.push({ x, y, d: minD });
    }
  }
  // 聚类：合并相邻暴露点，输出簇中心
  const clusters = [];
  for (const p of exposed) {
    let placed = false;
    for (const c of clusters) {
      if (Math.abs(c.x - p.x) + Math.abs(c.y - p.y) < 6) {
        c.x = (c.x * c.n + p.x) / (c.n + 1);
        c.y = (c.y * c.n + p.y) / (c.n + 1);
        c.n++;
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ x: p.x, y: p.y, n: 1 });
  }
  clusters.sort((a, b) => b.n - a.n);
  console.log('== ' + m + '：暴露点 ' + exposed.length + ' 个，真空簇 ' + clusters.length + ' 个（大小≥5 展示）');
  for (const c of clusters) {
    if (c.n >= 5) console.log('  真空区 中心(' + Math.round(c.x) + ',' + Math.round(c.y) + ') 格数 ' + c.n + '  char=' + g[Math.round(c.y)][Math.round(c.x)]);
  }
}
