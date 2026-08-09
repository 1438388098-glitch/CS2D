export const FONT = "900 18px 'Segoe UI','Microsoft YaHei',sans-serif";

export function gunLen(w) {
  return w.kind === 'sniper' ? 34 : (w.kind === 'rifle' ? 28 : 22);
}

export function applyDevicePixelRatio(canvas, dpr, cssW, cssH) {
  const safeDpr = Math.max(1, Number(dpr) || 1);
  const safeW = Math.max(1, Math.round(cssW));
  const safeH = Math.max(1, Math.round(cssH));
  canvas.width = Math.round(safeW * safeDpr);
  canvas.height = Math.round(safeH * safeDpr);
  canvas.style.width = safeW + 'px';
  canvas.style.height = safeH + 'px';
  return { dpr: safeDpr, cssW: safeW, cssH: safeH, pixelW: canvas.width, pixelH: canvas.height };
}
