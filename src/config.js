import { registerWeapon, registerMap, getWeapons, getMaps } from './registry.js';
import { buildSnow, buildDepot, buildCanal, buildMetro } from './map-gen.js';

export const TILE = 40;
export const MW = 60;
export const MH = 45;
export const W = MW * TILE;
export const H = MH * TILE;

// 武器注册表（④ 数据驱动：新武器 = 一行 registerWeapon，运行时即生效）
registerWeapon('knife', { name: '战术刀', price: 0, dmg: 45, dmg2: 95, rpm: 200, mag: 0, reserve: 0, reload: 0, spread: 0, speed: 1.0, auto: false, kind: 'knife', range: 95 });
registerWeapon('glock', { name: 'Glock-18', price: 0, dmg: 12, rpm: 400, mag: 20, reserve: 120, reload: 1900, spread: 2.6, speed: 0.96, auto: false, kind: 'pistol', range: 1200, ballistic: { first: 0.1, perShot: 0.14, max: 1.5, recover: 2.0, move: { stand: 1.0, walk: 0.42, run: 1.5, crouch: 0.7 } } });
registerWeapon('usp', { name: 'USP-S', price: 0, dmg: 13, rpm: 380, mag: 12, reserve: 36, reload: 1800, spread: 2.2, speed: 0.96, auto: false, kind: 'pistol', range: 1200, ballistic: { first: 0.08, perShot: 0.13, max: 1.4, recover: 2.0, move: { stand: 1.0, walk: 0.42, run: 1.5, crouch: 0.7 } } });
registerWeapon('p250', { name: 'P250', price: 300, dmg: 13, rpm: 400, mag: 13, reserve: 26, reload: 1700, spread: 2.1, speed: 0.96, auto: false, kind: 'pistol', range: 1200, ballistic: { first: 0.1, perShot: 0.2, max: 2.0, recover: 1.5, move: { stand: 1.0, walk: 0.42, run: 1.5, crouch: 0.7 } } });
registerWeapon('deagle', { name: '沙漠之鹰', price: 700, dmg: 55, rpm: 267, mag: 7, reserve: 35, reload: 2200, spread: 1.6, speed: 0.94, auto: false, kind: 'pistol', range: 1250, ballistic: { first: 0.06, perShot: 0.16, max: 1.4, recover: 1.8, move: { stand: 1.0, walk: 0.45, run: 1.45, crouch: 0.68 } } });
registerWeapon('mac10', { name: 'MAC-10', price: 1050, dmg: 29, rpm: 800, mag: 30, reserve: 100, reload: 2100, spread: 4.4, speed: 0.92, auto: true, kind: 'smg', range: 1100, ballistic: { first: 0.22, perShot: 0.07, max: 2.4, recover: 2.4, move: { stand: 1.0, walk: 0.4, run: 1.35, crouch: 0.65 } } });
registerWeapon('mp9', { name: 'MP9', price: 1250, dmg: 26, rpm: 857, mag: 30, reserve: 120, reload: 2100, spread: 3.8, speed: 0.92, auto: true, kind: 'smg', range: 1100, ballistic: { first: 0.22, perShot: 0.07, max: 2.4, recover: 2.4, move: { stand: 1.0, walk: 0.4, run: 1.35, crouch: 0.65 } } });
registerWeapon('p90', { name: 'P90', price: 2350, dmg: 21, rpm: 857, mag: 50, reserve: 100, reload: 2400, spread: 3.0, speed: 0.9, auto: true, kind: 'smg', range: 1100, ballistic: { first: 0.2, perShot: 0.06, max: 2.2, recover: 2.4, move: { stand: 1.0, walk: 0.4, run: 1.3, crouch: 0.65 } } });
registerWeapon('xm', { name: 'XM1014', price: 2000, dmg: 11, rpm: 71, mag: 7, reserve: 32, reload: 2600, spread: 7.0, speed: 0.9, auto: false, kind: 'shotgun', range: 750, pellets: 8, ballistic: { first: 0.65, perShot: 0.1, max: 1.5, recover: 2.2, move: { stand: 1.0, walk: 0.45, run: 1.25, crouch: 0.75 } } });
registerWeapon('ak', { name: 'AK-47', price: 2700, dmg: 40, rpm: 600, mag: 30, reserve: 90, reload: 2400, spread: 2.4, speed: 0.87, auto: true, kind: 'rifle', range: 1300, ballistic: { first: 0.08, perShot: 0.12, max: 2.1, recover: 2.2, move: { stand: 1.0, walk: 0.45, run: 1.6, crouch: 0.68 } } });
registerWeapon('m4', { name: 'M4A4', price: 3100, dmg: 33, rpm: 666, mag: 30, reserve: 90, reload: 2400, spread: 1.8, speed: 0.87, auto: true, kind: 'rifle', range: 1300, ballistic: { first: 0.08, perShot: 0.1, max: 1.9, recover: 2.4, move: { stand: 1.0, walk: 0.45, run: 1.6, crouch: 0.68 } } });
registerWeapon('awp', { name: 'AWP', price: 4750, dmg: 115, rpm: 41, mag: 5, reserve: 30, reload: 3700, spread: 14.0, speed: 0.72, auto: false, kind: 'sniper', range: 1500, scoped: true, ballistic: { first: 0.1, perShot: 0, max: 1.2, recover: 2.5, move: { stand: 1.0, walk: 0.7, run: 2.4, crouch: 0.85 } } });

// 兼容导出：注册表视图（运行时新注册的武器立即可见，零破坏既有 WEAPONS[id] 访问）
export const WEAPONS = new Proxy({}, {
  get: (_, k) => getWeapons().get(k),
  has: (_, k) => getWeapons().has(k),
  ownKeys: () => Array.from(getWeapons().keys()),
  getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true })
});

export const PRICES = { ARMOR: 650, HELM: 1000, KIT: 400, HE: 300, FLASH: 200, SMOKE: 300 };

// 粒子/弹孔等动态元素上限（防爆炸峰值 GC 卡顿）
export const MAX_PARTICLES = 600;
export const MAX_DECALS = 260;

export const ECONOMY = {
  START_MONEY: 800,
  MONEY_CAP: 16000,
  WIN_MONEY: 3250,
  KILL_MONEY: 300,
  PLANT_MONEY: 300,
  DEFUSE_MONEY: 300,
  LOSS_BONUS: [1400, 1900, 2400, 3400]
};

export const ROUND = {
  DURATION: 115,
  BUY_TIME: 20,
  FREEZE: 3,
  BOMB_FUSE: 40,
  MATCH_WIN: 13,
  OT_WIN: 16,
  SIDE_SWAP_AFTER: 12,
  OT_SWAP_EVERY: 3
};

export const DIFF = {
  easy: { react: 0.45, spreadMult: 1.8, view: 860, strafe: 0.8, aimSpeed: 22, idealMin: 220, idealMax: 550, rushChance: 0.15, rotateChance: 0.25, saveChance: 0.5 },
  normal: { react: 0.24, spreadMult: 1.15, view: 1000, strafe: 0.55, aimSpeed: 32, idealMin: 220, idealMax: 550, rushChance: 0.3, rotateChance: 0.4, saveChance: 0.8 },
  hard: { react: 0.12, spreadMult: 0.75, view: 1120, strafe: 0.4, aimSpeed: 40, idealMin: 200, idealMax: 550, rushChance: 0.4, rotateChance: 0.6, saveChance: 0.95 },
  hell: {
    react: 0.064, spreadMult: 0.5, view: 1171, strafe: 0.46, aimSpeed: 141,
    idealMin: 238, idealMax: 590, peekChance: 0.09, nadeUse: 0.93, riskT: 0.98,
    rushChance: 0.45, rotateChance: 0.75, saveChance: 1,
    trained: true, genome: [0.0277, 0.0019, 0.7421, 0.6751, 0.4305, 0.0947, 0.0996, 0.1883, 0.9134, 0.5657],
    training: { gens: 8, pop: 16, map: 'dust2', evalRounds: 6, fitness: 101.0, note: '7胜0负基线normal/尘2图, 待多图续训' }
  }
};

export const BOT_AI = {
  FOV: 1.15,
  HEAR_RADIUS: 1000,
  HEAR_TTL: 1500,
  FLASH_ANGLE: 1.2,
  ORDER_TTL: 15
};

export const BOT_NAMES = ['Rex', 'Nova', 'Echo', 'Onyx', 'Frost', 'Viper', 'Dusk', 'Blaze', 'Kane', 'Sable', 'Jinx', 'Cobra', 'Havoc', 'Zulu', 'Pike'];

export const DROP_COL = { rifle: '#ff8a2a', smg: '#ffd75e', shotgun: '#e07a2a', sniper: '#5ab0ff', pistol: '#9ad0ff' };

const DUST2_SEGMENTS = [
  [[60, '#']],
  [[18, '#'], [24, 'a'], [18, '#']],
  [[18, '#'], [24, 'a'], [18, '#']],
  [[18, '#'], [8, 'a'], [3, 'C'], [13, 'a'], [18, '#']],
  [[18, '#'], [8, 'a'], [3, 'C'], [13, 'a'], [18, '#']],
  [[18, '#'], [8, 'a'], [3, 'C'], [5, 'a'], [3, 'C'], [5, 'a'], [18, '#']],
  [[18, '#'], [16, 'a'], [3, 'C'], [5, 'a'], [18, '#']],
  [[18, '#'], [16, 'a'], [3, 'C'], [5, 'a'], [18, '#']],
  [[18, '#'], [24, 'a'], [18, '#']],
  [[18, '#'], [24, 'a'], [18, '#']],
  [[27, '#'], [6, '.'], [27, '#']],
  [[1, '#'], [58, '.'], [1, '#']],
  [[1, '#'], [19, '.'], [2, 'C'], [16, '.'], [2, 'C'], [19, '.'], [1, '#']],
  [[1, '#'], [19, '.'], [2, 'C'], [16, '.'], [2, 'C'], [19, '.'], [1, '#']],
  [[1, '#'], [23, '.'], [2, 'C'], [8, '.'], [2, 'C'], [23, '.'], [1, '#']],
  [[1, '#'], [58, '.'], [1, '#']],
  [[12, '#'], [4, '.'], [11, '#'], [6, '.'], [13, '#'], [4, '.'], [10, '#']],
  [[2, '#'], [14, 't'], [1, '#'], [26, '.'], [1, '#'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [1, '#'], [26, '.'], [1, '#'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [1, '#'], [3, '.'], [2, 'C'], [16, '.'], [2, 'C'], [3, '.'], [1, '#'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [1, '#'], [3, '.'], [2, 'C'], [16, '.'], [2, 'C'], [3, '.'], [1, '#'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [1, '#'], [26, '.'], [1, '#'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [28, '.'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [1, '.'], [11, '.'], [2, 'C'], [3, '.'], [2, 'C'], [8, '.'], [1, '.'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [1, '.'], [11, '.'], [2, 'C'], [3, '.'], [2, 'C'], [8, '.'], [1, '.'], [14, 'c'], [2, '#']],
  [[2, '#'], [14, 't'], [28, '.'], [14, 'c'], [2, '#']],
  [[12, '#'], [4, '.'], [11, '#'], [6, '.'], [13, '#'], [4, '.'], [10, '#']],
  [[1, '#'], [58, '.'], [1, '#']],
  [[1, '#'], [19, '.'], [2, 'C'], [16, '.'], [2, 'C'], [19, '.'], [1, '#']],
  [[1, '#'], [19, '.'], [2, 'C'], [16, '.'], [2, 'C'], [19, '.'], [1, '#']],
  [[1, '#'], [23, '.'], [2, 'C'], [8, '.'], [2, 'C'], [23, '.'], [1, '#']],
  [[1, '#'], [58, '.'], [1, '#']],
  [[27, '#'], [6, '.'], [27, '#']],
  [[18, '#'], [24, 'b'], [18, '#']],
  [[18, '#'], [24, 'b'], [18, '#']],
  [[18, '#'], [8, 'b'], [3, 'C'], [13, 'b'], [18, '#']],
  [[18, '#'], [8, 'b'], [3, 'C'], [13, 'b'], [18, '#']],
  [[18, '#'], [8, 'b'], [3, 'C'], [5, 'b'], [3, 'C'], [5, 'b'], [18, '#']],
  [[18, '#'], [16, 'b'], [3, 'C'], [5, 'b'], [18, '#']],
  [[18, '#'], [16, 'b'], [3, 'C'], [5, 'b'], [18, '#']],
  [[18, '#'], [24, 'b'], [18, '#']],
  [[18, '#'], [24, 'b'], [18, '#']],
  [[60, '#']],
  [[60, '#']],
  [[60, '#']]
];

function segmentsToRows(segments) {
  return segments.map((row) => {
    let str = '';
    for (const [count, ch] of row) str += ch.repeat(count);
    if (str.length !== 60) throw new Error('地图行长度错误: ' + str.length);
    return str;
  });
}

// 地图注册表（④ 数据驱动：新地图 = 一行 registerMap）
registerMap({ id: 'dust2', name: '沙漠峡谷', accent: '#ff8a2a', rows: segmentsToRows(DUST2_SEGMENTS) });
registerMap({ id: 'snow', name: '冰雪基地', accent: '#8ecbff', rows: buildSnow().rows() });
registerMap({ id: 'depot', name: '仓库禁区', accent: '#c9a36a', rows: buildDepot().rows() });
registerMap({ id: 'canal', name: '运河小镇', accent: '#6ad1a8', rows: buildCanal().rows() });
registerMap({ id: 'metro', name: '地铁枢纽', accent: '#b08aff', rows: buildMetro().rows() });

// 兼容导出：注册表视图（运行时新注册的地图立即生效）
function mapsArr() { return Array.from(getMaps().values()); }
export const MAPS = new Proxy([], {
  get: (_, k) => {
    if (k === Symbol.iterator) return mapsArr()[Symbol.iterator].bind(mapsArr());
    if (k === 'length') return mapsArr().length;
    if (k === Symbol.toPrimitive) return () => mapsArr().length;
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0) return mapsArr()[idx];
    const v = mapsArr()[k];
    if (typeof v === 'function') return (...args) => v.apply(mapsArr(), args);
    return v;
  }
});
