// 武器涂装+熟练度（candidate-586）：击杀累计熟练度解锁涂装；涂装改变枪身/弹道颜色。
// 全局此前无任何皮肤代码——涂装只改渲染色，不影响任何判定。
import { ctx } from './ctx.js';

const KEY = 'cs2d_skins_v1';
const MKEY = 'cs2d_mastery_v1';

export const PAINTS = [
  { id: 'default', name: '制式', tint: null, need: 0 },
  { id: 'neon', name: '霓虹', tint: '#00ffea', need: 10 },
  { id: 'ember', name: '余烬', tint: '#ff7a2a', need: 25 },
  { id: 'violet', name: '夜紫', tint: '#c39dff', need: 50 },
  { id: 'gold', name: '鎏金', tint: '#ffd34d', need: 100 }
];

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}

function loadJson(key, dflt) {
  const s = store();
  if (!s) return dflt;
  try {
    const raw = s.getItem(key);
    if (raw) return Object.assign({}, dflt, JSON.parse(raw));
  } catch (e) { /* 坏档 */ }
  return dflt;
}

// 每武器击杀数（熟练度）
export function mastery() { return loadJson(MKEY, {}); }

export function addMastery(weapon) {
  if (!weapon) return;
  const m = mastery();
  m[weapon] = (m[weapon] || 0) + 1;
  const s = store();
  if (s) { try { s.setItem(MKEY, JSON.stringify(m)); } catch (e) { /* 忽略 */ } }
  return m[weapon];
}

export function loadSkins() { return loadJson(KEY, { equipped: 'default' }); }

export function equippedPaint(weapon) {
  const all = loadSkins();
  const id = (all.equipped && all.equipped[weapon]) || all.equipped || 'default';
  const paint = PAINTS.find((p) => p.id === id) || PAINTS[0];
  // 未解锁回退制式
  const need = paint.need;
  if (need > 0 && (mastery()[weapon] || 0) < need) return PAINTS[0];
  return paint;
}

export function equipPaint(weapon, id) {
  const paint = PAINTS.find((p) => p.id === id);
  if (!paint) return false;
  if (paint.need > 0 && (mastery()[weapon] || 0) < paint.need) return false;
  const s = store();
  const all = loadSkins();
  if (!all.equipped || typeof all.equipped === 'string') all.equipped = {};
  all.equipped[weapon] = id;
  if (s) { try { s.setItem(KEY, JSON.stringify(all)); } catch (e) { /* 忽略 */ } }
  return true;
}

// 解锁播报：总熟练度恰好达到门槛（after = 本次击杀后的总熟练度）
export function unlockNotice(weapon, after) {
  const total = after !== undefined ? after : totalMastery();
  const just = PAINTS.find((p) => p.need === total && p.need > 0);
  return just ? '🎨 总熟练度 ' + total + '：解锁涂装「' + just.name + '」（设置-涂装）' : null;
}

// —— 全局涂装模型：总击杀熟练度解锁，作用于本人全部弹道颜色 ——
export function totalMastery() {
  const m = mastery();
  let sum = 0;
  for (const k in m) sum += m[k];
  return sum;
}

export function equippedGlobalPaint() {
  const all = loadSkins();
  const id = typeof all.equipped === 'string' ? all.equipped : (all.equipped && all.equipped['*']) || 'default';
  const paint = PAINTS.find((p) => p.id === id) || PAINTS[0];
  if (paint.need > 0 && totalMastery() < paint.need) return PAINTS[0];
  return paint;
}

export function equipGlobalPaint(id) {
  const paint = PAINTS.find((p) => p.id === id);
  if (!paint) return false;
  if (paint.need > 0 && totalMastery() < paint.need) return false;
  const s = store();
  const all = loadSkins();
  all.equipped = id;
  if (s) { try { s.setItem(KEY, JSON.stringify(all)); } catch (e) { /* 忽略 */ } }
  return true;
}

export function paintLocked(id) {
  const paint = PAINTS.find((p) => p.id === id);
  return !paint || (paint.need > 0 && totalMastery() < paint.need);
}
