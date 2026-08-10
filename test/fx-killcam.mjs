// 2D 击杀回放特效（candidate-310）纯逻辑回归（不渲染）：
// 契约：killLabelText(kind, streak) 确定性返回文案（normal:'KILL'/headshot:'爆头!'/
//       multikill:'DOUBLE KILL'/'TRIPLE KILL'/'QUAD KILL'/'RAMPAGE'，多杀按 streak）；
//       killLabel(kind, streak, t) 确定性返回 {text,color,scale,alpha,x,y,size}，
//       0-0.15s 缩放放大淡入、0.15-0.8s 停留、0.8-1.2s 淡出缩小；
//       drawKillLabel(ctx, fx) 以 x/y（画布比例）居中描边绘制，仅 alpha>0 时有动作。
import assert from 'node:assert/strict';
import {
  killLabel, killLabelText, drawKillLabel,
  KILL_LABEL_FADE_IN, KILL_LABEL_HOLD_AT, KILL_LABEL_DUR
} from '../src/killcam-fx.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 文案：normal / headshot / multikill 按 streak
{
  assert.equal(killLabelText('normal', 1), 'KILL', 'normal text');
  assert.equal(killLabelText('headshot', 0), '爆头!', 'headshot text');
  assert.equal(killLabelText('multikill', 2), 'DOUBLE KILL', 'streak2');
  assert.equal(killLabelText('multikill', 3), 'TRIPLE KILL', 'streak3');
  assert.equal(killLabelText('multikill', 4), 'QUAD KILL', 'streak4');
  assert.equal(killLabelText('multikill', 5), 'RAMPAGE', 'streak5');
  assert.equal(killLabelText('multikill', 10), 'RAMPAGE', 'streak10 rampage');
  assert.equal(killLabelText('multikill', 1), 'DOUBLE KILL', 'streak<2 clamps to double');
  assert.equal(killLabelText('multikill', NaN), 'DOUBLE KILL', 'non-finite streak fallback');
  assert.equal(killLabelText('bogus', 3), 'KILL', 'unknown kind falls back to KILL');
  assert.equal(killLabelText('multikill', 2), killLabelText('multikill', 2), 'deterministic text');
}

// killLabel 字段契约：text 与 killLabelText 一致，kind 决定 color/size，x/y 为比例中心
{
  const fx = killLabel('normal', 1, 0.15);
  assert.equal(fx.text, killLabelText('normal', 1), 'normal text passthrough');
  assert.equal(fx.color, '#eaf1f8', 'normal color');
  assert.equal(fx.size, 44, 'normal size');
  assert.equal(fx.x, 0.5, 'x is canvas-relative center');
  assert.equal(fx.y, 0.35, 'y is canvas-relative center');
  assert.deepEqual(fx, killLabel('normal', 1, 0.15), 'deterministic object');
}

// 三段式动画：淡入（0-0.15 放大淡入）
{
  const s0 = killLabel('normal', 1, 0);
  assert.equal(s0.alpha, 0, 't=0 alpha 0');
  assert.equal(s0.scale, 0.6, 't=0 min scale');
  const half = killLabel('normal', 1, KILL_LABEL_FADE_IN / 2);
  assert.equal(half.alpha, 0.5, 'fade-in midpoint alpha');
  assert.ok(half.scale > 0.6 && half.scale < 1, 'fade-in midpoint scale between min and 1');
  const end = killLabel('normal', 1, KILL_LABEL_FADE_IN);
  assert.equal(end.alpha, 1, 'fade-in end alpha 1');
  assert.equal(end.scale, 1, 'fade-in end scale 1');
}

// 三段式动画：停留（0.15-0.8 完整显示）
{
  const mid = killLabel('headshot', 0, (KILL_LABEL_FADE_IN + KILL_LABEL_HOLD_AT) / 2);
  assert.equal(mid.alpha, 1, 'hold alpha 1');
  assert.equal(mid.scale, 1, 'hold scale 1');
  const h0 = killLabel('headshot', 0, KILL_LABEL_HOLD_AT);
  assert.equal(h0.alpha, 1, 'hold start alpha 1');
  assert.equal(h0.scale, 1, 'hold start scale 1');
}

// 三段式动画：淡出（0.8-1.2 淡出缩小，1.2 后归零并保持）
{
  const half = killLabel('multikill', 3, (KILL_LABEL_HOLD_AT + KILL_LABEL_DUR) / 2);
  assert.equal(half.alpha, 0.5, 'fade-out midpoint alpha');
  assert.ok(half.scale > 0.88 && half.scale < 1, 'fade-out midpoint scale shrinking');
  const e0 = killLabel('multikill', 3, KILL_LABEL_DUR);
  assert.equal(e0.alpha, 0, 't=dur alpha 0');
  assert.ok(e0.scale < 1, 't=dur scale shrunk');
  const past = killLabel('multikill', 3, KILL_LABEL_DUR + 1);
  assert.equal(past.alpha, 0, 'past dur alpha stays 0');
}

// 单调性：alpha 先升后降，scale 先放大后缩小
{
  const alphas = [0.03, 0.08, 0.13, 0.2, 0.5, 0.7, 0.9, 1.05, 1.15]
    .map((t) => killLabel('normal', 1, t).alpha);
  for (let i = 1; i < alphas.length; i++) {
    if (i < 5) assert.ok(alphas[i] >= alphas[i - 1], 'alpha rises through fade-in/hold');
    else assert.ok(alphas[i] <= alphas[i - 1], 'alpha falls through fade-out');
  }
  const scales = [0.02, 0.08, 0.13, 0.4, 0.7, 0.9, 1.05, 1.15]
    .map((t) => killLabel('headshot', 0, t).scale);
  assert.ok(scales[2] > scales[1] && scales[1] > scales[0], 'scale grows during fade-in');
  assert.ok(scales[7] < scales[6] && scales[6] < scales[5], 'scale shrinks during fade-out');
}

// kind 差异：headshot/multikill 的颜色与字号互不相同
{
  const n = killLabel('normal', 1, 0.3);
  const h = killLabel('headshot', 0, 0.3);
  const m = killLabel('multikill', 2, 0.3);
  assert.equal(h.text, '爆头!', 'headshot text');
  assert.equal(h.color, '#ffd34d', 'headshot gold');
  assert.equal(m.text, 'DOUBLE KILL', 'multikill text');
  assert.equal(m.color, '#ff7a3c', 'multikill orange');
  assert.notEqual(h.color, n.color, 'headshot color differs from normal');
  assert.notEqual(m.size, h.size, 'multikill size differs from headshot');
}

// 边界：负 t / 非有限 t 回退为起手帧（t=0）
{
  assert.deepEqual(killLabel('normal', 1, -0.5), killLabel('normal', 1, 0), 'negative t = t0');
  assert.deepEqual(killLabel('normal', 1, NaN), killLabel('normal', 1, 0), 'NaN = t0');
  assert.deepEqual(killLabel('normal', 1, Infinity), killLabel('normal', 1, 0), 'Infinity = t0');
  assert.deepEqual(killLabel('headshot', 0, -1), killLabel('headshot', 0, 0), 'headshot negative');
}

// drawKillLabel：居中描边文字（stub ctx）
{
  const calls = [];
  const ctx = {
    canvas: { width: 1280, height: 720 },
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    translate() { calls.push('translate'); },
    rotate() { calls.push('rotate'); },
    beginPath() { calls.push('begin'); },
    moveTo() { calls.push('move'); },
    lineTo() { calls.push('line'); },
    arc() { calls.push('arc'); },
    stroke() { calls.push('stroke'); },
    fill() { calls.push('fill'); },
    strokeText(t, x, y) { calls.push('stroke:' + t + '@' + x + ',' + y); },
    fillText(t, x, y) { calls.push('fill:' + t + '@' + x + ',' + y); },
    set globalAlpha(v) { calls.push('alpha:' + v); },
    set textAlign(v) { calls.push('align:' + v); },
    set textBaseline(v) { calls.push('baseline:' + v); },
    set font(v) { calls.push('font:' + v); },
    set strokeStyle(v) { calls.push('strokeStyle:' + v); },
    set lineWidth(v) { calls.push('lineWidth:' + v); },
    set lineCap(v) { calls.push('lineCap:' + v); },
    set fillStyle(v) { calls.push('fillStyle:' + v); }
  };
  calls.length = 0;
  drawKillLabel(ctx, killLabel('normal', 1, KILL_LABEL_FADE_IN));
  assert.ok(calls.includes('save') && calls.includes('restore'), 'save/restore present');
  assert.ok(calls.includes('alpha:1'), 'alpha applied');
  assert.ok(calls.includes('align:center') && calls.includes('baseline:middle'), 'centered text');
  assert.ok(calls.includes("font:900 44px 'Segoe UI',sans-serif"), 'latin font scaled, got ' + calls.filter((c) => c.startsWith('font:')).join('|'));
  const stroke = calls.find((c) => c.startsWith('stroke:KILL@'));
  const fill = calls.find((c) => c.startsWith('fill:KILL@'));
  assert.ok(stroke, 'stroke text at center');
  assert.ok(fill, 'fill text at center');
  const [sx, sy] = stroke.replace('stroke:KILL@', '').split(',').map(Number);
  const [fx2, fy] = fill.replace('fill:KILL@', '').split(',').map(Number);
  assert.ok(near(sx, 640) && near(sy, 252), 'stroke coords at (640,252), got ' + stroke);
  assert.ok(near(fx2, 640) && near(fy, 252), 'fill coords at (640,252), got ' + fill);
  assert.ok(calls.includes('fillStyle:#eaf1f8'), 'fill uses kind color');

  // 中文（爆头!）使用中文字体族
  calls.length = 0;
  drawKillLabel(ctx, killLabel('headshot', 0, KILL_LABEL_HOLD_AT));
  assert.ok(calls.some((c) => c.startsWith('font:') && c.includes('Microsoft YaHei')), 'cjk font family');
  const cs = calls.find((c) => c.startsWith('stroke:爆头!@'));
  assert.ok(cs, 'cjk stroke text');
  const [csx, csy] = cs.replace('stroke:爆头!@', '').split(',').map(Number);
  assert.ok(near(csx, 640) && near(csy, 252), 'cjk stroke coords, got ' + cs);

  // 多杀字号随缩放变化
  calls.length = 0;
  drawKillLabel(ctx, killLabel('multikill', 2, KILL_LABEL_FADE_IN));
  assert.ok(calls.some((c) => c === "font:900 48px 'Segoe UI',sans-serif"), 'multikill base size');
}

// drawKillLabel：alpha=0 / 无 canvas / null 输入均为 no-op
{
  const mk = () => {
    const calls = [];
    return {
      calls,
      canvas: { width: 1280, height: 720 },
      save() { calls.push('save'); },
      restore() { calls.push('restore'); },
      translate() { calls.push('translate'); },
      rotate() { calls.push('rotate'); },
      beginPath() { calls.push('begin'); },
      moveTo() { calls.push('move'); },
      lineTo() { calls.push('line'); },
      arc() { calls.push('arc'); },
      stroke() { calls.push('stroke'); },
      fill() { calls.push('fill'); },
      strokeText() { calls.push('stroke'); },
      fillText() { calls.push('fill'); },
      set globalAlpha(v) { calls.push('a'); },
      set textAlign(v) { calls.push('t'); },
      set textBaseline(v) { calls.push('t'); },
      set font(v) { calls.push('f'); },
      set strokeStyle(v) { calls.push('s'); },
      set lineWidth(v) { calls.push('l'); },
      set lineCap(v) { calls.push('c'); },
      set fillStyle(v) { calls.push('c'); }
    };
  };
  const c1 = mk();
  drawKillLabel(c1, killLabel('normal', 1, KILL_LABEL_DUR));
  assert.equal(c1.calls.length, 0, 'alpha=0 is no-op');
  const c2 = mk();
  drawKillLabel(c2, null);
  assert.equal(c2.calls.length, 0, 'null fx is no-op');
  const c3 = mk();
  c3.canvas = null;
  drawKillLabel(c3, killLabel('normal', 1, 0.3));
  assert.equal(c3.calls.length, 0, 'missing canvas is no-op');
  const c4 = mk();
  c4.canvas = { width: 0, height: 720 };
  drawKillLabel(c4, killLabel('normal', 1, 0.3));
  assert.equal(c4.calls.length, 0, 'zero-width canvas is no-op');
  drawKillLabel(null, killLabel('normal', 1, 0.3));
}

console.log('fx-killcam: all PASS');
