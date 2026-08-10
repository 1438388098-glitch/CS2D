// 2D 击杀标签爆发反馈（candidate-404）测试：
// killBurst(kind, t) 确定性返回 { alpha, rays, radius, rot } 或 null，
// 随 t 扩张淡出；爆头/多杀比普通击杀更强烈。
import assert from 'node:assert/strict';
import * as fx from '../src/killcam-fx.js';

assert.equal(typeof fx.killBurst, 'function', 'killBurst should be exported');

// 边界：未爆发 / 结束 / 非法输入返回 null
{
  assert.equal(fx.killBurst('normal', -0.1), null, 'negative t -> null');
  assert.equal(fx.killBurst('normal', 10), null, 'past duration -> null');
  assert.equal(fx.killBurst('normal', NaN), null, 'NaN t -> null');
  assert.equal(fx.killBurst('normal', Infinity), null, 'Infinity t -> null');
}

// 行为：刚击杀 alpha 最高、半径最小；随时间扩张并淡出
{
  const fresh = fx.killBurst('normal', 0);
  const mid = fx.killBurst('normal', 0.12);
  const late = fx.killBurst('normal', 0.28);
  assert.ok(fresh.alpha > mid.alpha && mid.alpha > late.alpha, 'alpha fades over burst');
  assert.ok(fresh.radius < mid.radius && mid.radius < late.radius, 'radius expands over burst');
  assert.ok(fresh.alpha > 0.8 && late.alpha > 0, 'fresh is bright and late still visible');
  assert.ok(Number.isInteger(fresh.rays) && fresh.rays >= 8, 'ray count integer');
  assert.ok(Number.isFinite(fresh.rot), 'rotation finite');
}

// 确定性 + 分级：同输入复现；多杀射线更多，普通/爆头/多杀形态不同
{
  const a = fx.killBurst('headshot', 0.08, 5);
  const b = fx.killBurst('headshot', 0.08, 5);
  assert.deepEqual(a, b, 'same kind+t+seed reproducible');
  const normal = fx.killBurst('normal', 0.08, 5);
  const head = fx.killBurst('headshot', 0.08, 5);
  const multi = fx.killBurst('multikill', 0.08, 5);
  assert.ok(head.rays > normal.rays, 'headshot has more rays than normal');
  assert.ok(multi.rays > head.rays, 'multikill has more rays than headshot');
  assert.ok(multi.radius > head.radius && head.radius > normal.radius, 'impact radius scales with kind');
}

console.log('fx-2d-kill-burst: all PASS');
