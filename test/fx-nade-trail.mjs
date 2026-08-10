// 2D 手雷飞行轨迹预览（candidate-307）测试：nadeTrajectory 纯函数 + 投掷物理一致常量
// 契约：输入起点/方向角/初速/步数 → 输出轨迹点数组 [{x,y}]（含起点，共 steps+1 个点）；
//       确定性（同输入同输出，无 Math.random）；初速与 throwGrenade 一致（HE/闪光 560，烟 480）；
//       线速度按 1.6/s 线性衰减 → 步距单调递减、总位移不超过 v0/阻尼 理论极限。
import assert from 'node:assert/strict';
import { nadeTrajectory, NADE_SPEED, NADE_DT, NADE_DAMP } from '../src/nade-fx.js';

// 结构：点数 steps+1，每点为 {x,y} 且坐标有限
{
  const pts = nadeTrajectory(0, 0, 0, 560, 40);
  assert.equal(pts.length, 41, 'steps=40 should yield 41 points (incl. origin)');
  for (const p of pts) {
    assert.equal(typeof p.x, 'number', 'x is number');
    assert.equal(typeof p.y, 'number', 'y is number');
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'coords finite');
  }
}

// 确定性：同输入 → 同输出
{
  const a = nadeTrajectory(10, 20, 1.2, 500, 30);
  const b = nadeTrajectory(10, 20, 1.2, 500, 30);
  assert.deepEqual(a, b, 'same input yields same output (no Math.random)');
}

// 方向：沿 ang 前移，x/y 分量与 cos/sin 方向一致
{
  const east = nadeTrajectory(0, 0, 0, 400, 20);
  assert.ok(east[5].x > east[0].x, 'east should move along +x');
  assert.ok(Math.abs(east[5].y) < 1e-9, 'east should keep y=0');
  const south = nadeTrajectory(0, 0, Math.PI / 2, 400, 20);
  assert.ok(south[5].y > south[0].y, 'south should move along +y');
  assert.ok(Math.abs(south[5].x) < 1e-9, 'south should keep x=0');
}

// 阻尼衰减：步距单调递减，且按 v0*dt, v0*dt*r, v0*dt*r^2... 推进；总位移 < v0/阻尼 理论极限
{
  const pts = nadeTrajectory(0, 0, 0, 560, 60);
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push(pts[i].x - pts[i - 1].x);
  for (let i = 1; i < segs.length; i++) {
    assert.ok(segs[i] < segs[i - 1], 'step length monotonically decreasing (linear damping)');
  }
  const r = Math.max(0, 1 - NADE_DAMP * NADE_DT);
  assert.ok(Math.abs(segs[0] - 560 * NADE_DT) < 1e-9, 'first step = v0*dt');
  assert.ok(Math.abs(segs[1] - segs[0] * r) < 1e-9, 'second step = first step * damping factor');
  const total = pts[pts.length - 1].x;
  assert.ok(total > 0, 'positive travel distance');
  assert.ok(total < 560 / NADE_DAMP + 1, 'total distance bounded by v0/damping limit');
}

// 初速与投掷物理一致：HE/闪光 560、烟 480，HE 落点比烟更远
{
  assert.equal(NADE_SPEED.he, 560, 'HE initial speed 560');
  assert.equal(NADE_SPEED.flash, 560, 'flash initial speed 560');
  assert.equal(NADE_SPEED.smoke, 480, 'smoke initial speed 480');
  const he = nadeTrajectory(0, 0, 0, NADE_SPEED.he, 40);
  const smoke = nadeTrajectory(0, 0, 0, NADE_SPEED.smoke, 40);
  assert.ok(he[he.length - 1].x > smoke[smoke.length - 1].x, 'HE lands farther than smoke');
}

// 退化输入：power=0 静止；steps 最小值
{
  const zero = nadeTrajectory(5, 7, 0, 0, 10);
  for (const p of zero) {
    assert.ok(Math.abs(p.x - 5) < 1e-9 && Math.abs(p.y - 7) < 1e-9, 'power=0 should stay put');
  }
  assert.equal(nadeTrajectory(5, 7, 0, 0, 1).length, 2, 'steps=1 should yield 2 points');
}

console.log('fx-nade-trail: all PASS');
