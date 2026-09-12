// 高光时刻粒子：爆头金色迸发 + 爆炸余烬（渲染表现模块，不影响判定）。
// 金色迸发：gspark 条纹（加色渲染，命中瞬间从命中点沿受击方向喷出）。
// 余烬：ember 缓慢上升 + 相位闪烁，爆炸后停留 ~2s 逐渐熄灭。
// 随机走 utils.rand（与战斗反馈一致的种子口径）。
// spawn 粒子生成函数由调用方注入（combat/bomb 已持有 game.js 的 spawnParticle），
// 本模块不反向 import game.js，避免新增循环依赖（见 scripts/check-cycles.mjs）。

import { rand } from './utils.js';

// 爆头金色迸发：head=false 时不生成（调用方仅在爆头时调用，留参数位便于扩展）
export function spawnGoldBurst(game, spawn, x, y, ang, head = true) {
  if (!game || typeof spawn !== 'function' || !head) return 0;
  const n = 8;
  for (let i = 0; i < n; i++) {
    spawn(game, {
      kind: 'gspark',
      x, y,
      vx: Math.cos(ang + rand(-0.9, 0.9)) * rand(120, 320),
      vy: Math.sin(ang + rand(-0.9, 0.9)) * rand(120, 320),
      life: rand(0.25, 0.5),
      size: rand(1, 2)
    });
  }
  return n;
}

// 爆炸余烬：n 颗从爆心附近缓慢上升的火星
export function spawnEmbers(game, spawn, x, y, n = 10, spread = 40) {
  if (!game || typeof spawn !== 'function') return 0;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    spawn(game, {
      kind: 'ember',
      x: x + Math.cos(a) * rand(0, spread),
      y: y + Math.sin(a) * rand(0, spread),
      vx: rand(-14, 14),
      vy: rand(-70, -30),
      life: rand(1.2, 2.2),
      maxLife: 2.2,
      size: rand(1.4, 2.6),
      phase: rand(0, 6.283)
    });
  }
  return n;
}

// 余烬绘制规格（纯函数，供测试断言）：随寿命衰减 + 相位闪烁，颜色由橙黄渐入暗红
export function emberSpec(p) {
  const maxLife = p.maxLife || 2.2;
  const t = 1 - Math.min(Math.max(p.life || 0, 0), maxLife) / maxLife; // 0 新生 → 1 熄灭
  const flicker = 0.6 + 0.4 * Math.sin((p.phase || 0) + p.life * 18);
  const r = Number.isFinite(p.size) ? p.size : 2;
  return {
    r,
    alpha: Math.min(1, (1 - t) * flicker),
    color: t < 0.5 ? 'rgba(255,170,70,' : 'rgba(220,90,40,'
  };
}

// 金色条纹规格（纯函数，供测试断言）：与 spark 同构的条纹方向参数，金色系
export function goldStreakSpec(p) {
  const vx = p.vx || 0, vy = p.vy || 0;
  const speed = Math.hypot(vx, vy);
  const len = Math.min(Math.max(speed * 0.03, 3), 12);
  const inv = speed > 0.001 ? 1 / speed : 0;
  return { len, ux: speed > 0.001 ? vx * inv : 1, uy: speed > 0.001 ? vy * inv : 0 };
}
