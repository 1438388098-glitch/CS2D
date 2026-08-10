// 2D 枪口闪光层次化（candidate-403）测试：
// muzzleFlashSpec(muzzleT, seed) 确定性返回 { alpha, coreR, glowR, burstR, rays }，
// alpha 随剩余枪口时间衰减，无 Math.random；同输入同输出。
import assert from 'node:assert/strict';
import * as fx from '../src/weapon-fx.js';

const flash = fx.muzzleFlashSpec;
assert.equal(typeof flash, 'function', 'muzzleFlashSpec should be exported');

// 生命周期与边界：未开火 / 已结束 / 非有限时间安全回退
{
  assert.deepEqual(flash(0, 7), null, 'muzzleT=0 -> no flash');
  assert.deepEqual(flash(-1, 7), null, 'negative muzzleT -> no flash');
  assert.deepEqual(flash(NaN, 7), null, 'NaN muzzleT -> no flash');
  assert.deepEqual(flash(Infinity, 7), null, 'Infinity muzzleT -> no flash');
}

// 衰减：刚开火最亮，剩余时间越短 alpha 越低
{
  const fresh = flash(0.06, 7);
  const mid = flash(0.03, 7);
  const late = flash(0.01, 7);
  assert.ok(fresh.alpha > 0.9, 'fresh flash is near full alpha');
  assert.ok(fresh.alpha > mid.alpha && mid.alpha > late.alpha, 'alpha decays with muzzleT');
  assert.ok(late.alpha > 0, 'late flash still visible before expiry');
}

// 几何字段：半径/射线数有限且随 seed 变化，同 seed 完全复现
{
  const a = flash(0.05, 11);
  const b = flash(0.05, 11);
  const c = flash(0.05, 12);
  assert.deepEqual(a, b, 'same seed+t reproducible');
  assert.notDeepEqual(a, c, 'different seed varies burst geometry');
  assert.ok(Number.isFinite(a.coreR) && a.coreR > 0, 'finite core radius');
  assert.ok(Number.isFinite(a.glowR) && a.glowR > a.coreR, 'glow radius larger than core');
  assert.ok(Number.isFinite(a.burstR) && a.burstR > a.glowR, 'burst radius larger than glow');
  assert.ok(Number.isInteger(a.rays) && a.rays >= 6 && a.rays <= 10, 'rays within deterministic range');
  assert.ok(a.alpha >= 0 && a.alpha <= 1, 'alpha within [0,1]');
}

console.log('fx-2d-muzzle-flash: all PASS');
