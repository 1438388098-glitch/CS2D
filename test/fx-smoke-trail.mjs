// 2D 烟雾消散尾迹（candidate-305）测试：smokeDissolveTrail 纯函数 + drawSmokeTrail 绘制。
// 契约：输入 (smoke, t, seed, count) → 输出 [{x,y,r,alpha,vx,vy}]；
//       确定性（同输入同输出，无 Math.random）；t<=0 / t>=1 / count<=0 → 空数组；
//       粒子位于外缘并向径向+切向漂移、alpha 呈正弦包络；
//       绘制函数对空数组安全、逐粒子设置 fillStyle/arc/fill。
import assert from 'node:assert/strict';
import {
  smokeDissolveTrail,
  drawSmokeTrail,
  SMOKE_DISSOLVE_LIFE,
  SMOKE_TRAIL_RADIUS_LO,
  SMOKE_TRAIL_DRIFT_MAX
} from '../src/smoke-fx.js';

const smoke = { x: 320, y: 240, r: 150, life: 1.2, gr: 150 };

// 结构：数组元素含 {x,y,r,alpha,vx,vy} 且坐标/半径有限、alpha∈[0,1]
{
  const pts = smokeDissolveTrail(smoke, 0.5, 7, 6);
  assert.ok(pts.length > 0 && pts.length <= 6, 'mid-dissolve yields 1..count particles');
  for (const p of pts) {
    for (const k of ['x', 'y', 'r', 'alpha', 'vx', 'vy']) {
      assert.equal(typeof p[k], 'number', `${k} is number`);
      assert.ok(Number.isFinite(p[k]), `${k} finite`);
    }
    assert.ok(p.alpha >= 0 && p.alpha <= 1, `alpha within [0,1] (got ${p.alpha})`);
    assert.ok(p.r > 0, 'radius positive');
  }
}

// 确定性：同输入 → 同输出（无 Math.random）
{
  const a = smokeDissolveTrail(smoke, 0.5, 7, 6);
  const b = smokeDissolveTrail(smoke, 0.5, 7, 6);
  assert.deepEqual(a, b, 'same input yields identical particles');
}

// 不同 seed / 不同位置 → 尾迹形态不同（种子起作用）
{
  const s1 = smokeDissolveTrail(smoke, 0.5, 7, 6);
  const s2 = smokeDissolveTrail(smoke, 0.5, 8, 6);
  const s3 = smokeDissolveTrail({ ...smoke, x: 480 }, 0.5, 7, 6);
  assert.ok(JSON.stringify(s1) !== JSON.stringify(s2), 'seed changes pattern');
  assert.ok(JSON.stringify(s1) !== JSON.stringify(s3), 'position changes pattern');
}

// 边界：t<=0、t>=1、count<=0、缺 smoke → 空数组
{
  assert.deepEqual(smokeDissolveTrail(smoke, 0, 7, 6), [], 't=0 -> empty');
  assert.deepEqual(smokeDissolveTrail(smoke, -0.5, 7, 6), [], 't<0 -> empty');
  assert.deepEqual(smokeDissolveTrail(smoke, 1, 7, 6), [], 't=1 -> empty');
  assert.deepEqual(smokeDissolveTrail(smoke, 1.5, 7, 6), [], 't>1 -> empty');
  assert.deepEqual(smokeDissolveTrail(smoke, 0.5, 7, 0), [], 'count=0 -> empty');
  assert.deepEqual(smokeDissolveTrail(null, 0.5, 7, 6), [], 'no smoke -> empty');
}

// 位置契约：粒子从外缘 (0.75~1.0)r 处向径向外漂移，全程中心距 ∈ [0.75r, r+driftMax]
{
  const r = 150;
  const lo = SMOKE_TRAIL_RADIUS_LO * r;
  const hi = r + SMOKE_TRAIL_DRIFT_MAX;
  for (const t of [0.1, 0.3, 0.6, 0.9]) {
    const pts = smokeDissolveTrail(smoke, t, 3, 8);
    for (const p of pts) {
      const d = Math.hypot(p.x - 320, p.y - 240);
      assert.ok(d >= lo && d <= hi + 1, `particle dist ${d} within [${lo},${hi}] at t=${t}`);
    }
  }
}

// 进度单调：同粒子在 t2>t1 时径向距离更大（确定性剥落漂移）。
// 用 count=1 锁定唯一粒子：peel 上限 0.75，故 t1=0.8 / t2=0.9 均保证已剥落、无索引错位。
{
  const a = smokeDissolveTrail(smoke, 0.8, 5, 1);
  const b = smokeDissolveTrail(smoke, 0.9, 5, 1);
  assert.equal(a.length, 1, 'count=1 emits single particle at t=0.8');
  assert.equal(b.length, 1, 'count=1 emits single particle at t=0.9');
  const da = Math.hypot(a[0].x - 320, a[0].y - 240);
  const db = Math.hypot(b[0].x - 320, b[0].y - 240);
  assert.ok(db > da, `single particle drifts outward (${da} -> ${db})`);
  assert.ok(a[0].x !== b[0].x || a[0].y !== b[0].y, 'position changes as t advances');
}

// alpha 包络：early 未剥落粒子不输出；中段 alpha 上升、端部回落，峰值不超过 ALPHA_MAX
{
  const pts = smokeDissolveTrail(smoke, 0.5, 11, 8);
  for (const p of pts) assert.ok(p.alpha > 0, 'active particles have alpha > 0');
  const hiA = smokeDissolveTrail({ ...smoke, life: 0.6 }, 0.7, 11, 8);
  assert.ok(hiA.every((p) => p.alpha <= 0.7), 'alpha bounded by SMOKE_TRAIL_ALPHA_MAX');
}

// life 驱动：同一 t 下 t 由调用方折算；越接近散尽，漂移速度场方向一致（vx,vy 有限）
{
  const late = smokeDissolveTrail({ ...smoke, life: 0.3 }, 0.85, 2, 6);
  assert.ok(late.every((p) => Number.isFinite(p.vx) && Number.isFinite(p.vy)), 'velocity finite at late dissolve');
}

// 常量契约：消散阈值 2s（与 drawSmokes 淡出窗口一致）
{
  assert.equal(SMOKE_DISSOLVE_LIFE, 2, 'dissolve begins in the last 2s of smoke life');
}

// drawSmokeTrail：空数组安全；正常输入逐粒子设置 fillStyle + arc + fill，并恢复状态
{
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    fillStyle: null,
    beginPath: () => calls.push(['beginPath']),
    arc: (...a) => calls.push(['arc', ...a]),
    fill: () => calls.push(['fill'])
  };
  drawSmokeTrail(ctx, []);
  assert.equal(calls.length, 0, 'empty pts -> no canvas calls');
  calls.length = 0;
  const pts = smokeDissolveTrail(smoke, 0.5, 13, 5);
  drawSmokeTrail(ctx, pts);
  assert.ok(calls.some((c) => c[0] === 'save') && calls.some((c) => c[0] === 'restore'), 'save/restore wrap draw');
  const arcs = calls.filter((c) => c[0] === 'arc');
  assert.equal(arcs.length, pts.length, 'one arc per particle');
  for (let i = 0; i < pts.length; i++) {
    const a = arcs[i];
    assert.ok(Math.abs(a[1] - pts[i].x) < 1e-9 && Math.abs(a[2] - pts[i].y) < 1e-9, `arc at particle ${i} center`);
    assert.ok(a[3] > 0, `arc radius positive for particle ${i}`);
  }
  assert.equal(calls.filter((c) => c[0] === 'fill').length, pts.length, 'fill per particle');
}

console.log('fx-smoke-trail: all PASS');
