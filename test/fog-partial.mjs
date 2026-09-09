import { createGame, startMatch } from '../src/game.js';
import { hasPartialLineOfSight } from '../src/fog.js';
import { getMap } from '../src/map.js';

function ok(name, cond) {
  if (!cond) throw new Error('fog-partial: ' + name + ' FAIL');
  console.log('fog-partial: ' + name + ' PASS');
}

const g = createGame({ mapId: 'dust2', bots: 1 });
startMatch(g);
g.state = 'LIVE';
g.freezeT = 0;
const map = getMap();
const T = map.tile;

// 找一段横向单行墙体（≥4 格）：左端外侧列 c-1 在 wy-1..wy+1 全开，
// 且墙列 c 自身在 wy-1/wy+1 也是开的（保证擦边射线不被邻行墙挡）。
function findEdgeWall() {
  for (let wy = 2; wy < map.h - 3; wy++) {
    let run = 0;
    for (let x = 1; x < map.w - 1; x++) {
      if (map.grid[wy][x] !== '.') { run++; continue; }
      if (run >= 4) {
        const c = x - run; // 墙段左端列
        const colOpen = (r) => map.grid[r] && map.grid[r][c - 1] === '.' && map.grid[r][c] === '.';
        if (colOpen(wy - 1) && map.grid[wy][c - 1] === '.' && colOpen(wy + 1)) {
          return { X1: c * T, yv: (wy - 1.2) * T, yt: (wy + 1.2) * T };
        }
      }
      run = 0;
    }
  }
  return null;
}

const wall = findEdgeWall();
ok('found edge wall geometry on dust2', !!wall);

// 开阔地：同高同排相距 60px，三点全可见
{
  let spot = null;
  for (let ty = 4; ty < map.h - 4 && !spot; ty++) {
    for (let tx = 4; tx < map.w - 4 && !spot; tx++) {
      let open = true;
      for (let dy = -2; dy <= 2 && open; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (map.grid[ty + dy][tx + dx] !== '.') { open = false; break; }
        }
      }
      if (open) spot = { x: tx * T + T / 2, y: ty * T + T / 2 };
    }
  }
  ok('found open spot', !!spot);
  const viewer = { x: spot.x, y: spot.y, height: 0 };
  const target = { x: spot.x + 60, y: spot.y, height: 0 };
  const r = hasPartialLineOfSight(g, viewer, target);
  ok('open LOS fully visible', r.visible === true && r.visiblePoints === 3);
}

if (wall) {
  const vx = wall.X1 + 4;
  const viewer = { x: vx, y: wall.yv, height: 0 };
  // 站立目标贴墙左缘 4px：外侧采样点（half=14）越出墙缘 → 部分可见
  const targetStand = { x: vx, y: wall.yt, height: 0 };
  const rStand = hasPartialLineOfSight(g, viewer, targetStand);
  ok('stand near wall edge partially visible', rStand.visible === true && rStand.visiblePoints < 3);

  // 蹲姿采样点向中心收紧（BODY_HALF 14→6）：暴露点数只会 ≤ 站立，不会因蹲下变更可见
  const targetCrouch = { x: vx, y: wall.yt, height: 0, crouched: true };
  const rCrouch = hasPartialLineOfSight(g, viewer, targetCrouch);
  ok('crouch never more visible than stand', rCrouch.visiblePoints <= rStand.visiblePoints);

  // 目标完全处于墙体下方（距边缘 ≥ 半个身位）：三种姿态采样全被挡
  const targetDeep = { x: vx + T, y: wall.yt, height: 0 };
  const rDeep = hasPartialLineOfSight(g, viewer, targetDeep);
  ok('target behind wall body occluded', rDeep.visible === false && rDeep.visiblePoints === 0);
  ok('crouch behind wall fully occluded', hasPartialLineOfSight(g, viewer, { ...targetDeep, crouched: true }).visiblePoints === 0);

  // 空引用防护
  ok('null viewer guarded', hasPartialLineOfSight(g, null, targetDeep).visible === false);
  ok('null target guarded', hasPartialLineOfSight(g, viewer, null).visible === false);
}

console.log('fog-partial: all PASS');
