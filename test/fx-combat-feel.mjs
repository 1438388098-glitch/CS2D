// 战斗打击感（Round 1）测试：particleStreakSpec / bodyFlashAlpha / botBob / dmgPopStyle。
// 契约：
//   particleStreakSpec(p) —— 条纹长度随速度线性增长并夹在 [2,10]，方向为单位向量；
//                            零速度退化为 (1,0) 方向的 2px 短点；同输入同输出（确定性）。
//   bodyFlashAlpha(t, head) —— 受击白闪强度 = clamp(t/时长,0,1)*0.45；爆头时长 0.45s > 普通 0.3s；
//                              fresh 时 0.45，线性衰减，t=0 为 0。
//   botBob(phase, tSec) —— 正弦起伏，幅度 ≤1.8，同输入同输出。
//   dmgPopStyle(pop) —— 字号 4 档随伤害单调递增；爆头数字在出现后 0.12s 弹到 1.55 倍再 0.25s 回落；
//                       alpha = clamp(t/0.3,0,1)。
import assert from 'node:assert/strict';
import {
  particleStreakSpec,
  bodyFlashAlpha,
  botBob,
  dmgPopStyle
} from '../src/render.js';

// ---- particleStreakSpec：长度夹取 + 方向归一 ----
{
  const fast = particleStreakSpec({ vx: 400, vy: 0 });
  assert.equal(fast.len, 10, 'speed 400*0.035=14 clamps to max len 10');
  assert.ok(Math.abs(fast.ux) === 1 && fast.uy === 0, 'unit direction');

  const slow = particleStreakSpec({ vx: 40, vy: 0 });
  assert.ok(Math.abs(slow.len - 2) < 1e-9, 'speed 40*0.035=1.4 clamps up to min len 2');

  const zero = particleStreakSpec({ vx: 0, vy: 0 });
  assert.equal(zero.len, 2, 'zero speed keeps min len');
  assert.equal(zero.ux, 1, 'zero speed default dir x');
  assert.equal(zero.uy, 0, 'zero speed default dir y');

  const diag = particleStreakSpec({ vx: 100, vy: 100 });
  assert.ok(Math.abs(diag.ux - Math.SQRT1_2) < 1e-9, 'diagonal normalized x');
  assert.ok(Math.abs(diag.uy - Math.SQRT1_2) < 1e-9, 'diagonal normalized y');

  const again = particleStreakSpec({ vx: 400, vy: 0 });
  assert.deepEqual(fast, again, 'deterministic');
}

// ---- bodyFlashAlpha：包络与爆头持续更久 ----
{
  assert.ok(Math.abs(bodyFlashAlpha(0.3, false) - 0.45) < 1e-9, 'fresh body flash 0.45');
  assert.ok(Math.abs(bodyFlashAlpha(0.45, true) - 0.45) < 1e-9, 'fresh head flash 0.45');
  assert.equal(bodyFlashAlpha(0, false), 0, 'expired flash 0');
  assert.equal(bodyFlashAlpha(0, true), 0, 'expired head flash 0');
  assert.ok(Math.abs(bodyFlashAlpha(0.15, false) - 0.225) < 1e-9, 'linear midpoint');
  assert.ok(
    bodyFlashAlpha(0.2, false) > bodyFlashAlpha(0.1, false),
    'monotonic in remaining time'
  );
}

// ---- botBob：有界正弦 + 确定性 ----
{
  for (let i = 0; i < 32; i++) {
    const v = botBob(i / 7, i * 0.37);
    assert.ok(Math.abs(v) <= 1.8 + 1e-9, `bob bounded, got ${v}`);
  }
  const peak = botBob(0.25, 0); // phase*2π = π/2 → sin 峰值
  assert.ok(Math.abs(peak - 1.8) < 1e-6, 'peak amplitude 1.8');
  assert.equal(botBob(0.3, 1.5), botBob(0.3, 1.5), 'deterministic');
}

// ---- dmgPopStyle：字号分级 + 爆头弹跳 + alpha ----
{
  const base = (dmg) => dmgPopStyle({ dmg, head: false, t: 0.8 });
  assert.equal(base(10).size, 11, 'tier0 11px');
  assert.equal(base(30).size, 13.5, 'tier1 13.5px');
  assert.equal(base(60).size, 16, 'tier2 16px');
  assert.equal(base(95).size, 18.5, 'tier3 18.5px');
  assert.ok(base(21).size < base(22).size, 'tier boundary monotonic');

  // 爆头弹跳：age=0 不放大，age=0.12（t=0.68）达峰值 1.55 倍，age=0.37（t=0.43）回落到 1 倍
  const at = (t) => dmgPopStyle({ dmg: 10, head: true, t }).size;
  assert.ok(Math.abs(at(0.8) - 11) < 1e-9, 'head pop starts at base size');
  assert.ok(Math.abs(at(0.68) - 11 * 1.55) < 1e-6, 'head pop peaks at 1.55x');
  assert.ok(Math.abs(at(0.43) - 11) < 1e-6, 'head pop settles back to base');
  assert.ok(at(0.74) > at(0.8) && at(0.74) < at(0.68), 'pop grows then decays');

  // alpha 沿用原淡出曲线
  assert.equal(dmgPopStyle({ dmg: 10, t: 0.3 }).alpha, 1, 'alpha full at t=0.3');
  assert.ok(Math.abs(dmgPopStyle({ dmg: 10, t: 0.15 }).alpha - 0.5) < 1e-9, 'alpha half');
  assert.equal(dmgPopStyle({ dmg: 10, t: 0 }).alpha, 0, 'alpha 0 at expiry');
}

console.log('fx-combat-feel: all PASS');
