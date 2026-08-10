import { createGame, startMatch, update } from '../src/game.js';
import { getMap } from '../src/map.js';

function ok(name, cond) {
  if (!cond) throw new Error('fps-integration: ' + name + ' FAIL');
  console.log('fps-integration: ' + name + ' PASS');
}

// render3d 必须可导入且导出渲染函数（断言放 try 外，防止缺失时假绿）
{
  let fn = null;
  try {
    const m = await import('../src/render3d.js');
    fn = m.render3d || m.default || null;
  } catch (err) {
    throw new Error('fps-integration: render3d import FAIL — ' + err.message);
  }
  ok('render3d importable', typeof fn === 'function');
}

function fresh() {
  const g = createGame({ mapId: 'dust2', bots: 1 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  return g;
}

// 死亡 bot 隔离：避免 AI 干扰玩家位移/角度测量
function silenceBots(g) {
  for (const e of g.entities) if (e.bot) e.dead = true;
  g.input.keys = {};
}

// 找一块 ≥7x7 的纯 '.' 开阔地，保证位移方向不受墙体影响
function openSpot() {
  const map = getMap();
  for (let ty = 4; ty < map.h - 4; ty++) {
    for (let tx = 4; tx < map.w - 4; tx++) {
      if (map.grid[ty][tx] !== '.') continue;
      let ok = true;
      for (let dy = -3; dy <= 3 && ok; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (map.grid[ty + dy][tx + dx] !== '.') { ok = false; break; }
        }
      }
      if (ok) return { x: tx * map.tile + map.tile / 2, y: ty * map.tile + map.tile / 2 };
    }
  }
  return null;
}

{
  const g = createGame({ mapId: 'dust2', bots: 1 });
  startMatch(g);
  ok('default viewMode top', g.viewMode === 'top');
  ok('default fpsSens', g.fpsSens === 0.002);
  ok('default _mlookDx 0', g._mlookDx === 0);
  ok('default _specAngle null', g._specAngle === null);
}

{
  const g = fresh();
  silenceBots(g);
  g.viewMode = 'fps';
  const a0 = g.player.angle;
  g._mlookDx = 60;
  update(g, 1 / 60);
  const delta = g.player.angle - a0;
  // updatePlayerAim 一帧内被调两次（updatePlayer + update 尾部），但累积器只应用一次
  ok('mlook applied once', Math.abs(delta - 60 * g.fpsSens) < 1e-6);
  ok('mlookDx consumed', g._mlookDx === 0);
}

{
  const g = fresh();
  silenceBots(g);
  g.viewMode = 'fps';
  const spot = openSpot();
  const p = g.player;
  p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0;
  const runs = [
    [0, 0, 1, 'D at angle 0 moves +y'],
    [Math.PI / 2, -1, 0, 'D at angle PI/2 moves -x']
  ];
  for (const [angle, ex, ey, label] of runs) {
    p.angle = angle;
    g.input.keys['KeyD'] = true;
    const x0 = p.x, y0 = p.y;
    for (let i = 0; i < 4; i++) update(g, 1 / 60);
    g.input.keys['KeyD'] = false;
    const dx = p.x - x0, dy = p.y - y0;
    const moved = Math.hypot(dx, dy);
    ok(label + ' moved', moved > 1);
    ok(label + ' direction matches cos/sin', (ex * dx + ey * dy) > 0.5 * moved);
  }
}

{
  const g = fresh();
  silenceBots(g);
  g.viewMode = 'fps';
  const p = g.player;
  const a0 = p.angle;
  g.input.keys['ArrowRight'] = true;
  update(g, 1 / 60);
  g.input.keys['ArrowRight'] = false;
  const delta = p.angle - a0;
  ok('turnRight increases angle', delta > 0);
  ok('turnRight applied', Math.abs(delta) > 0.01);
}

console.log('fps-integration: all PASS');
