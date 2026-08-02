// 按键映射（可重绑定）：action → 键码数组（数组支持多键，如蹲伏默认 Ctrl/C 双键）
// 持久化到 localStorage，默认值不可被覆盖删除（reset 恢复）
const STORE_KEY = 'cs2d_keymap';
const SENS_KEY = 'cs2d_sens';

export const ACTIONS = {
  moveUp: '前进', moveDown: '后退', moveLeft: '左移', moveRight: '右移',
  walk: '静步', crouch: '蹲伏', interact: '互动（装/拆/拾取）',
  reload: '换弹', buy: '购买菜单', scoreboard: '记分板', pause: '暂停',
  weaponPrimary: '主武器', weaponSecondary: '手枪', weaponKnife: '战术刀',
  nadeHe: '手雷（快速投掷）', nadeFlash: '闪光（快速投掷）', nadeSmoke: '烟雾（快速投掷）',
  lastWeapon: '切回上一武器', mute: '静音'
};

const DEFAULTS = {
  moveUp: ['KeyW'], moveDown: ['KeyS'], moveLeft: ['KeyA'], moveRight: ['KeyD'],
  walk: ['ShiftLeft'], crouch: ['ControlLeft', 'KeyC'], interact: ['KeyE'],
  reload: ['KeyR'], buy: ['KeyB'], scoreboard: ['Tab'], pause: ['Escape'],
  weaponPrimary: ['Digit1'], weaponSecondary: ['Digit2'], weaponKnife: ['Digit3'],
  nadeHe: ['Digit4'], nadeFlash: ['Digit5'], nadeSmoke: ['Digit6'],
  lastWeapon: ['KeyQ'], mute: ['KeyM']
};

let map = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      map = { ...DEFAULTS, ...saved };
      return;
    }
  } catch (err) { /* 无存储环境 */ }
  map = { ...DEFAULTS };
}

export function matches(code, action) {
  const l = map[action];
  return !!l && l.includes(code);
}

export function pressed(keys, action) {
  const l = map[action];
  if (!l) return false;
  for (const c of l) if (keys[c]) return true;
  return false;
}

export function getBindLabel(action) {
  const l = map[action];
  if (!l || !l.length) return '—';
  return l.map((c) => c.replace('Digit', '') .replace('Key', '')).join(' / ');
}

export function getBindCodes(action) {
  return (map[action] || []).slice();
}

export function bind(action, code) {
  map[action] = [code];
  persist();
}

export function resetBinds() {
  map = { ...DEFAULTS };
  persist();
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch (err) { /* 忽略 */ }
}

export function getSensitivity() {
  try {
    const v = parseFloat(localStorage.getItem(SENS_KEY));
    if (Number.isFinite(v)) return v;
  } catch (err) { /* 忽略 */ }
  return 1;
}

export function setSensitivity(v) {
  try { localStorage.setItem(SENS_KEY, String(v)); } catch (err) { /* 忽略 */ }
}

load();
