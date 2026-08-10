import { clamp } from './utils.js';

// 低血量 (<30%) 屏幕边缘红色脉冲警示特效（2D 画面增强）。
// 核心为确定性纯函数：仅依赖 hp/maxHp 与时间 t（秒），不使用 Math.random，
// 同输入序列必然产生同输出，保证固定 seed 重放画面可复现。

const LOW_RATIO = 0.3;
const PULSE_BASE = Math.PI * 2 / 1.6; // 基础呼吸周期 ~1.6s

// 低血量强度：0 = 无（≥30% 或已死亡/0 血），1 = 濒死（血量趋近 0）
export function lowHpIntensity(hp, maxHp) {
  if (!(hp > 0)) return 0;
  const m = maxHp > 0 ? maxHp : 100;
  const ratio = clamp(hp / m, 0, 1);
  if (ratio >= LOW_RATIO) return 0;
  return clamp(1 - ratio / LOW_RATIO, 0, 1);
}

// 低血量边缘警示参数：血量越低越明显，边缘红边按时间呼吸闪烁。
// 返回 { alpha, pulse, radius, intensity }，radius 为红边内缘半径（相对 min(w,h) 的比例）。
export function lowHpVignette(hp, maxHp, t, dpr) {
  const intensity = lowHpIntensity(hp, maxHp);
  if (intensity <= 0) return { alpha: 0, pulse: 0, radius: 1, intensity: 0 };
  const ts = Number.isFinite(t) ? t : 0;
  const freq = PULSE_BASE * (1 + 0.7 * intensity); // 濒死时呼吸加快，更紧迫
  const pulse = 0.5 + 0.5 * Math.sin(ts * freq);
  const alpha = (0.16 + 0.58 * intensity) * (0.55 + 0.45 * pulse);
  const radius = 0.68 - 0.22 * intensity; // 血量越低，红边内缘越向中心推进
  return { alpha, pulse, radius, intensity };
}

// 绘制：以屏幕中心为心的径向红边（内缘透明 -> 外缘红），叠加在既有画面之上。
export function drawLowHpVignette(ctx, w, h, fx) {
  if (!fx || !(fx.alpha > 0) || !(w > 0) || !(h > 0)) return;
  const cx = w / 2;
  const cy = h / 2;
  const inner = Math.min(w, h) * fx.radius;
  const outer = Math.hypot(w, h) / 2 + 8;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, Math.max(0, inner), cx, cy, outer);
  g.addColorStop(0, 'rgba(190,10,8,0)');
  g.addColorStop(0.55, 'rgba(190,10,8,' + (fx.alpha * 0.25).toFixed(3) + ')');
  g.addColorStop(0.85, 'rgba(205,14,10,' + (fx.alpha * 0.62).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(220,22,12,' + fx.alpha.toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
