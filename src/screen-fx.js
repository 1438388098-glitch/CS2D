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

// 低血量心跳脉冲环（candidate-406，2D 画面增强）。
// 与红边互补：红边提示持续生命危险，同心脉冲环提供濒死心跳节奏。
// 纯逻辑同样确定性，只依赖 hp/maxHp 与游戏时间 t，不使用 Math.random。
const HEART_PULSE_PERIOD = 1.15; // 基础心跳周期（秒）
const HEART_PULSE_RINGS = 3;
const HEART_PULSE_MAX_RINGS = 4;

// 低血量脉冲参数：返回 { alpha, phase, rings, intensity }。
// phase ∈ [0,1) 驱动脉冲环相位，rings 为同时存在的同心环数量。
// 血量越低 alpha 越高、周期越快；≥30% 或死亡时返回全零（不绘制）。
export function lowHpPulse(hp, maxHp, t) {
  const intensity = lowHpIntensity(hp, maxHp);
  if (intensity <= 0) return { alpha: 0, phase: 0, rings: 0, intensity: 0 };
  const ts = Number.isFinite(t) ? t : 0;
  const period = HEART_PULSE_PERIOD * (1 - 0.22 * intensity);
  return {
    alpha: 0.16 + 0.3 * intensity,
    phase: (ts % period) / period,
    rings: intensity > 0.75 ? HEART_PULSE_MAX_RINGS : HEART_PULSE_RINGS,
    intensity
  };
}

// 绘制：以屏幕中心为源不断外扩的同心脉冲环，环越新越粗/亮，越旧越淡。
export function drawLowHpPulse(ctx, w, h, fx) {
  if (!fx || !(fx.alpha > 0) || !(w > 0) || !(h > 0)) return;
  const cx = w / 2;
  const cy = h / 2;
  const edge = Math.min(w, h) / 2;
  const phase = Number.isFinite(fx.phase) ? fx.phase : 0;
  const rings = Number.isInteger(fx.rings) && fx.rings > 0 ? fx.rings : HEART_PULSE_RINGS;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, edge * 0.014);
  ctx.strokeStyle = 'rgba(255,82,64,0.95)';
  ctx.lineCap = 'round';
  for (let i = 0; i < rings; i++) {
    const p = (phase + i / rings) % 1;
    const r = Math.max(2, p * edge * 1.08);
    ctx.globalAlpha = clamp((1 - p) * 0.62 * fx.alpha, 0, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// 击杀屏幕边缘白色闪光（candidate-304，2D 画面增强）。
// 玩家击杀时左右下三边缘短暂白色闪光，0.35s 内从 1 衰减到 0。
// 核心为确定性纯函数：仅依赖传入时间 t（击杀后流逝秒数），不使用 Date/performance。

const KILL_FLASH_DUR = 0.35; // 闪光总时长
const KILL_FLASH_EDGES = ['left', 'right', 'bottom']; // 闪光边缘：左/右/下
const KILL_FLASH_DEPTH = 0.22; // 边缘闪光深度（相对 min(w,h) 的比例）

// 击杀闪光参数：返回 { alpha, edge }，alpha ∈ [0,1] 随时间线性衰减。
// t ≤ 0 视为刚击杀（alpha=1），t ≥ 0.35 视为结束（alpha=0）。
export function killFlash(t) {
  const ts = Number.isFinite(t) ? t : 0;
  const alpha = clamp(1 - ts / KILL_FLASH_DUR, 0, 1);
  return { alpha, edge: KILL_FLASH_EDGES };
}

// 绘制：左/右/下三边缘白色渐变闪光（外缘白 -> 内缘透明），叠加在既有画面之上。
export function drawKillFlash(ctx, w, h, fx) {
  if (!fx || !(fx.alpha > 0) || !(w > 0) || !(h > 0)) return;
  const edges = Array.isArray(fx.edge) ? fx.edge : KILL_FLASH_EDGES;
  const depth = Math.min(w, h) * KILL_FLASH_DEPTH;
  const a = fx.alpha.toFixed(3);
  ctx.save();
  for (const e of edges) {
    if (e === 'left') {
      const g = ctx.createLinearGradient(0, 0, depth, 0);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, depth, h);
    } else if (e === 'right') {
      const g = ctx.createLinearGradient(w, 0, w - depth, 0);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w - depth, 0, depth, h);
    } else if (e === 'bottom') {
      const g = ctx.createLinearGradient(0, h, 0, h - depth);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h - depth, w, depth);
    }
  }
  ctx.restore();
}

// 死亡冷色滤镜（candidate-543）：出局后画面蓝灰渐入（1.2s 至上限 0.32），
// 给死亡后约 3s 的观战期一个"你已出局"的氛围过渡，与低血红边形成冷暖对比
export const DEATH_VEIL_MAX = 0.32;
export const DEATH_VEIL_RAMP = 1.2;

export function deathVeilAlpha(deadFor) {
  if (!Number.isFinite(deadFor) || deadFor <= 0) return 0;
  return Math.min(DEATH_VEIL_MAX, (deadFor / DEATH_VEIL_RAMP) * DEATH_VEIL_MAX);
}

export function drawDeathVeil(ctx, w, h, alpha) {
  if (!(alpha > 0)) return;
  ctx.save();
  ctx.fillStyle = 'rgba(38,56,80,' + alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
