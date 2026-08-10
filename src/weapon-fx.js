// 2D 武器反馈特效：开火枪口烟（muzzleSmoke）+ 切枪缩放弹出（weaponSwitchPop）。
// 纯逻辑确定性：粒子数量 / 偏移 / 半径 / 透明度均由固定 seed 的确定性哈希导出，
// 不依赖 Math.random —— 同 (hasFired, t, seed) 画面完全可复现。
// 烟粒子坐标为枪口局部空间偏移（x 沿枪口前向、y 垂直散布），由绘制函数摆放。

import { clamp } from './utils.js';
import { hash01 } from './ambient-fx.js';

export const MUZZLE_SMOKE_LIFE = 0.38;   // 秒：烟从出现到消散
export const MUZZLE_SMOKE_COUNT = 5;     // 每枪粒子数
export const SWITCH_POP_DURATION = 0.28; // 秒：切枪弹出时长
export const SWITCH_POP_PEAK = 1.16;     // 峰值缩放（轻微放大）
export const MUZZLE_FLASH_DUR = 0.06;    // 秒：枪口闪光剩余时间满值窗口

// 枪口闪光层次参数：返回 {alpha, coreR, glowR, burstR, rays, rot}。
// muzzleT 为实体剩余枪口闪光时间（秒），seed 固定后画面可复现。
export function muzzleFlashSpec(muzzleT, seed) {
  if (!(Number.isFinite(muzzleT) && muzzleT > 0)) return null;
  const s = Math.floor(Math.abs(seed)) || 1;
  const alpha = clamp(muzzleT / MUZZLE_FLASH_DUR, 0, 1);
  const coreR = 2 + hash01(s, 1, 9) * 3;
  const glowR = coreR + 6 + hash01(s, 2, 9) * 5;
  const burstR = glowR + 9 + hash01(s, 3, 9) * 8;
  return {
    alpha,
    coreR,
    glowR,
    burstR,
    rays: 6 + Math.floor(hash01(s, 4, 9) * 5),
    rot: hash01(s, 5, 9) * Math.PI * 2
  };
}

// 枪口烟：hasFired=false 或 t 超出生命周期 → 空数组。
// 粒子沿枪口前向漂移、随 t 膨胀并线性消散（确定性，同 t+seed 恒复现）。
export function muzzleSmoke(hasFired, t, seed) {
  if (!hasFired || !(t >= 0) || t >= MUZZLE_SMOKE_LIFE) return [];
  const s = Math.floor(Math.abs(seed)) || 1;
  const age = t / MUZZLE_SMOKE_LIFE;
  const out = [];
  for (let i = 0; i < MUZZLE_SMOKE_COUNT; i++) {
    const u = hash01(s, i, 1);
    const v = hash01(s, i, 2);
    const w = hash01(s, i, 3);
    const a = hash01(s, i, 4);
    const x = 8 + (3 + u * 15) * age + (v - 0.5) * 3;
    const y = (v - 0.5) * 9;
    const r = 2 + w * 2.4 + age * 4.5;
    const alpha = (1 - age) * (0.18 + a * 0.26);
    out.push({ x, y, r, alpha });
  }
  return out;
}

// 切枪缩放：t∈(0,DURATION) 期间轻微放大（正弦包络快速弹起）再回稳，
// 其余时刻恒为 {scale:1}；t=DURATION/2 处精确达 PEAK。
export function weaponSwitchPop(t) {
  if (!(t > 0) || t >= SWITCH_POP_DURATION) return { scale: 1 };
  const u = t / SWITCH_POP_DURATION;
  const bump = Math.pow(Math.sin(u * Math.PI), 0.65);
  return { scale: 1 + (SWITCH_POP_PEAK - 1) * bump };
}

// 绘制枪口烟：在 (x,y) 处按朝向 ang（当前变换下）摆放 smokePts 局部偏移粒子。
export function drawMuzzleSmoke(ctx, x, y, ang, smokePts) {
  if (!ctx || !smokePts || !smokePts.length) return;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  ctx.save();
  for (const p of smokePts) {
    ctx.fillStyle = 'rgba(152,157,162,' + clamp(p.alpha, 0, 1) + ')';
    ctx.beginPath();
    ctx.arc(x + p.x * c - p.y * s, y + p.x * s + p.y * c, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 绘制枪身（含后坐偏移 / 狙击瞄杆 / 枪口闪光），绕握把 pivot 施加 pop 缩放。
// 保持 2D 俯视风格，视觉与 drawEntities 原枪身一致，仅新增切枪缩放通道。
export function drawWeaponPop(ctx, opts) {
  if (!ctx || !opts) return;
  const s = typeof opts.scale === 'number' && opts.scale > 0 ? opts.scale : 1;
  const gl = opts.gl || 0;
  const recoilOff = opts.recoilOff || 0;
  const seed = opts.seed || (((Math.floor(gl) * 31) ^ Math.round((opts.muzzleT || 0) * 1000)) >>> 0) || 1;
  ctx.save();
  ctx.translate(2, 0);
  ctx.scale(s, s);
  ctx.translate(-2, 0);
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(4 - recoilOff, -3, gl, 6);
  ctx.fillStyle = '#0c0e11';
  ctx.fillRect(4 - recoilOff, -2, gl, 2);
  if (opts.kind === 'sniper') {
    ctx.strokeStyle = '#33383f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14 - recoilOff, -5);
    ctx.lineTo(14 - recoilOff, 5);
    ctx.stroke();
  }
  if (opts.muzzleT > 0) {
    const mz = gl - recoilOff;
    const fspec = muzzleFlashSpec(opts.muzzleT, seed);
    if (fspec) {
      ctx.save();
      ctx.globalAlpha = fspec.alpha * 0.22;
      ctx.fillStyle = '#ffb84d';
      ctx.beginPath();
      ctx.arc(mz, 0, fspec.glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fspec.alpha * 0.85;
      ctx.fillStyle = '#ffd75e';
      ctx.translate(mz, 0);
      ctx.rotate(fspec.rot);
      ctx.beginPath();
      for (let i = 0; i < fspec.rays; i++) {
        const a = i / fspec.rays * Math.PI * 2;
        const r = i % 2 === 0 ? fspec.burstR : fspec.burstR * 0.5;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(mz, -5);
    ctx.lineTo(mz + 16, -1);
    ctx.lineTo(mz, 3);
    ctx.fill();
    ctx.fillStyle = '#fff3c0';
    ctx.beginPath();
    ctx.arc(mz, 0, fspec ? fspec.coreR : 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
