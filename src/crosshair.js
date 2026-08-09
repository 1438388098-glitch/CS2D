// Pure crosshair geometry helpers shared by HUD rendering and tests.
const DEFAULT_FOV = Math.PI / 2;

export function crosshairSpreadPx(canvasWidth, fovRad, spreadDeg, recoilDeg = 0) {
  const w = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1280;
  const fov = Number.isFinite(fovRad) && fovRad > 0.3 && fovRad < Math.PI ? fovRad : DEFAULT_FOV;
  const focal = (w / 2) / Math.tan(fov / 2);
  return Math.tan(((spreadDeg || 0) + (recoilDeg || 0)) * Math.PI / 180) * focal;
}

export function shouldDrawFpsSpreadCrosshair(wd, p) {
  if (!p || p.dead) return false;
  if (p.scoped && wd && wd.kind === 'sniper') return false;
  return true;
}
