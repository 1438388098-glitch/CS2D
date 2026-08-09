// 按键映射（可重绑定）：action → 键码数组（数组支持多键，如蹲伏默认 Ctrl/C 双键）
// 持久化到 localStorage，默认值不可被覆盖删除（reset 恢复）
const STORE_KEY = 'cs2d_keymap';

export const ACTIONS = {
  moveUp: '前进', moveDown: '后退', moveLeft: '左移', moveRight: '右移',
  walk: '静步', crouch: '蹲伏', interact: '互动（装/拆/拾取）',
  reload: '换弹', buy: '购买菜单', scoreboard: '记分板', pause: '暂停',
  weaponPrimary: '主武器', weaponSecondary: '手枪', weaponKnife: '战术刀',
  nadeHe: '手雷（快速投掷）', nadeFlash: '闪光（快速投掷）', nadeSmoke: '烟雾（快速投掷）',
  lastWeapon: '切回上一武器', viewToggle: '切换视角', turnLeft: '左转', turnRight: '右转', mute: '静音', help: '帮助',
  spectateNext: '观战下一个', spectatePrev: '观战上一个',
  orderFollow: '指令：集合', orderSiteA: '指令：攻A', orderSiteB: '指令：攻B', orderHold: '指令：守点',
  buyCat1: '购买分类1', buyCat2: '购买分类2', buyCat3: '购买分类3', buyCat4: '购买分类4',
  buyCat5: '购买分类5', buyCat6: '购买分类6', buyCat7: '购买分类7'
};

const DEFAULTS = {
  moveUp: ['KeyW'], moveDown: ['KeyS'], moveLeft: ['KeyA'], moveRight: ['KeyD'],
  walk: ['ShiftLeft'], crouch: ['ControlLeft', 'KeyC'], interact: ['KeyE'],
  reload: ['KeyR'], buy: ['KeyB'], scoreboard: ['Tab'], pause: ['Escape'],
  weaponPrimary: ['Digit1'], weaponSecondary: ['Digit2'], weaponKnife: ['Digit3'],
  nadeHe: ['Digit4'], nadeFlash: ['Digit5'], nadeSmoke: ['Digit6'],
  lastWeapon: ['KeyQ'], viewToggle: ['KeyV'], turnLeft: ['ArrowLeft'], turnRight: ['ArrowRight'], mute: ['KeyM'], help: ['KeyH'],
  spectateNext: ['KeyE'], spectatePrev: ['KeyQ'],
  orderFollow: ['F1'], orderSiteA: ['F2'], orderSiteB: ['F3'], orderHold: ['F4'],
  buyCat1: ['Digit1'], buyCat2: ['Digit2'], buyCat3: ['Digit3'], buyCat4: ['Digit4'],
  buyCat5: ['Digit5'], buyCat6: ['Digit6'], buyCat7: ['Digit7']
};

let map = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      map = { ...DEFAULTS };
      for (const a of Object.keys(DEFAULTS)) {
        const v = saved[a];
        if (Array.isArray(v) && v.length && v.every((c) => typeof c === 'string' && c.length)) map[a] = v;
      }
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
  // 冲突确定性处理：拒绝把键绑给已在用的动作（避免一个键同时触发两个操作）
  for (const a of Object.keys(map)) {
    if (a !== action && map[a] && map[a].includes(code)) return false;
  }
  map[action] = [code];
  persist();
  return true;
}

export function resetBinds() {
  map = { ...DEFAULTS };
  persist();
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch (err) { /* 忽略 */ }
}

load();
