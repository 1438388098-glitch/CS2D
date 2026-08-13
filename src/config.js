import { registerWeapon, registerMap, getWeapons, getMaps } from './registry.js';
import { AI_LADDER_WEIGHTS } from './data/ai-ladder-weights.js';
import { OFFICIAL_MAPS } from './official-maps.js';

export const TILE = 40;
export const MW = 60;
export const MH = 45;
export const W = MW * TILE;
export const H = MH * TILE;

// 武器注册表（④ 数据驱动：新武器 = 一行 registerWeapon，运行时即生效）
registerWeapon('knife', { name: '战术刀', price: 0, dmg: 45, dmg2: 95, rpm: 200, mag: 0, reserve: 0, reload: 0, spread: 0, speed: 1.0, auto: false, kind: 'knife', range: 95 });
registerWeapon('glock', { name: 'Glock-18', price: 200, dmg: 12, rpm: 400, mag: 20, reserve: 120, reload: 1900, spread: 2.6, speed: 0.96, auto: false, kind: 'pistol', range: 1200, ballistic: { first: 0.1, perShot: 0.14, max: 1.5, recover: 2.0, move: { stand: 1.0, walk: 0.42, run: 1.5, crouch: 0.7 } } });
registerWeapon('usp', { name: 'USP-S', price: 200, dmg: 13, rpm: 380, mag: 12, reserve: 36, reload: 1800, spread: 2.2, speed: 0.96, auto: false, kind: 'pistol', range: 1200, ballistic: { first: 0.08, perShot: 0.13, max: 1.4, recover: 2.0, move: { stand: 1.0, walk: 0.42, run: 1.5, crouch: 0.7 } } });
registerWeapon('p250', { name: 'P250', price: 300, dmg: 13, rpm: 400, mag: 13, reserve: 26, reload: 1700, spread: 2.1, speed: 0.96, auto: false, kind: 'pistol', range: 1200, ballistic: { first: 0.1, perShot: 0.2, max: 2.0, recover: 1.5, move: { stand: 1.0, walk: 0.42, run: 1.5, crouch: 0.7 } } });
registerWeapon('deagle', { name: '沙漠之鹰', price: 700, dmg: 55, rpm: 267, mag: 7, reserve: 35, reload: 2200, spread: 1.6, speed: 0.94, auto: false, kind: 'pistol', range: 1250, ballistic: { first: 0.06, perShot: 0.16, max: 1.4, recover: 1.8, move: { stand: 1.0, walk: 0.45, run: 1.45, crouch: 0.68 } } });
registerWeapon('mac10', { name: 'MAC-10', price: 1050, dmg: 29, rpm: 800, mag: 30, reserve: 100, reload: 2100, spread: 4.4, speed: 0.92, auto: true, kind: 'smg', range: 1100, ballistic: { first: 0.22, perShot: 0.07, max: 2.4, recover: 2.4, move: { stand: 1.0, walk: 0.4, run: 1.35, crouch: 0.65 } } });
registerWeapon('mp9', { name: 'MP9', price: 1250, dmg: 26, rpm: 857, mag: 30, reserve: 120, reload: 2100, spread: 3.8, speed: 0.92, auto: true, kind: 'smg', range: 1100, ballistic: { first: 0.22, perShot: 0.07, max: 2.4, recover: 2.4, move: { stand: 1.0, walk: 0.4, run: 1.35, crouch: 0.65 } } });
registerWeapon('p90', { name: 'P90', price: 2350, dmg: 21, rpm: 857, mag: 50, reserve: 100, reload: 2400, spread: 3.0, speed: 0.9, auto: true, kind: 'smg', range: 1100, ballistic: { first: 0.2, perShot: 0.06, max: 2.2, recover: 2.4, move: { stand: 1.0, walk: 0.4, run: 1.3, crouch: 0.65 } } });
registerWeapon('xm', { name: 'XM1014', price: 2000, dmg: 11, rpm: 71, mag: 7, reserve: 32, reload: 2600, spread: 7.0, speed: 0.9, auto: false, kind: 'shotgun', range: 750, pellets: 8, ballistic: { first: 0.65, perShot: 0.1, max: 1.5, recover: 2.2, move: { stand: 1.0, walk: 0.45, run: 1.25, crouch: 0.75 } } });
registerWeapon('ak', { name: 'AK-47', price: 2700, dmg: 40, rpm: 600, mag: 30, reserve: 90, reload: 2400, spread: 2.4, speed: 0.87, auto: true, kind: 'rifle', range: 1300, ballistic: { first: 0.08, perShot: 0.12, max: 2.1, recover: 2.2, move: { stand: 1.0, walk: 0.45, run: 1.6, crouch: 0.68 } } });
registerWeapon('m4', { name: 'M4A4', price: 3100, dmg: 33, rpm: 666, mag: 30, reserve: 90, reload: 2400, spread: 1.8, speed: 0.87, auto: true, kind: 'rifle', range: 1300, ballistic: { first: 0.08, perShot: 0.1, max: 1.9, recover: 2.4, move: { stand: 1.0, walk: 0.45, run: 1.6, crouch: 0.68 } } });
registerWeapon('famas', { name: 'FAMAS', price: 2900, dmg: 36, rpm: 650, mag: 25, reserve: 90, reload: 2400, spread: 2.0, speed: 0.87, auto: true, kind: 'rifle', range: 1300, ballistic: { first: 0.08, perShot: 0.11, max: 2.0, recover: 2.3, move: { stand: 1.0, walk: 0.45, run: 1.6, crouch: 0.68 } } });
registerWeapon('awp', { name: 'AWP', price: 4750, dmg: 115, rpm: 41, mag: 5, reserve: 30, reload: 3700, spread: 14.0, speed: 0.72, auto: false, kind: 'sniper', range: 1500, scoped: true, armorPen: 1, ballistic: { first: 0.1, perShot: 0, max: 1.2, recover: 2.5, move: { stand: 1.0, walk: 0.7, run: 2.4, crouch: 0.85 } } });

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
  WIN_BOMB_MONEY: 3500,
  KILL_MONEY: 300,
  KILL_MONEY_AWP: 100,
  KILL_MONEY_KNIFE: 1500,
  PLANT_MONEY: 300,
  DEFUSE_MONEY: 300,
  LOSS_BONUS: [1400, 1900, 2400, 2900, 3400]
};

export const ROUND = {
  DURATION: 115,
  BUY_TIME: 20,
  FREEZE: 3,
  BOMB_FUSE: 40,
  END_DELAY: 3.0,
  MATCH_WIN: 5,   // 九局五胜（BO9）：先赢 5 局获胜，单图最多 9 局
  OT_WIN: 11,     // 长赛制备用加时（MR9 8:8 起先赢 3 到 11）；BO9 4:4 直接打决胜局不触发
  SIDE_SWAP_AFTER: 8,
  OT_SWAP_EVERY: 3
};

// —— 地狱阶梯构建 ——
// S1 冠军基因解码（10 维）；H1-H3 在「退化点(hard 能力)」与「冠军」之间插值
const CHAMP_GENOME = [0.0277, 0.0019, 0.7421, 0.6751, 0.4305, 0.0947, 0.0996, 0.1883, 0.9134, 0.5657];
const CHAMP_PARAMS = {
  react: 0.064, spreadMult: 0.5, view: 1171, strafe: 0.46, aimSpeed: 141,
  idealMin: 238, idealMax: 590, peekChance: 0.09, nadeUse: 0.93, riskT: 0.98,
  rushChance: 0.45, rotateChance: 0.75, saveChance: 0.8
};

function lerp(a, b, t) { return a + (b - a) * t; }

// 能力插值：t=0 退化点(hard) → t=1 冠军
export function degParams(t) {
  const h = { react: 0.12, spreadMult: 0.75, view: 1120, strafe: 0.4, aimSpeed: 40, idealMin: 200, idealMax: 550, rushChance: 0.4, rotateChance: 0.6, saveChance: 0.7 };
  const c = CHAMP_PARAMS;
  return {
    react: lerp(h.react, c.react, t), spreadMult: lerp(h.spreadMult, c.spreadMult, t),
    view: lerp(h.view, c.view, t), strafe: lerp(h.strafe, c.strafe, t),
    aimSpeed: lerp(h.aimSpeed, c.aimSpeed, t), idealMin: lerp(h.idealMin, c.idealMin, t),
    idealMax: lerp(h.idealMax, c.idealMax, t), peekChance: lerp(0.04, c.peekChance, t),
    nadeUse: lerp(0.6, c.nadeUse, t), riskT: lerp(0.7, c.riskT, t),
    rushChance: lerp(h.rushChance, c.rushChance, t), rotateChance: lerp(h.rotateChance, c.rotateChance, t),
    saveChance: lerp(h.saveChance, c.saveChance, t)
  };
}

export const DIFF = {
  easy: { react: 0.45, spreadMult: 1.8, view: 860, strafe: 0.8, aimSpeed: 22, idealMin: 220, idealMax: 550, rushChance: 0.15, rotateChance: 0.25, saveChance: 0.3 },
  normal: { react: 0.24, spreadMult: 1.15, view: 1000, strafe: 0.55, aimSpeed: 32, idealMin: 220, idealMax: 550, rushChance: 0.3, rotateChance: 0.4, saveChance: 0.5 },
  hard: { react: 0.12, spreadMult: 0.75, view: 1120, strafe: 0.4, aimSpeed: 40, idealMin: 200, idealMax: 550, rushChance: 0.4, rotateChance: 0.6, saveChance: 0.7 },
  // 地狱 10 级阶梯：hellLadder[1..10]（H1 最弱 → H10 最强）
  //   H1-H3  = S1 冠军基因衰减插值（免训练渐进热身）
  //   H4-H7  = GA 专项训练基因（保枪/经济/闪光/转点逐级蒸馏），trained:false 前用插值占位
  //   H8-H10 = DQN 策略网络（netWeights），trained:false 前用退化 H3 插值占位
  hell: {
    trained: true, genome: CHAMP_GENOME,
    training: { gens: 8, pop: 16, map: 'dust2', evalRounds: 6, fitness: 101.0, note: 'S1 基线 normal/尘2图' },
    ladder: buildHellLadder()
  }
};

export const MAP_CT_REACT = {
  dust2: 0.6,
  arctic: 0.5,
  metro: 0.55,
  forge: 0.5,
  atrium: 0.52,
  'foundry-port': 0.5,
  'foundry-ridge': 0.5,
  'foundry-ruin': 0.5,
  'duel-pit': 0.5,
  'duel-alley': 0.5,
  'duel-forge': 0.5,
  'custom-map': 0.5
};

export const BOT_AI = {
  FOV: 1.15,
  MAX_VIEW: 720,
  HEAR_RADIUS: 1000,
  HEAR_TTL: 1500,
  FLASH_ANGLE: 1.2,
  ORDER_TTL: 15,
  COM_RADIUS: 1200,
  IGL_INTERVAL: 5
};

function buildHellLadder() {
  const ladder = {};
  // H1-H3：冠军衰减插值（免训练）
  ladder[1] = { ...degParams(0.02), netWeights: null, trained: true, note: 'H1 冠军衰减 2%' };
  ladder[2] = { ...degParams(0.55), netWeights: null, trained: true, note: 'H2 冠军衰减 55%' };
  ladder[3] = { ...degParams(0.85), netWeights: null, trained: true, note: 'H3 冠军衰减 85%' };
    ladder[4] = { react: 0.06385, spreadMult: 0.50285, view: 1164.8018961832554, strafe: 0.4583, aimSpeed: 79.99929097125197, idealMin: 254.01062056380857, idealMax: 656.6484041101113, peekChance: 0.15431318545426875, nadeUse: 0.8156456266143255, riskT: 1.5, rushChance: 0.37, rotateChance: 0.56, saveChance: 0.6799999999999999, trained: true, note: 'H4 保枪纪律', genome: [0.0277,0.0019,0.7296037923665106,0.16666075809376635,0.4305,0.13502655140952147,0.26662101027527824,0.3086263709085375,0.7695570332679068,1,0.45,0.6,0.6] };
  ladder[5] = { react: 0.05, spreadMult: 0.50285, view: 1136.441063982525, strafe: 0.4583, aimSpeed: 141.012, idealMin: 223.53133573030587, idealMax: 589.84, peekChance: 0.09415, nadeUse: 0.9598387243686088, riskT: 0.9788399999999999, rushChance: 0.37, rotateChance: 0.6429052847178501, saveChance: 0.5746075777102903, trained: true, note: 'H5 经济纪律', genome: [0,0.0019,0.6728821279650503,0.6751,0.4305,0.0588283393257647,0.0996,0.1883,0.9497984054607611,0.5657,0.45,0.7381754745297502,0.4682594721378628] };
  ladder[6] = { react: 0.06385, spreadMult: 0.5, view: 1181.8843921094826, strafe: 0.4583, aimSpeed: 153.40282561653726, idealMin: 237.88, idealMax: 589.84, peekChance: 0.09415, nadeUse: 0.8333048730292143, riskT: 0.9788399999999999, rushChance: 0.3547418178454663, rotateChance: 0.3940649072295054, saveChance: 0.6682515175314829, trained: true, note: 'H6 闪光配合', genome: [0.0277,0,0.7637687842189653,0.7783568801378106,0.4305,0.0947,0.0996,0.1883,0.7916310912865178,0.5657,0.4245696964091106,0.32344151204917565,0.5853143969143536] };
  ladder[7] = { react: 0.056569858429277683, spreadMult: 0.50285, view: 1278.9088568778911, strafe: 0.4583, aimSpeed: 136.9322370280611, idealMin: 237.88, idealMax: 630.0248889827443, peekChance: 0.16212163334726068, nadeUse: 0.93072, riskT: 0.9005000192861046, rushChance: 0.48138633056057145, rotateChance: 0.56, saveChance: 0.7454464254763373, trained: true, note: 'H7 转点反制', genome: [0.013139716858555361,0.0019,0.9578177137557821,0.6411019752338426,0.4305,0.0947,0.20006222245686064,0.32424326669452136,0.9134,0.5004166827384205,0.6356438842676191,0.6,0.6818080318454216] };
      ladder[8] = { ...degParams(1.0), trained: true, style: "H8 保守架点流", note: "DQN push@best(课程学习, 5图)", netWeights: AI_LADDER_WEIGHTS[8] };
  ladder[9] = { ...degParams(1.0), trained: true, style: "H9 主动控图流", note: "DQN hold@best(课程学习, 5图)", netWeights: AI_LADDER_WEIGHTS[8] };
  ladder[10] = { ...degParams(1.0), trained: true, style: "H10 压迫前压流", note: "DQN control@best(课程学习, 5图)", netWeights: AI_LADDER_WEIGHTS[8] };
        ladder[12] = { react: 0.24, spreadMult: 1.15, view: 1000, strafe: 0.55, aimSpeed: 32, idealMin: 220, idealMax: 550, rushChance: 0.3, rotateChance: 0.4, saveChance: 0.5, trained: true, style: "H12 团队配合流", note: "DQN 团队合作训练 v3(对手池自对游, 对规则50%/对历史-%, 能力公平 normal)", netWeights: AI_LADDER_WEIGHTS[8] };
        ladder[11] = { react: 0.05, spreadMult: 0.5, view: 1056.2666378768135, strafe: 0.3481067598819857, aimSpeed: 66.06570746315808, idealMin: 432.2824965599221, idealMax: 832.9960945366279, peekChance: 0.4885696106524431, nadeUse: 0.6417468918153586, riskT: 0.42588297321173496, rushChance: 0.7, rotateChance: 0.4010832729909953, saveChance: 0.9896181707219265, peekSkill: 0.8777037067912195, counterStrafe: 0.591522385554393, prefireChance: 0.3856263583497848, ecoDiscipline: 0.4, tradeSpeed: 1.954029072624416, spreadCtrl: 1.4095065308375792, trained: true, style: "H11 军备竞赛", note: "GA 军备竞赛(网络+intel 试验后回滚, fitness 0.80 gen67)", intel: true, oppModel: true, netWeights: null };
return ladder;
}

// 难度解析：diff=hell 时返回 ladder 对应级（滑块）
export function resolveDiff(diff, hellLevel) {
  if (diff !== 'hell') return DIFF[diff] || DIFF.normal;
  const lvl = Math.max(1, Math.min(12, hellLevel || 10));
  return DIFF.hell.ladder[lvl];
}

// 难度自适应：连续档位插值（升/降档平滑，复用 degParams 的 [hard→champ] 插值思路）。
// t = 连续档位（如 10.5 = H10 与 H11 之间）；整数档返回原 ladder 条目（含 DQN 网络），
// 小数档只做数值参数线性插值（丢弃 netWeights，避免跨风格混网）。
export function hellParamsAt(t) {
  t = Math.max(1, Math.min(12, t));
  const lvl = Math.floor(t);
  const frac = t - lvl;
  if (frac < 0.001) return DIFF.hell.ladder[lvl];
  const lo = DIFF.hell.ladder[lvl];
  const hi = DIFF.hell.ladder[Math.min(12, lvl + 1)];
  if (!lo || !hi) return lo || DIFF.hell.ladder[10];
  const out = {};
  for (const k in lo) {
    if (typeof lo[k] === 'number' && typeof hi[k] === 'number') out[k] = lo[k] + (hi[k] - lo[k]) * frac;
    else if (typeof lo[k] === 'number') out[k] = lo[k];
    else if (k === 'trained') out.trained = true;
  }
  out.note = 'H' + lvl + '→H' + Math.min(12, lvl + 1) + '@' + frac.toFixed(2);
  return out;
}

// 运行时取难度参数（优先 startMatch 注入的 diffParams，兼容无注入场景）
export function diffOf(game) {
  if (game && game.opts && game.opts.diffParams) return game.opts.diffParams;
  if (game && game.opts && game.opts.diff) return DIFF[game.opts.diff] || DIFF.normal;
  return DIFF.normal;
}

export const BOT_NAMES = ['Rex', 'Nova', 'Echo', 'Onyx', 'Frost', 'Viper', 'Dusk', 'Blaze', 'Kane', 'Sable', 'Jinx', 'Cobra', 'Havoc', 'Zulu', 'Pike'];

export const DROP_COL = { rifle: '#ff8a2a', smg: '#ffd75e', shotgun: '#e07a2a', sniper: '#5ab0ff', pistol: '#9ad0ff' };

// Map registry: high-resolution official radar rebuilds
for (const [id, def] of Object.entries(OFFICIAL_MAPS)) {
  if (id === 'canal' || id === 'blast') continue;
  registerMap({
    id,
    name: def.name,
    accent: def.accent,
    tile: def.tile,
    rows: def.rows,
    penPoints: def.penPoints || [],
    highPoints: def.highPoints || [],
    category: 'bomb5v5'
  });
}

// 同布局换主题的变体地图（视觉资源扩展：新色板/装饰/贴图，布局复用已验证的原版）
const VARIANT_MAPS = {
  arctic: { base: 'metro', name: '冰封港湾', accent: '#8fd8ff' }
};
for (const [id, v] of Object.entries(VARIANT_MAPS)) {
  const base = OFFICIAL_MAPS[v.base];
  if (!base) continue;
  registerMap({
    id,
    name: v.name,
    accent: v.accent,
    tile: base.tile,
    rows: base.rows,
    penPoints: base.penPoints || [],
    highPoints: base.highPoints || [],
    category: 'bomb5v5'
  });
}

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
