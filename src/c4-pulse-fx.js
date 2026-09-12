// C4 终局红脉冲（画面表现，candidate-506）：最后 10 秒屏幕边缘红晕随蜂鸣节拍呼吸。
// 纯函数 + 纯绘制（stub ctx 可测），与 updateCamera 的 beep 节拍（bt<5 → 0.25s / <10 → 0.5s）一致。

// 红脉冲强度（纯函数，供测试断言）：timer>10 → 0；10→0 线性推进整体强度；
// 呼吸相位与蜂鸣间隔对齐（每次 beep 瞬间最亮，随间隔线性衰减）。
export function bombPulseAlpha(timer, beepT, now) {
  const bt = Number(timer);
  if (!Number.isFinite(bt) || bt >= 10 || bt <= 0) return 0;
  const envelope = (10 - bt) / 10;                 // 越接近爆炸越强
  const interval = bt < 5 ? 0.25 : 0.5;            // 与 updateCamera 蜂鸣升频一致
  const ts = Number.isFinite(now) ? now : 0;
  const phase = 1 - Math.min(Math.max(interval - (Number(beepT) || 0), 0), interval) / interval;
  return envelope * (0.1 + 0.22 * phase);
}

// 绘制：屏幕四边红晕（中心透明 → 边缘红），alpha 由 bombPulseAlpha 提供
export function drawBombPulse(ctx, w, h, alpha) {
  if (!ctx || !(alpha > 0.005) || !(w > 0) || !(h > 0)) return;
  const cx = w / 2;
  const cy = h / 2;
  const inner = Math.min(w, h) * 0.42;
  const outer = Math.hypot(w, h) / 2 + 8;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  g.addColorStop(0, 'rgba(255,40,25,0)');
  g.addColorStop(1, 'rgba(255,40,25,' + Math.min(0.55, alpha).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
