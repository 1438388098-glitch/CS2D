// 2D 武器反馈特效回归：muzzleSmoke（开火枪口烟）+ weaponSwitchPop（切枪缩放弹出）
// 契约：muzzleSmoke(hasFired, t, seed) 确定性返回 [{x,y,r,alpha}]，烟团随 t 生长并消散；
//       weaponSwitchPop(t) 确定性返回 {scale}，切枪瞬间轻微放大再回稳，其余时刻恒为 1。
import assert from 'node:assert/strict';
import {
  muzzleSmoke, weaponSwitchPop,
  MUZZLE_SMOKE_LIFE, MUZZLE_SMOKE_COUNT, SWITCH_POP_DURATION, SWITCH_POP_PEAK
} from '../src/weapon-fx.js';

// 未开火 / 生命周期外 → 空
{
  assert.deepEqual(muzzleSmoke(false, 0, 7), [], 'no fire -> empty');
  assert.deepEqual(muzzleSmoke(true, -0.01, 7), [], 'negative t -> empty');
  assert.deepEqual(muzzleSmoke(true, MUZZLE_SMOKE_LIFE, 7), [], 'expired smoke -> empty');
  assert.deepEqual(muzzleSmoke(true, MUZZLE_SMOKE_LIFE + 1, 7), [], 'past life -> empty');
}

// 开火瞬间：生成固定数量粒子，字段齐全且为有限数
{
  const pts = muzzleSmoke(true, 0, 7);
  assert.equal(pts.length, MUZZLE_SMOKE_COUNT, 'fires MUZZLE_SMOKE_COUNT particles');
  for (const p of pts) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'finite offsets');
    assert.ok(Number.isFinite(p.r) && p.r > 0, 'finite positive radius');
    assert.ok(p.alpha >= 0 && p.alpha <= 1, 'alpha in [0,1]');
  }
}

// 确定性：同 (t, seed) 完全一致；seed 不同则不同
{
  const a = muzzleSmoke(true, 0.05, 123);
  const b = muzzleSmoke(true, 0.05, 123);
  assert.deepEqual(a, b, 'same t+seed reproducible');
  const c = muzzleSmoke(true, 0.05, 124);
  assert.notDeepEqual(a, c, 'seed varies output');
}

// 消散：同一 seed 下 alpha 随时间单调递减、半径随时间单调增大
{
  const early = muzzleSmoke(true, 0.05, 99);
  const mid = muzzleSmoke(true, 0.2, 99);
  const late = muzzleSmoke(true, 0.36, 99);
  for (let i = 0; i < MUZZLE_SMOKE_COUNT; i++) {
    assert.ok(early[i].alpha > mid[i].alpha && mid[i].alpha > late[i].alpha, 'alpha decays over life');
    assert.ok(early[i].r < mid[i].r && mid[i].r < late[i].r, 'radius grows over life');
  }
  assert.ok(late.every((p) => p.alpha > 0), 'still visible before expiry');
}

// 前向漂移：同一粒子 x 偏移随 t 沿枪口前移
{
  const e = muzzleSmoke(true, 0.05, 55);
  const l = muzzleSmoke(true, 0.35, 55);
  assert.ok(l[0].x > e[0].x, 'smoke drifts forward along barrel');
}

// 切枪缩放：t<=0 或 >= 时长恒为 1；时长中点精确达峰值；期间先升后回稳且不越界
{
  assert.equal(weaponSwitchPop(0).scale, 1, 't=0 no pop');
  assert.equal(weaponSwitchPop(-0.5).scale, 1, 't<0 no pop');
  assert.equal(weaponSwitchPop(SWITCH_POP_DURATION).scale, 1, 't=duration settled');
  assert.equal(weaponSwitchPop(SWITCH_POP_DURATION + 1).scale, 1, 't>duration settled');
  assert.ok(Math.abs(weaponSwitchPop(SWITCH_POP_DURATION / 2).scale - SWITCH_POP_PEAK) < 1e-9, 'peak at midpoint');
  const up1 = weaponSwitchPop(0.03).scale;
  const up2 = weaponSwitchPop(0.1).scale;
  const down1 = weaponSwitchPop(0.2).scale;
  const down2 = weaponSwitchPop(0.25).scale;
  assert.ok(up2 > up1 && down1 > down2, 'rises then settles');
  assert.ok(up1 > 1 && up2 <= SWITCH_POP_PEAK, 'within [1, PEAK] while active');
}

// 切枪缩放确定性
{
  assert.equal(weaponSwitchPop(0.1).scale, weaponSwitchPop(0.1).scale, 'pop deterministic');
}

console.log('fx-weapon-fx: all PASS');
