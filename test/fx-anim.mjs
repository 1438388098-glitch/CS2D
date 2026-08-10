// 移动动画平滑（backlog candidate-301）：stepCycle / stepDust / drawStepFx 回归测试。
// 契约：核心逻辑确定性（同输入同输出、无 Math.random）；
//       phase∈[0,1) 由累积移动距离确定（每 STEP_LEN 完成一个步态周期）；
//       站立(dist=0)时无摆动、无尘埃；尘埃粒子按移动距离存活衰减；
//       drawStepFx 用桩 ctx 可独立验证绘制调用（左右脚交替 + 尘埃在实体后方）。
import assert from 'node:assert/strict';
import { stepCycle, stepDust, drawStepFx, STEP_LEN, DUST_LIFE_DIST, DUST_PER_STEP, hash01 } from '../src/anim-fx.js';

const T = 1.234;

// ---- stepCycle：相位与摆动幅度 ----
{
  const a = stepCycle(120, T, 5);
  const b = stepCycle(120, T, 5);
  assert.deepEqual(a, b, 'same inputs same output');
  assert.ok(a.phase >= 0 && a.phase < 1, 'phase in [0,1)');
  assert.ok(a.swinging >= 0 && a.swinging <= 1, 'swinging in [0,1]');
}

{
  const idle = stepCycle(0, T, 5);
  assert.equal(idle.swinging, 0, 'standing no foot swing');
  const c = stepCycle(0, 0, 5);
  assert.equal(c.swinging, 0, 'standing no swing regardless of t');
}

// 相位由累积距离确定：步态周期 STEP_LEN，位移一个周期相位回归
{
  const p0 = stepCycle(5, T, 7).phase;
  const p1 = stepCycle(5 + STEP_LEN * 3, T, 7).phase;
  assert.ok(Math.abs(p0 - p1) < 1e-9, 'phase periodic over STEP_LEN');
  const s0 = stepCycle(5, T, 7).swinging;
  const s1 = stepCycle(5 + STEP_LEN * 3, T, 7).swinging;
  assert.ok(Math.abs(s0 - s1) < 1e-9, 'swinging periodic over STEP_LEN');
  assert.ok(
    stepCycle(5, T, 7).phase !== stepCycle(5 + STEP_LEN * 0.1, T, 7).phase,
    'phase advances with distance'
  );
}

// 摆动幅度 = |sin(phase·2π)|：跨步中段 1、落地瞬间 0
{
  let hi = -1, lo = 2;
  for (let k = 0; k <= 200; k++) {
    const r = stepCycle(STEP_LEN * (k / 200), T, 7);
    hi = Math.max(hi, r.swinging);
    lo = Math.min(lo, r.swinging);
  }
  assert.ok(hi > 0.999, 'swinging peaks at mid-stride');
  assert.ok(lo < 0.02, 'swinging dips to 0 at footfalls');
  const d = STEP_LEN * 3.7;
  const r = stepCycle(d, T, 7);
  assert.ok(
    Math.abs(r.swinging - Math.abs(Math.sin(r.phase * Math.PI * 2))) < 1e-9,
    'swinging equals |sin(phase·2π)| while moving'
  );
}

// seed 决定相位偏移（不同角色脚步错开），t 不参与相位
{
  assert.ok(JSON.stringify(stepCycle(120, T, 5)) !== JSON.stringify(stepCycle(120, T, 6)), 'seed shifts step phase');
  assert.equal(stepCycle(5, 0, 7).phase, stepCycle(5, 999, 7).phase, 't does not affect phase');
}

// ---- stepDust：尘埃粒子 ----
{
  assert.deepEqual(stepDust(0, T, 3, 5), [], 'no dust when idle');
  assert.deepEqual(stepDust(-5, T, 3, 5), [], 'negative dist treated as idle');
  assert.deepEqual(stepDust(50, T, 3, 0), [], 'count=0 no dust');

  const a = stepDust(120, T, 3, 4);
  const b = stepDust(120, T, 3, 4);
  assert.deepEqual(a, b, 'dust deterministic');
  const c = stepDust(120, T, 4, 4);
  assert.ok(JSON.stringify(a) !== JSON.stringify(c), 'seed changes dust');
  const t1 = stepDust(120, 1.0, 3, 4);
  const t2 = stepDust(120, 2.0, 3, 4);
  assert.ok(JSON.stringify(t1) !== JSON.stringify(t2), 'time modulates dust alpha');

  assert.ok(a.length > 0 && a.length <= 4, 'dust count bounded and non-empty while moving');
  for (const p of a) {
    assert.ok(
      Number.isFinite(p.dx) && Number.isFinite(p.dy) && Number.isFinite(p.r) && Number.isFinite(p.alpha),
      'particle fields finite'
    );
    assert.ok(p.r > 0.2 && p.r <= 1.5, 'particle radius sane');
    assert.ok(p.alpha >= 0 && p.alpha <= 1, 'particle alpha in [0,1]');
    assert.ok(p.p >= 0 && p.p < 1, 'particle life progress in [0,1)');
  }
}

// 尘埃生成于每次落脚（每 STEP_LEN/2 位移），且按移动距离存活衰减后移除
{
  const fresh = stepDust(0.5, T, 3, DUST_PER_STEP);
  assert.ok(fresh.length >= 1, 'fresh footfall emits dust');
  assert.ok(fresh[0].p < 0.1, 'fresh dust born near p=0');

  // 大量位移后只剩最近 1~2 次落脚残留
  const many = stepDust(3000, T, 3, 10);
  assert.ok(many.length >= 1 && many.length <= 2, 'only recent footfalls keep dust');
  // 存活粒子寿命进度恒 < 1（受 DUST_LIFE_DIST 约束）
  for (const p of many) assert.ok(p.p < 1, 'life progress stays < 1');
  // 长位移后 alpha 明显低于新生成（同一 seed，仅年龄不同）
  assert.ok(many[0].alpha < fresh[0].alpha, 'older dust fainter than fresh');
}

// ---- drawStepFx：桩 ctx 验证绘制行为 ----
function stubCtx() {
  const calls = [];
  return {
    calls,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    fill() { calls.push('fill'); },
    ellipse(...args) { calls.push(['ellipse', ...args]); },
    arc(...args) { calls.push(['arc', ...args]); },
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    set globalAlpha(v) { calls.push(['globalAlpha', v]); },
    set lineCap(v) {}
  };
}

{
  // 站立：不绘制任何足迹/尘埃
  const s = stubCtx();
  drawStepFx(s, { x: 0, y: 0, angle: 0 }, { phase: 0.3, swinging: 0, dust: [] });
  assert.deepEqual(s.calls, ['save', 'restore'], 'idle draws nothing');
  assert.equal(s.calls.filter((c) => c[0] === 'ellipse').length, 0, 'no feet when idle');
  assert.equal(s.calls.filter((c) => c[0] === 'arc').length, 0, 'no dust when idle');
}

{
  // 移动：两只脚交替（一前一后）+ 尘埃若干
  const s = stubCtx();
  const dust = stepDust(STEP_LEN * 2 + 3, T, 3, DUST_PER_STEP);
  drawStepFx(s, { x: 0, y: 0, angle: 0 }, { phase: 0.25, swinging: 1, dust });
  const feet = s.calls.filter((c) => c[0] === 'ellipse');
  const arcs = s.calls.filter((c) => c[0] === 'arc');
  assert.equal(feet.length, 2, 'two alternating feet drawn while moving');
  assert.equal(arcs.length, dust.length, 'one arc per dust particle');
  // angle=0 朝 +x：foot0 向前、foot1 向后，x 坐标一正一负
  assert.ok(feet[0][1] > 0 && feet[1][1] < 0, 'feet alternate forward/back along facing');
  // 尘埃拖在运动后方（dy 沿 -x，故世界 x 为负）
  assert.ok(arcs.every((a) => a[1] < 0), 'dust trails behind mover');
}

{
  // 朝向旋转：angle=π/2 朝 +y 时尘埃仍在后方（世界 y 为负）
  const s = stubCtx();
  const dust = stepDust(STEP_LEN + 3, T, 3, DUST_PER_STEP);
  drawStepFx(s, { x: 0, y: 0, angle: Math.PI / 2 }, { phase: 0.25, swinging: 1, dust });
  const arcs = s.calls.filter((c) => c[0] === 'arc');
  assert.ok(arcs.every((a) => a[2] < 0), 'dust trails behind mover in rotated frame');
}

// 防御：无效输入不抛异常
{
  const s = stubCtx();
  drawStepFx(s, { x: 0, y: 0, angle: 0 }, null);
  assert.deepEqual(s.calls, [], 'null fx no-op');
  drawStepFx(null, { x: 0, y: 0, angle: 0 }, { phase: 0, swinging: 1, dust: [] });
  assert.deepEqual(s.calls, [], 'null ctx no-op');
}

// hash01 基准
assert.ok(hash01(1, 2, 3) >= 0 && hash01(1, 2, 3) < 1, 'hash01 ranged');
assert.equal(hash01(1, 2, 3), hash01(1, 2, 3), 'hash01 deterministic');
assert.ok(hash01(1, 2, 3) !== hash01(2, 2, 3), 'hash01 input varies');

console.log('fx-anim: all PASS');
