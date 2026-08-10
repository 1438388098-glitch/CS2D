// Pure crosshair geometry helpers shared by HUD rendering and tests.
const DEFAULT_FOV = Math.PI / 2;

export const HIT_FEEDBACK_DUR = 0.3;
export const MISS_FEEDBACK_DUR = 0.14;

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export function crosshairSpreadPx(canvasWidth, fovRad, spreadDeg, recoilDeg = 0) {
  const w = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1280;
  const fov = Number.isFinite(fovRad) && fovRad > 0.3 && fovRad < Math.PI ? fovRad : DEFAULT_FOV;
  const focal = (w / 2) / Math.tan(fov / 2);
  return Math.tan(((spreadDeg || 0) + (recoilDeg || 0)) * Math.PI / 180) * focal;
}

// 准星命中/开火反馈（纯逻辑，确定性，无随机）：
// hit=true  命中敌人 → 准星显著扩散 + 颜色变橙/红（recoil 越高压得越明显）
// hit=false 开火未命中 → 轻微扩散但颜色不变（color 为 null，渲染沿用原色）
// t 为事件剩余时间（秒）：t<=0 视为反馈已结束返回 null；t 越大强度越高。
export function crosshairHitFeedback(hit, t, recoil = 0) {
  const dur = hit ? HIT_FEEDBACK_DUR : MISS_FEEDBACK_DUR;
  if (!Number.isFinite(t) || t <= 0 || t > dur) return null;
  const p = clamp(t / dur, 0, 1);
  const recoilScale = hit ? clamp((recoil || 0) / 2.4, 0, 1) * 0.25 : 0;
  const maxMul = hit ? 1.9 + recoilScale : 1.35;
  const spreadMul = 1 + (maxMul - 1) * p;
  let color = null;
  if (hit) color = p > 0.45 ? 'rgba(255,122,69,0.95)' : 'rgba(255,59,48,0.95)';
  return { spreadMul, color, t };
}

export function shouldDrawFpsSpreadCrosshair(wd, p) {
  if (!p || p.dead) return false;
  if (p.scoped && wd && wd.kind === 'sniper') return false;
  return true;
}
