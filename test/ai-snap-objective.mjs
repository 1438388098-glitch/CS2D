// AI 目标点吸附（candidate-152 收尾）：botObjective 生成的站桩目标若落在
// 实心墙格内，就近吸附到最近可行走格中心；可达目标保持不变。
import { loadMap, getMap } from '../src/map.js';
import { snapObjective } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

// 简单地图：中央墙 + 上下通道；tile=40
const rows = [
  '##########',
  '#........#',
  '#........#',
  '#..####..#',
  '#..#..#..#',
  '#..#..#..#',
  '#..####..#',
  '#........#',
  '#........#',
  '##########'
];
loadMap({ id: 'snap-test', name: 'snap', tile: 40, rows, allowDisconnected: true });
const m = getMap();
const T = 40;
const walkableAt = (x, y) => {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  const c = m.grid[ty] && m.grid[ty][tx];
  return c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '^' || c === 'R';
};

// 墙内目标点（中央 4x4 墙块中心）→ 吸附到附近 walkable 格
{
  const wallX = 4 * T + T / 2; // 墙块 (4..5)
  const wallY = 3 * T + T / 2;
  ok('wall center is not walkable', !walkableAt(wallX, wallY));
  const snapped = snapObjective({ x: wallX, y: wallY }, {}, {});
  ok('wall target snapped', !!snapped && Number.isFinite(snapped.x) && Number.isFinite(snapped.y));
  ok('snapped point is walkable', walkableAt(snapped.x, snapped.y), 'x=' + snapped.x + ' y=' + snapped.y);
}

// 已可达目标 → 保持不变（确定性）
{
  const good = { x: 1 * T + T / 2, y: 1 * T + T / 2, face: 1.2, nade: true };
  const snapped = snapObjective(good, {}, {});
  ok('reachable target unchanged', snapped.x === good.x && snapped.y === good.y);
  ok('extra attrs preserved', snapped.face === 1.2 && snapped.nade === true);
}

// 非有限输入 → 原样返回（防崩溃）
{
  const bad = { x: NaN, y: 10 };
  const snapped = snapObjective(bad, {}, {});
  ok('non-finite target passthrough', snapped === bad);
}

console.log('ai-snap-objective: all PASS');
process.exit(failed ? 1 : 0);
