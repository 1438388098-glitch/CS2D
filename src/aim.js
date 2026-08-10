// Pure 2D aim helpers, kept separate so input/game changes stay isolated.
export function aimSensitivityCurve(n, power = 0.65) {
  const t = Math.min(1, Math.max(0, n));
  return Math.pow(t, power);
}
