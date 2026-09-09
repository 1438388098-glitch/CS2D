import assert from 'node:assert/strict';
import { createGame, startMatch } from '../src/game.js';
import { getMap } from '../src/map.js';
import { MODE_MAPS } from '../src/registry.js';

// 出生区 → 两包点连通性护栏：竞技图池每张图的每个出生点必须能沿可行走格到达 A/B 两包点，
// 防地图改动/生成器回归把出生点关进"孤岛"或造成绕路死区。
function bfsReachable(grid, W, H, sx, sy) {
  const seen = new Uint8Array(W * H);
  const q = [[sx, sy]];
  seen[sy * W + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (seen[k] || grid[ny][nx] === '#' || grid[ny][nx] === 'B') continue; // # 墙 / B 高台不可步行连通
      seen[k] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

function nearestReachable(reach, W, H, tx, ty) {
  // 目标点像素坐标 → 最近的已连通格（螺旋外扩找 5x5 邻域）
  const cx = Math.floor(tx), cy = Math.floor(ty);
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (reach[y * W + x]) return true;
      }
    }
  }
  return false;
}

const T = getMap() && getMap().tile ? getMap().tile : 40;
for (const mapId of MODE_MAPS) {
  const g = createGame({ mapId, bots: 1 });
  startMatch(g);
  const map = getMap();
  assert.ok(map && map.grid && map.grid.length, mapId + ': map loaded');
  assert.ok(map.spawns && map.spawns.t && map.spawns.ct, mapId + ': spawns present');
  const W = map.grid[0].length, H = map.grid.length;
  const tile = map.tile || T;
  const targets = { A: map.sites.A, B: map.sites.B };
  for (const [team, list] of [['t', map.spawns.t], ['ct', map.spawns.ct]]) {
    for (const sp of list) {
      const sx = Math.floor(sp.x / tile), sy = Math.floor(sp.y / tile);
      const reach = bfsReachable(map.grid, W, H, sx, sy);
      for (const label of ['A', 'B']) {
        const site = targets[label];
        const ok2 = nearestReachable(reach, W, H, Math.round(site.cx / tile), Math.round(site.cy / tile));
        assert.ok(ok2, mapId + ': ' + team + ' spawn (' + sx + ',' + sy + ') must reach site ' + label);
      }
    }
  }
  console.log('spawn-connectivity: ' + mapId + ' PASS (' + (map.spawns.t.length + map.spawns.ct.length) + ' spawns → A/B)');
}

console.log('spawn-connectivity: all PASS');
