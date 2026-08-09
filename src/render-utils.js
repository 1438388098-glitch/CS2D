export const FONT = "900 18px 'Segoe UI','Microsoft YaHei',sans-serif";

export function gunLen(w) {
  return w.kind === 'sniper' ? 34 : (w.kind === 'rifle' ? 28 : 22);
}
