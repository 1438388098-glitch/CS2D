export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function angNorm(a) {
  a %= Math.PI * 2;
  if (a < 0) a += Math.PI * 2;
  return a;
}
export function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 玩家屏幕最远可视距离（半对角）：bot 感知不得超过此值，保证与玩家视野公平
export function viewCap(game) {
  const w = game.canvasW || 1280, h = game.canvasH || 720;
  return Math.hypot(w, h) / 2;
}
