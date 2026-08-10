// follow 相机平滑跟随（candidate-166）纯逻辑回归（不渲染）：
// 契约：smoothFollow(curX, curY, targetX, targetY, dist, dt, opts) 确定性返回 {x, y}，
//       距离远时快速跟随（速率趋近 maxRate），接近时减速防抖（速率趋近 minRate），
//       小于 snapDist 直接贴合目标避免抖动；maxStep>0 时限制单帧位移实现切换平滑。
import assert from 'node:assert/strict';
import {
  smoothFollow,
  FOLLOW_MAX_RATE, FOLLOW_MIN_RATE, FOLLOW_NEAR_DIST,
  FOLLOW_FAR_DIST, FOLLOW_SNAP_DIST, FOLLOW_MAX_STEP
} from '../src/follow-cam.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 确定性：同输入必然同输出，且不越界（结果保持在起点与目标之间）
{
  const a = smoothFollow(100, 100, 400, 300, 300, 1 / 60);
  const b = smoothFollow(100, 100, 400, 300, 300, 1 / 60);
  assert.deepEqual(a, b, 'deterministic for identical inputs');
  assert.ok(a.x >= 100 && a.x <= 400, 'x stays on segment');
  assert.ok(a.y >= 100 && a.y <= 300, 'y stays on segment');
}

// 远距离快速跟随：dist ≥ farDist 时速率 = maxRate（指数趋近 k = 1-(1-rate*dt)）
// （关闭 maxStep 以隔离速率逻辑；默认 maxStep 另测）
{
  const { x } = smoothFollow(0, 0, 1000, 0, FOLLOW_FAR_DIST, 1 / 60, { maxStep: 0 });
  const k = Math.min(1, FOLLOW_MAX_RATE / 60);
  assert.ok(near(x, 1000 * k), 'far target follows at maxRate, got x=' + x);
}

// 近距离减速防抖：dist ≤ nearDist 时速率 = minRate（比远距离慢）
{
  const xNear = smoothFollow(0, 0, 100, 0, FOLLOW_NEAR_DIST, 1 / 60, { maxStep: 0 }).x;
  const xFar = smoothFollow(0, 0, 100, 0, FOLLOW_FAR_DIST, 1 / 60, { maxStep: 0 }).x;
  assert.ok(xNear < xFar, 'near target decelerates (slower step) than far, ' + xNear + ' vs ' + xFar);
  const kNear = Math.min(1, FOLLOW_MIN_RATE / 60);
  assert.ok(near(xNear, 100 * kNear), 'near target follows at minRate, got x=' + xNear);
}

// 速率随距离线性插值：dist 在中段时速率介于 minRate 与 maxRate 之间
{
  const mid = (FOLLOW_NEAR_DIST + FOLLOW_FAR_DIST) / 2;
  const { x } = smoothFollow(0, 0, 1000, 0, mid, 1 / 60, { maxStep: 0 });
  const t = (mid - FOLLOW_NEAR_DIST) / (FOLLOW_FAR_DIST - FOLLOW_NEAR_DIST);
  const rate = FOLLOW_MIN_RATE + (FOLLOW_MAX_RATE - FOLLOW_MIN_RATE) * t;
  assert.ok(near(x, 1000 * Math.min(1, rate / 60), 1e-6), 'mid-distance rate interpolated, got x=' + x);
}

// 接近目标逐步减速：距离越小单帧位移越小（趋近收敛，无跳变）
{
  const stepFor = (d) => {
    const p = smoothFollow(0, 0, d, 0, d, 1 / 60, { maxStep: 0 });
    return Math.hypot(p.x, p.y);
  };
  let prev = Infinity;
  for (const d of [FOLLOW_FAR_DIST, 360, 240, 120, FOLLOW_NEAR_DIST, 40, 10, 3]) {
    const s = stepFor(d);
    assert.ok(s < prev, 'step shrinks as distance shrinks (d=' + d + ' step=' + s + ' prev=' + prev + ')');
    prev = s;
  }
}

// 贴合：dist ≤ snapDist 时直接返回目标位置（避免亚像素抖动）
{
  const p = smoothFollow(100, 100, 101, 100.5, FOLLOW_SNAP_DIST, 1 / 60);
  assert.deepEqual(p, { x: 101, y: 100.5 }, 'snap exactly to target within snapDist');
  const p2 = smoothFollow(100, 100, 101, 100.5, 0, 1 / 60);
  assert.deepEqual(p2, { x: 101, y: 100.5 }, 'snap at dist 0');
}

// 切换目标平滑：大距离下 maxStep 限制单帧位移（不瞬移跳变）
{
  const p = smoothFollow(0, 0, 4000, 0, 4000, 1 / 60);
  const maxMove = FOLLOW_MAX_STEP / 60;
  const move = Math.hypot(p.x, p.y);
  assert.ok(move <= maxMove + 1e-9, 'target switch capped by maxStep, move=' + move + ' cap=' + maxMove);
  const p2 = smoothFollow(0, 0, 4000, 0, 4000, 1 / 60, { maxStep: 0 });
  const move2 = Math.hypot(p2.x, p2.y);
  const k = Math.min(1, FOLLOW_MAX_RATE / 60);
  assert.ok(near(move2, 4000 * k), 'maxStep=0 disables per-frame cap, move=' + move2);
}

// dt 边界：dt=0 不移动；负 dt 不产生位移
{
  assert.deepEqual(smoothFollow(0, 0, 100, 0, 100, 0), { x: 0, y: 0 }, 'dt=0 no movement');
  const p = smoothFollow(0, 0, 100, 0, 100, -1 / 60);
  assert.deepEqual(p, { x: 0, y: 0 }, 'negative dt treated as no movement');
}

// 选项覆盖：nearDist/farDist/maxRate/minRate 均可自定义
{
  const p = smoothFollow(0, 0, 100, 0, 10, 1 / 60, {
    nearDist: 50, farDist: 200, minRate: 2, maxRate: 10
  });
  // dist=10 < nearDist=50 → minRate=2
  assert.ok(near(p.x, 100 * Math.min(1, 2 / 60)), 'custom nearDist+minRate applied, got x=' + p.x);
}

// 收敛性：目标静止时相机从远处逐步趋近并最终贴合（平滑减速无振荡）
{
  let x = 0;
  let t = 0;
  let overshoot = 0;
  for (let i = 0; i < 600 && t < 5; i++) {
    const p = smoothFollow(x, 0, 500, 0, Math.hypot(500 - x, 0), 1 / 60);
    if (p.x > 500) overshoot++;
    x = p.x;
    t += 1 / 60;
  }
  assert.equal(overshoot, 0, 'no overshoot beyond target');
  assert.ok(near(x, 500, 1.5), 'camera settles onto target, x=' + x);
  // 收敛末期速率应显著低于初期（接近减速）
  let sEarly = 0, sLate = 0, xx = 0;
  for (let i = 0; i < 60; i++) {
    const p = smoothFollow(xx, 0, 500, 0, Math.hypot(500 - xx, 0), 1 / 60);
    sEarly += Math.hypot(p.x - xx, p.y);
    xx = p.x;
  }
  let yy = 0;
  for (let i = 0; i < 60; i++) {
    const p = smoothFollow(yy, 0, 499, 0, Math.hypot(499 - yy, 0), 1 / 60);
    sLate += Math.hypot(p.x - yy, p.y);
    yy = p.x;
  }
  assert.ok(sLate < sEarly, 'settling tail moves slower than initial catch-up (' + sLate + ' < ' + sEarly + ')');
}

// 常量契约：默认参数可导出且互不冲突
{
  assert.ok(FOLLOW_MIN_RATE < FOLLOW_MAX_RATE, 'minRate < maxRate');
  assert.ok(FOLLOW_NEAR_DIST < FOLLOW_FAR_DIST, 'nearDist < farDist');
  assert.ok(FOLLOW_SNAP_DIST < FOLLOW_NEAR_DIST, 'snapDist smallest');
  assert.ok(FOLLOW_MAX_STEP > 0, 'maxStep positive');
}

console.log('fx-follow-smooth: all PASS');
