import { WEAPONS, BOT_NAMES, ECONOMY } from './config.js';
import { ctx } from './ctx.js';
import { rollPersonality } from './persona.js';

let botNameIdx = 0;

export function createEntity(team, bot) {
  return {
    team, bot,
    name: bot ? BOT_NAMES[botNameIdx++ % BOT_NAMES.length] : 'You',
    x: 0, y: 0, vx: 0, vy: 0, angle: 0, pitch: 0, rad: 13, moveRad: 10,
    hp: 100, armor: 0, helmet: false, money: ECONOMY.START_MONEY,
    weapons: { primary: null, secondary: null, knife: 'knife', nades: { he: 0, flash: 0, smoke: 0, decoy: 0, moly: 0, emp: 0 }, kit: false },
    slot: 'secondary', lastSlot: 'knife',
    reloading: false, reloadT: 0, fireCd: 0, recoil: 0, shotStreak: 0, crouched: false,
    ammoMap: {}, reserveMap: {},
    dead: false, kills: 0, deaths: 0, assists: 0, plants: 0, defuses: 0,
    deathT: 0,
    hasBomb: false, walking: false, blind: 0, scoped: false, lossStreak: 0,
    stepT: 0, stepFlip: false, lastDmgFrom: null, lastDmgT: -99999, muzzleT: 0, switchT: 0,
    lastHitAng: 0, hitFxT: 0, hitFxPower: 1,
    strafeDir: 1, strafeT: 0, reaction: 0, aimTarget: null, aimLostT: 0, aimLastPos: null,
    lastKnown: null, lastKnownT: 99,
    path: null, pathI: 0, role: 'a', repathT: 0, stuckT: 0, lastSample: { x: 0, y: 0 },
    plantT: 0, defuseT: 0, lastShot: 0, trigger: false, triggerHeld: false, triggerWas: false,
    objCache: null, objAt: 0, objKey: null, guardPoint: null, guardPointSite: null,
    plantRetryT: 0, usedNadeRound: 0, anchorIdx: 0, peekT: 0,
    rushMode: false, vanguard: false, plantedSmokeRound: 0,
    streak: 0, wKills: {}, aiParams: null,
    personality: rollPersonality(botNameIdx),
    archetype: 'rifler',
    memory: [],
    decT: 0,
    height: 0, stunT: 0, splashCd: 0, highPointT: 0, highIdx: 0,
    prefireT: 0, prefireX: 0, prefireY: 0, prefireCount: 0, barrelT: 0, crateT: 0, botThreatT: 0,
    tradeBoost: 0,
  };
}

export function spawnEntity(e, spawnList, preferIdx) {
  if (!spawnList || spawnList.length === 0) {
    console.warn('spawnEntity: spawn list empty for team ' + e.team);
    return;
  }
  const s = preferIdx !== undefined
    ? spawnList[preferIdx % spawnList.length]
    : spawnList[Math.floor(ctx.rand() * spawnList.length)];
  e.x = s.x;
  e.y = s.y;
  e.vx = 0; e.vy = 0; e.dead = false; e.hp = 100;
  e.deathT = 0;
  e.angle = ctx.rand() * Math.PI * 2;
  e.pitch = 0;
  e.slot = e.weapons.primary ? 'primary' : 'secondary';
  e.reloading = false; e.reloadT = 0; e.fireCd = 0; e.recoil = 0;
  e.blind = 0; e.scoped = false;
  e.strafeDir = ctx.rand() < 0.5 ? -1 : 1; e.strafeT = 0;
  e.reaction = 0; e.aimTarget = null; e.aimLostT = 0; e.aimLastPos = null;
  e.lastKnown = null; e.lastKnownT = 99;
  e.path = null; e.pathI = 0; e.stuckT = 0;
  e.lastSample = { x: e.x, y: e.y };
  e.plantT = 0; e.defuseT = 0;
  e.trigger = false; e.triggerHeld = false; e.triggerWas = false;
  e.shotStreak = 0; e.crouched = false;
  e.objCache = null; e.objAt = 0; e.objKey = null; e.guardPoint = null; e.guardPointSite = null;
  e.walking = false; e.muzzleT = 0; e.switchT = 0;
  e.rushMode = false; e.vanguard = false; e.plantedSmokeRound = 0;
  // 跨回合残留清理（决策/感知状态不得跨回合携带）
  e.lastShot = 0;              // 防"幻听"：上回合枪声当新情报
  e.lastHearT = {};            // 同上
  e.netAct = undefined; e.netAt = undefined;  // DQN 决策跨回合
  e.stuckEscapes = 0;          // 卡死逃逸计数跨回合
  e.peekT = 0; e.aimLostT = 0; e.aimLastPos = null;
  e.tradeBoost = 0;            // 补枪加速跨回合
  e.highPointT = 0;            // 高台换位计时跨回合
  e.plantRetryT = 0;           // 安弹重试跨回合
  e.lastReport = null;         // 报告冷却跨回合
  e.memory = [];               // 目击记忆跨回合（防开局沿用旧情报）
  if (!e.weapons.secondary) e.weapons.secondary = defaultPistol(e.team);
  // 新回合弹药回满（CS 惯例；仅补齐已有武器）
  for (const k in e.ammoMap) { const w = WEAPONS[k]; if (w && w.mag > 0) e.ammoMap[k] = w.mag; }
  for (const k in e.reserveMap) { const w = WEAPONS[k]; if (w) e.reserveMap[k] = w.reserve; }
}

export function defaultPistol(team) { return team === 'ct' ? 'usp' : 'glock'; }

export function weaponDef(e) {
  if (e.slot && e.slot.indexOf('nade:') === 0) return null;
  if (e.slot === 'knife') return WEAPONS.knife;
  if (e.slot === 'primary' && e.weapons.primary) return WEAPONS[e.weapons.primary];
  return WEAPONS[e.weapons.secondary || 'glock'];
}

export function wkey(e) {
  if (e.slot === 'knife') return 'knife';
  if (e.slot === 'primary' && e.weapons.primary) return e.weapons.primary;
  return e.weapons.secondary || 'glock';
}

export function ammoFor(e) {
  const w = weaponDef(e), k = wkey(e);
  if (w && e.ammoMap[k] === undefined) e.ammoMap[k] = w.mag;
  return e.ammoMap[k] || 0;
}

export function reserveFor(e) {
  const w = weaponDef(e), k = wkey(e);
  if (w && e.reserveMap[k] === undefined) e.reserveMap[k] = w.reserve;
  return e.reserveMap[k] || 0;
}
