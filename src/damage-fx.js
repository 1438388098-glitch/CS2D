import { clamp } from './utils.js';

// 受击方向红弧特效（candidate-308，2D 画面增强）。
// 玩家受到伤害时，屏幕边缘在受击方向出现红色弧形提示（红弧指向伤害来源方向），
// 受击瞬间闪现后 0.3s 内渐隐。作为低血量红边（lowHpVignette）的方向性补充：
// 红边为全屏径向警示，红弧则集中在受击方向，帮助玩家迅速定位攻击来源。
// 核心为确定性纯函数：仅依赖方向角 directionRad 与流逝时间 t（秒），不使用 Math.random，
// 同输入序列必然产生同输出，保证固定 seed 重放画面可复现。

export const HIT_ARC_DURATION = 0.3; // 红弧总时长（秒）
const HIT_ARC_SPREAD = 0.62; // 弧半宽（弧度，~35.5°）
const HIT_ARC_R0 = 0.8; // 内半径（相对 min(w,h)/2 的比例）
const HIT_ARC_R1 = 1; // 外半径（相对 min(w,h)/2 的比例，1 = 屏幕短边边缘）

// 受击红弧参数：返回 { alpha, angle, spread, r0, r1 }。
// angle 为伤害来源方向角（弧度），spread 为弧半宽，r0/r1 为弧带内外半径（相对 min(w,h)/2）。
// t 为受击后流逝秒数：t ≤ 0 视为刚受击（alpha=1 闪现），t ≥ 0.3 视为结束（alpha=0 隐去），
// 期间 alpha 从 1 线性衰减到 0（闪现渐隐）。非有限 t 回退为 0。
export function damageArc(directionRad, t) {
  const ts = Number.isFinite(t) ? t : 0;
  if (ts >= HIT_ARC_DURATION) {
    return { alpha: 0, angle: 0, spread: 0, r0: 0, r1: 0 };
  }
  return {
    alpha: clamp(1 - ts / HIT_ARC_DURATION, 0, 1),
    angle: Number.isFinite(directionRad) ? directionRad : 0,
    spread: HIT_ARC_SPREAD,
    r0: HIT_ARC_R0,
    r1: HIT_ARC_R1
  };
}

// 绘制：以屏幕中心为心的受击方向红色弧形扇带（内缘透明 -> 外缘红），叠加在既有画面之上。
// 弧心方向 angle 指向伤害来源，扇带横跨 [angle - spread, angle + spread]，抵近屏幕短边边缘。
export function drawDamageArc(ctx, w, h, fx) {
  if (!fx || !(fx.alpha > 0) || !(w > 0) || !(h > 0)) return;
  const cx = w / 2;
  const cy = h / 2;
  const edge = Math.min(w, h) / 2;
  const r0 = Math.max(0, edge * fx.r0);
  const r1 = Math.max(r0 + 1, edge * fx.r1);
  const a0 = fx.angle - fx.spread;
  const a1 = fx.angle + fx.spread;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, 'rgba(190,10,8,0)');
  g.addColorStop(0.7, 'rgba(205,14,10,' + (fx.alpha * 0.55).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(220,22,12,' + fx.alpha.toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1, false);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
