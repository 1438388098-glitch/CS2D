import { VOL_DEFAULTS } from './core.js';

export const AUDIO_PREFS_KEY = 'cs2d_audio';
export const AUDIO_PREFS_VERSION = 2;
export const AUDIO_DEFAULTS = VOL_DEFAULTS;

function clampVolume(v) {
  return Math.max(0, Math.min(1, Number(v)));
}

export function normalizeAudioPrefs(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { v: AUDIO_PREFS_VERSION };
  for (const k of Object.keys(VOL_DEFAULTS)) {
    const n = Number(src[k]);
    out[k] = Number.isFinite(n) ? clampVolume(n) : VOL_DEFAULTS[k];
  }
  // 静音状态持久化（M 键/菜单静音开关跨会话保留）
  out.muted = src.muted === true || src.muted === 1;
  // 击杀音效包（candidate-588）：classic / metal / bit8
  out.pack = ['classic', 'metal', 'bit8'].includes(src.pack) ? src.pack : 'classic';
  // Legacy v1 entries could leave only the sfx bus at zero while ui/amb
  // stayed audible. That made every weapon/world sound disappear, so repair
  // those stale prefs once instead of letting them silently break gameplay.
  if (src.v !== AUDIO_PREFS_VERSION && out.sfx <= 0 && (out.ui > 0 || out.amb > 0)) {
    out.sfx = VOL_DEFAULTS.sfx;
  }
  return out;
}

export function readAudioPrefs(storage) {
  try {
    const raw = storage.getItem(AUDIO_PREFS_KEY);
    if (raw != null) return normalizeAudioPrefs(JSON.parse(raw));
  } catch (err) { /* no storage */ }
  return normalizeAudioPrefs({});
}

export function writeAudioPrefs(prefs, storage) {
  try {
    storage.setItem(AUDIO_PREFS_KEY, JSON.stringify(normalizeAudioPrefs(prefs)));
  } catch (err) { /* no storage */ }
}
