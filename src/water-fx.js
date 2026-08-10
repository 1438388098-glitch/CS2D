import { clamp } from './utils.js';

// 2D 水面涟漪与倒影特效（candidate-306，渲染表现模块）。
// 通用"涟漪环"系统：任何实体落点（子弹入水/手雷落水/脚步踏水）在命中处产生
// 随时间半径增大、透明度衰减的扩散圆环，叠加在浅水微光之上。
// 核心为确定性纯函数：rippleRing / rippleAt 仅依赖位置与流逝时间 t（秒），
// 不使用 Math.random，同输入序列必然产生同输出，保证固定 seed 重放画面可复现。

export const RIPPLE_LIFE = 1.0; // 涟漪环总时长（秒）
export const RIPPLE_R0 = 4; // 起始半径（px）
export const RIPPLE_SPEED = 62; // 扩散速度（px/s）
export const RIPPLE_MAX_R = 72; // 半径上限（px）
export const RIPPLE_MAX_ACTIVE = 24; // 同屏最大涟漪环数（轻量防护）

// 相位辅助：t0 为触发时刻（秒，通常取 game.time），t 为当前时刻，
// 返回归一化相位 u∈[0,1]（0 刚触发 → 1 已结束）。t ≤ t0 视为 0，≥ t0+RIPPLE_LIFE 视为 1。
export function rippleAt(t0, t) {
  const start = Number.isFinite(t0) ? t0 : 0;
  const now = Number.isFinite(t) ? t : start;
  const elapsed = now - start;
  if (elapsed <= 0) return 0;
  if (elapsed >= RIPPLE_LIFE) return 1;
  return elapsed / RIPPLE_LIFE;
}

// 涟漪环纯计算：t 为触发后流逝秒数，r0 为起始半径（缺省 RIPPLE_R0）。
// 返回 {x,y,alpha,r,width}：半径随时间增大并封顶，透明度平方衰减，线宽由粗变细。
// 非有限/负数 t 统一钳制到合法区间，保证绘制与测试稳定。
export function rippleRing(x, y, t, r0) {
  const el = Number.isFinite(t) ? clamp(t, 0, RIPPLE_LIFE) : RIPPLE_LIFE;
  const start = Number.isFinite(r0) && r0 >= 0 ? r0 : RIPPLE_R0;
  const u = el / RIPPLE_LIFE;
  const ease = 1 - u;
  return {
    x,
    y,
    alpha: ease * ease,
    r: Math.min(start + RIPPLE_SPEED * el, RIPPLE_MAX_R),
    width: 1.2 + 3.4 * ease
  };
}

// 涟漪环对象工厂：{x,y,t0,r0}，t0 为触发时刻（game.time，确定性）。
export function makeRipple(x, y, t0, r0) {
  return {
    x,
    y,
    t0: Number.isFinite(t0) ? t0 : 0,
    r0: Number.isFinite(r0) && r0 >= 0 ? r0 : RIPPLE_R0
  };
}

// 触发辅助：向 game.ripples push 一个涟漪环（触发点统一入口）。
// 无数组时惰性初始化（兼容旧存档/测试直造对象），超 RIPPLE_MAX_ACTIVE 时丢弃最旧由 prune 处理。
export function addRipple(game, x, y, r0) {
  if (!game) return null;
  if (!Array.isArray(game.ripples)) game.ripples = [];
  if (game.ripples.length >= RIPPLE_MAX_ACTIVE) {
    game.ripples.shift();
  }
  const rp = makeRipple(x, y, game.time || 0, r0);
  game.ripples.push(rp);
  return rp;
}

// 过期剪枝：game.time 超过 RIPPLE_LIFE 的环移除，返回剩余数量。
export function pruneRipples(game) {
  if (!game || !Array.isArray(game.ripples)) return 0;
  const now = game.time || 0;
  for (let i = game.ripples.length - 1; i >= 0; i--) {
    if (now - (game.ripples[i].t0 || 0) >= RIPPLE_LIFE) game.ripples.splice(i, 1);
  }
  return game.ripples.length;
}

// 绘制：双层圆环（外圈柔光 + 内圈亮线），叠加在浅水微光之上形成涟漪倒影感。
// fx 为 rippleRing 返回值；alpha ≤ 0 或半径过小直接跳过。
export function drawRipple(ctx, fx) {
  if (!ctx || !fx) return;
  const a = clamp(Number.isFinite(fx.alpha) ? fx.alpha : 0, 0, 1);
  const r = Number.isFinite(fx.r) ? fx.r : 0;
  if (!(a > 0.003) || !(r > 0.5)) return;
  const w = Number.isFinite(fx.width) ? Math.max(1, fx.width) : 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(150,200,245,' + (a * 0.2).toFixed(3) + ')';
  ctx.lineWidth = w + 4;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,246,255,' + (a * 0.85).toFixed(3) + ')';
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
