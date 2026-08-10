// 2D 命中十字反馈增强（candidate-300）纯逻辑测试（不渲染）：
// 命中 → 准星显著扩散 + 橙/红变色；未命中开火 → 轻微扩散但颜色不变。
// 契约：crosshairHitFeedback(hit, t, recoil) 返回 {spreadMul, color, t}，
//       命中优先由 hud.js 的 crosshairFeedbackFor(game, p) 胶水负责判定。
import assert from 'node:assert';
import { crosshairHitFeedback, HIT_FEEDBACK_DUR, MISS_FEEDBACK_DUR } from '../src/crosshair.js';
import { crosshairFeedbackFor } from '../src/hud.js';

// 纯函数基础：命中时刻（t=dur）达到最大扩散 + 橙色
{
  const fb = crosshairHitFeedback(true, HIT_FEEDBACK_DUR, 0);
  assert.ok(fb, 'hit at start returns feedback');
  assert.ok(Math.abs(fb.spreadMul - 1.9) < 1e-9, 'hit max spreadMul ~1.9, got ' + fb.spreadMul);
  assert.ok(typeof fb.color === 'string' && fb.color.includes('255'), 'hit color set, got ' + fb.color);
  assert.ok(fb.t === HIT_FEEDBACK_DUR, 'hit t passthrough');
}

// 纯函数基础：命中衰减一半 → 扩散减半强度，仍变色
{
  const fb = crosshairHitFeedback(true, HIT_FEEDBACK_DUR / 2, 0);
  assert.ok(fb, 'hit half feedback present');
  assert.ok(Math.abs(fb.spreadMul - 1.45) < 1e-9, 'hit half spreadMul ~1.45, got ' + fb.spreadMul);
  assert.ok(typeof fb.color === 'string', 'hit half still colored');
}

// 命中尾部（p<0.45）→ 红色系
{
  const fb = crosshairHitFeedback(true, HIT_FEEDBACK_DUR * 0.1, 0);
  assert.ok(fb && fb.color && fb.color.includes('48'), 'hit tail turns red, got ' + (fb && fb.color));
}

// 未命中开火：轻微扩散但颜色不变（color === null）
{
  const fb = crosshairHitFeedback(false, MISS_FEEDBACK_DUR, 0);
  assert.ok(fb, 'miss at start returns feedback');
  assert.ok(Math.abs(fb.spreadMul - 1.35) < 1e-9, 'miss max spreadMul ~1.35, got ' + fb.spreadMul);
  assert.strictEqual(fb.color, null, 'miss keeps default color');
  const half = crosshairHitFeedback(false, MISS_FEEDBACK_DUR / 2, 0);
  assert.ok(Math.abs(half.spreadMul - 1.175) < 1e-9, 'miss half spreadMul ~1.175, got ' + half.spreadMul);
  assert.strictEqual(half.color, null, 'miss half keeps default color');
}

// 命中扩散强于未命中：同剩余时间下命中 spreadMul 更大
{
  const h = crosshairHitFeedback(true, MISS_FEEDBACK_DUR, 0);
  const m = crosshairHitFeedback(false, MISS_FEEDBACK_DUR, 0);
  assert.ok(h.spreadMul > m.spreadMul, 'hit spreads more than miss at same t');
}

// 边界：t<=0 / t>dur / 非有限 t → null
{
  assert.strictEqual(crosshairHitFeedback(true, 0, 0), null, 't=0 null');
  assert.strictEqual(crosshairHitFeedback(true, -0.1, 0), null, 't<0 null');
  assert.strictEqual(crosshairHitFeedback(false, HIT_FEEDBACK_DUR + 1, 0), null, 't>dur null');
  assert.strictEqual(crosshairHitFeedback(true, NaN, 0), null, 'NaN null');
  assert.strictEqual(crosshairHitFeedback(true, Infinity, 0), null, 'Infinity null');
}

// 确定性：同入参多次调用结果完全一致（无随机）
{
  const a1 = crosshairHitFeedback(true, HIT_FEEDBACK_DUR * 0.3, 0.8);
  const a2 = crosshairHitFeedback(true, HIT_FEEDBACK_DUR * 0.3, 0.8);
  assert.deepStrictEqual(a1, a2, 'deterministic hit');
  const b1 = crosshairHitFeedback(false, MISS_FEEDBACK_DUR * 0.6, 1.2);
  const b2 = crosshairHitFeedback(false, MISS_FEEDBACK_DUR * 0.6, 1.2);
  assert.deepStrictEqual(b1, b2, 'deterministic miss');
}

// recoil 参与：后座越高命中反馈压得越明显（spreadMul 单调不减）
{
  const r0 = crosshairHitFeedback(true, HIT_FEEDBACK_DUR, 0);
  const r2 = crosshairHitFeedback(true, HIT_FEEDBACK_DUR, 2.4);
  assert.ok(r2.spreadMul > r0.spreadMul, 'recoil scales hit spread');
  assert.ok(Math.abs(r2.spreadMul - 2.15) < 1e-9, 'recoil max spreadMul ~2.15, got ' + r2.spreadMul);
}

// 胶水：无 player / 死亡 → null
{
  assert.strictEqual(crosshairFeedbackFor(null, null), null, 'no game null');
  assert.strictEqual(crosshairFeedbackFor({}, null), null, 'no player null');
  assert.strictEqual(crosshairFeedbackFor({}, { dead: true }), null, 'dead player null');
}

// 胶水：命中优先于开火（hitMarkT>0 时即便刚开火也走命中分支）
{
  const g = { time: 10, hitMarkT: 0.22 };
  const p = { dead: false, recoil: 0, lastShot: 10 * 1000 - 10 };
  const fb = crosshairFeedbackFor(g, p);
  assert.ok(fb, 'hit precedence returns feedback');
  assert.ok(fb.color !== null, 'hit precedence colored');
  assert.ok(fb.spreadMul > 1.6, 'hit precedence strong spread, got ' + fb.spreadMul);
}

// 胶水：刚开火未命中 → 轻微扩散、颜色不变
{
  const g = { time: 10, hitMarkT: 0 };
  const p = { dead: false, recoil: 0, lastShot: 10 * 1000 - 50 };
  const fb = crosshairFeedbackFor(g, p);
  assert.ok(fb, 'recent miss returns feedback');
  assert.strictEqual(fb.color, null, 'recent miss no color');
  assert.ok(fb.spreadMul > 1 && fb.spreadMul < 1.35, 'recent miss mild spread, got ' + fb.spreadMul);
}

// 胶水：超过反馈窗口 / 从未开火 → null
{
  const g = { time: 10, hitMarkT: 0 };
  const old = crosshairFeedbackFor(g, { dead: false, recoil: 0, lastShot: 10 * 1000 - 500 });
  assert.strictEqual(old, null, 'stale shot null');
  const never = crosshairFeedbackFor(g, { dead: false, recoil: 0, lastShot: 0 });
  assert.strictEqual(never, null, 'never fired null');
}

console.log('fx-hit-feedback: all PASS');
