// 2D 烟雾消散尾迹（candidate-305）：烟雾生命末期（life<SMOKE_DISSOLVE_LIFE）边缘飘散的小烟团尾迹。
// 取代"整团突然淡出"：边缘小烟团逐个剥落、径向漂移 + 切向微旋，形成消散层次感。
// 纯逻辑确定性：粒子剥落相位/角度/剥落半径/漂移量/尺寸均由 smoke.x/y/r + seed 的确定性哈希导出
// （无 Math.random），当前几何与透明度是消散进度 t∈[0,1] 的纯函数 → 同 (smoke, t, seed, count) 完全可复现。
// t 由调用方从 smoke.life 折算：t = clamp((SMOKE_DISSOLVE_LIFE - life) / SMOKE_DISSOLVE_LIFE, 0, 1)。
// 纯装饰层，不影响碰撞 / LOS / 烟雾遮挡判定（fog.js / combat.js 逻辑不变）。

import { clamp } from './utils.js';
import { hash01 } from './ambient-fx.js';

// 秒：进入消散期的生命阈值，与 drawSmokes 的淡出 `clamp(s.life / 2, 0, 1)` 对齐
export const SMOKE_DISSOLVE_LIFE = 2;
// 剥落起始半径范围：外缘 75%~100% 处（贴近烟雾柔边，向外飘散）
export const SMOKE_TRAIL_RADIUS_LO = 0.75;
export const SMOKE_TRAIL_RADIUS_HI = 1.0;
// px：径向漂移总量（整个消散期），漂移速度 = 总量 / SMOKE_DISSOLVE_LIFE
export const SMOKE_TRAIL_DRIFT_MIN = 24;
export const SMOKE_TRAIL_DRIFT_MAX = 80;
// rad：切向微旋总量（对称左右，弱于径向漂移）
export const SMOKE_TRAIL_SWIRL_MIN = 0.05;
export const SMOKE_TRAIL_SWIRL_MAX = 0.25;
// 尾迹粒子半径范围（px），随局部进度轻微膨胀
export const SMOKE_TRAIL_SIZE_MIN = 3;
export const SMOKE_TRAIL_SIZE_MAX = 10;
// 单个粒子透明度峰值范围
export const SMOKE_TRAIL_ALPHA_MIN = 0.35;
export const SMOKE_TRAIL_ALPHA_MAX = 0.7;

// 返回尾迹粒子 [{x,y,r,alpha,vx,vy}]：
//  - t<=0（未进入消散期）或 t>=1（已散尽）或 count<=0 → 空数组；
//  - 粒子在剥落相位 peel∈[0,0.75] 依次被"撕下"，未剥落的粒子不输出（保持稀疏度）；
//  - 位置沿剥落角径向向外漂移 + 切向微旋；alpha 按局部进度正弦包络淡入→峰值→淡出；
//  - vx/vy 为该粒子在消散期的近似漂移速度（px/s，径向 + 切向分量），仅作确定性数据字段。
export function smokeDissolveTrail(smoke, t, seed, count) {
  if (!smoke || !(count > 0) || !(t > 0) || t >= 1) return [];
  const x = smoke.x;
  const y = smoke.y;
  const r = Math.max(1, smoke.r || 60);
  const s = Math.floor(Math.abs(seed)) || 1;
  const n = Math.floor(count);
  const out = [];
  for (let i = 0; i < n; i++) {
    const ang = hash01(s, i, 1, x, y, r) * Math.PI * 2;
    const radFrac = SMOKE_TRAIL_RADIUS_LO + hash01(s, i, 2, x, y, r) * (SMOKE_TRAIL_RADIUS_HI - SMOKE_TRAIL_RADIUS_LO);
    const peel = hash01(s, i, 3, x, y, r) * 0.75;
    const drift = SMOKE_TRAIL_DRIFT_MIN + hash01(s, i, 4, x, y, r) * (SMOKE_TRAIL_DRIFT_MAX - SMOKE_TRAIL_DRIFT_MIN);
    const swAmp = SMOKE_TRAIL_SWIRL_MIN + hash01(s, i, 5, x, y, r) * (SMOKE_TRAIL_SWIRL_MAX - SMOKE_TRAIL_SWIRL_MIN);
    const swDir = hash01(s, i, 6, x, y, r) < 0.5 ? -1 : 1;
    const size = SMOKE_TRAIL_SIZE_MIN + hash01(s, i, 7, x, y, r) * (SMOKE_TRAIL_SIZE_MAX - SMOKE_TRAIL_SIZE_MIN);
    const aMax = SMOKE_TRAIL_ALPHA_MIN + hash01(s, i, 8, x, y, r) * (SMOKE_TRAIL_ALPHA_MAX - SMOKE_TRAIL_ALPHA_MIN);
    const local = t >= peel ? (t - peel) / (1 - peel) : 0;
    if (local <= 0) continue;
    const l = clamp(local, 0, 1);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const sw = swDir * l * swAmp;
    const radial = r * radFrac + l * drift;
    const px = x + Math.cos(ang + sw) * radial;
    const py = y + Math.sin(ang + sw) * radial;
    const pr = size * (0.85 + 0.3 * l);
    const alpha = aMax * Math.sin(Math.PI * l);
    const vr = drift / SMOKE_DISSOLVE_LIFE;
    const vt = swDir * (swAmp * radial) / SMOKE_DISSOLVE_LIFE;
    const vx = ca * vr - sa * vt;
    const vy = sa * vr + ca * vt;
    out.push({ x: px, y: py, r: pr, alpha, vx, vy });
  }
  return out;
}

// 绘制尾迹粒子：读取 pts[i].alpha（[0,1]）逐粒子画实心圆，保持 2D 俯视烟雾灰阶配色，
// 与 drawSmokes 边缘噪点同风格（fillStyle 内嵌 alpha，不残留 globalAlpha 状态）。
export function drawSmokeTrail(ctx, pts) {
  if (!ctx || !pts || !pts.length) return;
  ctx.save();
  for (const p of pts) {
    ctx.fillStyle = 'rgba(196,199,204,' + clamp(p.alpha, 0, 1) + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
