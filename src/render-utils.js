
export function gunLen(w) {
  return w.kind === 'sniper' ? 34 : (w.kind === 'rifle' ? 28 : 22);
}
