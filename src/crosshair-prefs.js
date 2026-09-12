// 准星个性化偏好（颜色/长度/间隙/粗细/中点）：localStorage 持久化，全部数值夹取防坏档。
// 纯偏好模块：不依赖 canvas/DOM（localStorage 访问全部守卫），可在 node 测试中直接驱动。

export const CROSSHAIR_DEFAULTS = { color: '#ffffff', len: 7, gap: 6, thickness: 1.5, dot: true };
export const CROSSHAIR_COLORS = ['#ffffff', '#00ffea', '#7cff4d', '#ffe14d', '#ff9a3d', '#ff4d4d', '#ff7ce8', '#9db4ff'];

const KEY = 'cs2d_crosshair';
let prefs = null;

function clampN(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function validColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null;
}

function load() {
  if (prefs) return prefs;
  prefs = { ...CROSSHAIR_DEFAULTS };
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === 'object') {
          const c = validColor(j.color);
          if (c) prefs.color = c;
          prefs.len = clampN(j.len, 2, 16, prefs.len);
          prefs.gap = clampN(j.gap, 0, 14, prefs.gap);
          prefs.thickness = clampN(j.thickness, 1, 3.5, prefs.thickness);
          if (typeof j.dot === 'boolean') prefs.dot = j.dot;
        }
      }
    }
  } catch (e) { /* 坏档用默认 */ }
  return prefs;
}

// 当前准星样式快照（防御性拷贝，调用方可自由改写）
export function crosshairStyle() {
  return { ...load() };
}

// hex → rgba(css)：供描边色直接使用
export function crosshairColorCss(alpha = 0.85) {
  const c = load().color;
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// 合并写入（未提供的键保持原值；非法值夹取/忽略），并持久化
export function setCrosshairPrefs(partial) {
  const p = load();
  if (!partial || typeof partial !== 'object') return { ...p };
  const c = validColor(partial.color);
  if (c) p.color = c;
  if ('len' in partial) p.len = clampN(partial.len, 2, 16, p.len);
  if ('gap' in partial) p.gap = clampN(partial.gap, 0, 14, p.gap);
  if ('thickness' in partial) p.thickness = clampN(partial.thickness, 1, 3.5, p.thickness);
  if (typeof partial.dot === 'boolean') p.dot = partial.dot;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 无存储 */ }
  return { ...p };
}

export function resetCrosshairPrefs() {
  prefs = { ...CROSSHAIR_DEFAULTS };
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* 无存储 */ }
  return { ...prefs };
}

// 测试专用：丢弃内存缓存（下次 crosshairStyle 重新从存储加载）
export function __resetCrosshairPrefsForTest() { prefs = null; }
