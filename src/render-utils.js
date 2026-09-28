
export function gunLen(w) {
  return w.kind === 'sniper' ? 34 : (w.kind === 'rifle' ? 28 : 22);
}

// 特效生命周期常量（combat 与 render 共用；放叶子模块避免 combat->render 循环依赖）
export const DEATH_MARKER_LIFE = 1.8;
export const TRACER_LIFE = 0.16;
