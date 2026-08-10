// 2D 爆炸冲击波增强（candidate-298）：在 render.js 基础冲击波环（boomShockwaveSpec）之上叠加更多层次——
// 爆闪（flash）、震动纹理环（texture，外环切段抖动碎裂）、二次衰减环（inner，内环弱化）、地面烟尘卷起（groundDust）。
// 纯装饰层，不影响碰撞 / LOS / 爆炸逻辑；所有几何 / 抖动 / 粒子由 position + seed 的确定性哈希（hash01）导出，
// 无 Math.random —— 同 (p, seed) 完全可复现。
// 本模块独立，不改动 render.js / 3D 文件；drawEnhancedBoom 可用 stub ctx 测试。

import { clamp } from './utils.js';
import { hash01 } from './ambient-fx.js';

// 爆闪峰值透明度（t=0 时最高，随后快衰减）
export const BOOM_FLASH_MAX = 1;
// 主环透明度峰值（与 boomShockwaveSpec 的 0.8 对齐）
export const BOOM_ALPHA_MAX = 0.8;
// 震动纹理环切段数
export const BOOM_TEXTURE_SEGMENTS = 12;
// 震动幅度系数：外环径向抖动 = size * 该系数 * (1 - 0.7t)，冲击初期最强烈、扩散中渐平滑
export const BOOM_TEXTURE_AMP = 0.08;
// 地面烟尘粒子数范围（由 size 反推，随爆炸规模增大）
export const BOOM_DUST_COUNT_MIN = 6;
export const BOOM_DUST_COUNT_MAX = 18;
// 烟尘粒子半径 / 透明度 / 漂移速度范围
export const BOOM_DUST_SIZE_MIN = 3;
export const BOOM_DUST_SIZE_MAX = 9;
export const BOOM_DUST_ALPHA_MIN = 0.25;
export const BOOM_DUST_ALPHA_MAX = 0.7;
export const BOOM_DUST_SPEED_MIN = 14;
export const BOOM_DUST_SPEED_MAX = 44;

// 确定性 seed：优先取 p.seed，缺省用位置哈希（同 p 恒同值）
function boomSeed(p) {
  return Math.floor(Math.abs(p.seed || 0)) ||
    ((Math.floor(p.x || 0) * 374761393 ^ Math.floor(p.y || 0) * 668265263) >>> 0) || 1;
}

// 地面烟尘粒子 [{x,y,r,alpha,vx,vy}]：
//  - count<=0 或缺 p → 空数组；
//  - 粒子围绕爆点径向铺开（位置由 angle+径向距离哈希导出），初始 alpha ∈ [0.25,0.7]；
//  - vx/vy 为径向漂移 + 弱切向旋涡的速度分量（px/s，仅确定性数据字段，供调用方推进动画）。
export function boomDust(p, seed, count) {
  if (!p || !(count > 0)) return [];
  const x = p.x || 0;
  const y = p.y || 0;
  const size = Math.max(1, p.size || 100);
  const s = Math.floor(Math.abs(seed)) || 1;
  const n = Math.floor(count);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = hash01(s, i, 1, x, y) * Math.PI * 2;
    const rad = size * (0.2 + hash01(s, i, 2, x, y) * 0.55);
    const r = BOOM_DUST_SIZE_MIN + hash01(s, i, 3, x, y) * (BOOM_DUST_SIZE_MAX - BOOM_DUST_SIZE_MIN);
    const alpha = BOOM_DUST_ALPHA_MIN + hash01(s, i, 4, x, y) * (BOOM_DUST_ALPHA_MAX - BOOM_DUST_ALPHA_MIN);
    const sp = BOOM_DUST_SPEED_MIN + hash01(s, i, 5, x, y) * (BOOM_DUST_SPEED_MAX - BOOM_DUST_SPEED_MIN);
    const swDir = hash01(s, i, 6, x, y) < 0.5 ? -1 : 1;
    const vx = Math.cos(a) * sp - Math.sin(a) * sp * 0.35 * swDir;
    const vy = Math.sin(a) * sp + Math.cos(a) * sp * 0.35 * swDir;
    out.push({
      x: x + Math.cos(a) * rad,
      y: y + Math.sin(a) * rad,
      r,
      alpha,
      vx,
      vy
    });
  }
  return out;
}

// 震动纹理环：外环按角度切段，每段叠加径向抖动（wob）与粗细/明暗差异，形成冲击波碎裂感。
// amp 随 t 增大而衰减（冲击初期最剧烈、扩散中渐平滑），全部由 hash01 导出。
function texRing(p, seed, t) {
  const x = p.x || 0;
  const y = p.y || 0;
  const size = Math.max(1, p.size || 100);
  const n = BOOM_TEXTURE_SEGMENTS;
  const amp = size * BOOM_TEXTURE_AMP * (1 - 0.7 * t);
  const segs = [];
  for (let i = 0; i < n; i++) {
    segs.push({
      a0: (i / n) * Math.PI * 2,
      a1: ((i + 1) / n) * Math.PI * 2,
      wob: (hash01(seed, i, 5, x, y) - 0.5) * 2 * amp,
      w: 1 + hash01(seed, i, 6, x, y) * 2.5,
      ga: 0.4 + hash01(seed, i, 7, x, y) * 0.6
    });
  }
  return { amp, count: n, segs };
}

// 增强冲击波描述（纯函数，无 Math.random）：
// 返回 {x, y, flash, outer, inner, alpha, texture, groundDust, t}
//  - t ∈ [0,1]：1 - life/maxLife，0 刚爆 → 1 消散完；
//  - flash：爆闪，t 增大快速衰减；
//  - outer：主环半径（随 t 外扩）；inner：二次衰减环半径（弱于主环）；
//  - alpha：主环透明度（随 t 衰减）；
//  - texture：震动纹理环 {amp, count, segs:[{a0,a1,wob,w,ga}]}；
//  - groundDust：地面烟尘粒子（boomDust 结果按 (1-t) 淡出，t=1 时全隐）。
export function enhancedBoomSpec(p) {
  if (!p) return null;
  const maxLife = Math.max(0.001, p.maxLife || 0.5);
  const life = clamp(p.life ?? 0, 0, maxLife);
  const t = 1 - life / maxLife;
  const seed = boomSeed(p);
  const size = Math.max(1, p.size || 100);
  const x = p.x || 0;
  const y = p.y || 0;
  const outer = size * (0.25 + 0.85 * t);
  const inner = size * (0.18 + 0.5 * t);
  const flash = Math.max(0, BOOM_FLASH_MAX - t * 2.5);
  const alpha = (1 - t) * BOOM_ALPHA_MAX;
  const count = clamp(Math.round(size / 14), BOOM_DUST_COUNT_MIN, BOOM_DUST_COUNT_MAX);
  const groundDust = boomDust(p, seed, count).map((d) => ({ ...d, alpha: d.alpha * (1 - t) }));
  const texture = texRing(p, seed, t);
  return { x, y, flash, outer, inner, alpha, texture, groundDust, t };
}

// 绘制增强冲击波（可用 stub ctx 测试）：爆闪 → 主环 → 二次衰减环 → 震动纹理环 → 地面烟尘。
// 所有颜色与 render.js boom 段一致（暖橙系 rgba 内嵌 alpha，不残留 globalAlpha 状态）。
export function drawEnhancedBoom(ctx, spec) {
  if (!ctx || !spec) return;
  if (spec.alpha <= 0.004 && spec.flash <= 0.004) return;
  const { x, y, flash, outer, inner, alpha, texture, groundDust } = spec;
  const t = spec.t || 0;
  ctx.save();
  ctx.lineCap = 'round';
  // 爆闪：三层同心填充（外光晕 → 中环 → 白热核），t 早期最亮
  if (flash > 0.004) {
    ctx.fillStyle = 'rgba(255,190,90,' + (flash * 0.16) + ')';
    ctx.beginPath();
    ctx.arc(x, y, outer * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,210,130,' + (flash * 0.3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, outer * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,' + (flash * 0.55) + ')';
    ctx.beginPath();
    ctx.arc(x, y, outer * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  // 主环
  if (alpha > 0.004) {
    ctx.strokeStyle = 'rgba(255,160,60,' + alpha + ')';
    ctx.lineWidth = 4 + 8 * (1 - t);
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.stroke();
    // 二次衰减环：内环，弱于主环
    ctx.strokeStyle = 'rgba(255,220,140,' + (alpha * 0.55) + ')';
    ctx.lineWidth = 2 + 4 * (1 - t);
    ctx.beginPath();
    ctx.arc(x, y, inner, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 震动纹理环：外环切段碎裂（径向抖动 + 粗细/明暗差异）
  if (texture && texture.segs && texture.segs.length) {
    ctx.strokeStyle = 'rgba(255,200,120,';
    for (const seg of texture.segs) {
      ctx.lineWidth = seg.w * 2;
      ctx.strokeStyle = 'rgba(255,200,120,' + (alpha * seg.ga * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(x, y, outer + seg.wob, seg.a0, seg.a1);
      ctx.stroke();
    }
  }
  // 地面烟尘：绕爆点卷起的小尘团（alpha 已按 (1-t) 淡出）
  if (groundDust && groundDust.length) {
    for (const d of groundDust) {
      ctx.fillStyle = 'rgba(172,158,126,' + clamp(d.alpha, 0, 1) + ')';
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(0.5, d.r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
