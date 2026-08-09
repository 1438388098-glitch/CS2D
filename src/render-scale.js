import { clamp } from './utils.js';

const DEFAULT_HIGH_MS = 17.5;
const DEFAULT_LOW_MS = 12;
const DEFAULT_STEP = 0.1;
const DEFAULT_LOCK_TICKS = 60;

// Deterministic adaptive render-scale controller. The main loop feeds measured
// frame-time EMA here and applies the returned scale on the next FPS frame.
export function nextRenderScale(current, frameMsEma, opts = {}) {
  const min = Number.isFinite(opts.min) ? opts.min : 0.5;
  const max = Number.isFinite(opts.max) ? opts.max : 1;
  const step = Number.isFinite(opts.step) ? opts.step : DEFAULT_STEP;
  const highMs = Number.isFinite(opts.highMs) ? opts.highMs : DEFAULT_HIGH_MS;
  const lowMs = Number.isFinite(opts.lowMs) ? opts.lowMs : DEFAULT_LOW_MS;
  const lockTicks = Number.isFinite(opts.lockTicks) ? opts.lockTicks : DEFAULT_LOCK_TICKS;
  let scale = clamp(current, min, max);
  let lockT = Number.isFinite(opts.lockT) ? Math.max(0, Math.floor(opts.lockT)) : 0;
  let changed = false;
  if (frameMsEma > highMs && scale > min) {
    scale = Math.max(min, scale - step);
    lockT = lockTicks;
    changed = true;
  } else if (frameMsEma < lowMs && scale < max) {
    if (lockT > 0) {
      lockT--;
    } else {
      scale = Math.min(max, scale + step);
      lockT = Math.max(10, Math.floor(lockTicks / 2));
      changed = true;
    }
  } else if (lockT > 0) {
    lockT--;
  }
  scale = Math.round(scale * 100) / 100;
  return { scale, lockT, changed };
}
