// AI 共享工具：事件发射 / 决策日志 / 人格乘子
import { ctx } from '../ctx.js';
import { ARCHETYPES } from '../persona.js';
import { query } from '../info.js';

export const emit = (evt, p) => ctx.bus.emit(evt, p);

// 决策日志（可观测性：知道每个 bot 为什么这么走）
export function logAct(game, e, action, reason) {
  if (!e.aiLog) e.aiLog = [];
  if (e.aiLog.length >= 12) e.aiLog.shift();
  e.aiLog.push({ t: Math.floor(game.time), a: action, r: reason });
  if (game.aiLog) {
    if (game.aiLog.length >= 60) game.aiLog.shift();
    game.aiLog.push({ t: Math.floor(game.time), bot: e.name, team: e.team, a: action, r: reason });
  }
}

// 人格乘子（难度 = 全局，人格 = 个体偏移）
export function styleOf(e) {
  const arch = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
  const p = e.personality || { aggression: 0.65, riskT: 0.65, teamwork: 0.65, steadiness: 0.65 };
  return { arch, p };
}

export function hasPrefireIntel(e, game) {
  if (e.lastKnown && e.lastKnownT < 3) return true;
  if (e.memory && game && e.memory.some((m) => game.time - m.t < 2)) return true;
  // 队友情报（放宽预瞄依据）：黑板上有 <4s 的枪声/目击/受击/击杀消息也算，支持转角预瞄/穿点提前枪
  if (game && game.info && e.team) {
    const info = query(game, e);
    if (info && info.age < 4) return true;
  }
  return false;
}
export function canFinishDefuse(game, e) {
  if (!game.bomb || !game.bomb.planted) return false;
  const speed = e.weapons && e.weapons.kit ? 2.5 : 5;
  return game.bomb.timer >= speed - (e.defuseT || 0) + 0.15;
}
export function idealRange(e, d = {}) {
  const arch = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
  return {
    min: (d.idealMin || 220) * arch.idealMul,
    max: (d.idealMax || 550) * arch.idealMul
  };
}

export function hasGoodGun(e) {
  const p = e && e.weapons && e.weapons.primary;
  return p === 'ak' || p === 'm4' || p === 'famas' || p === 'awp';
}

export function redistributeTLanes(game) {
  const rotBots = game.entities.filter((o) => o.bot && o.team === 't');
  rotBots.forEach((o, idx) => {
    o.role = game.tAttackSite;
    o.laneIdx = idx % Math.max(1, Math.min(3, rotBots.length));
    o.objCache = null;
    o.objAt = 0;
    o.guardPoint = null;
  });
}

export function shouldTradePush(e, killInfo) {
  if (!killInfo || killInfo.type !== 'kill' || killInfo.age >= 2.5 || e.aimTarget || e.defuseT > 0 || e.hasBomb) return false;
  const arch = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
  const aggressive = arch.aggression > 1.0 || (e.personality && e.personality.aggression > 0.55);
  if (!aggressive) return false;
  return Math.hypot(killInfo.x - e.x, killInfo.y - e.y) <= 900;
}

export function aliveCount(game, team) {
  if (game.aliveCounts) return game.aliveCounts[team] || 0;
  return game.entities.filter((o) => o.team === team && !o.dead).length;
}
export function shouldSwitchPistol(ammo, closeEnemy) {
  return closeEnemy && ammo <= 2;
}

// ===== 警报置信度与目标缓存覆盖（candidate-151）=====
// 感知警报统一置信度标度：目击(1) > 击杀/尸体精确位置(0.7) > 清晰枪声(0.55) > 呼叫/受击(0.5) > 脚步(0.45)
// 显式 conf 字段优先；lastKnown/lastHear 均按此归一，供缓存覆盖决策比较
export function alertConf(a) {
  if (!a) return 0;
  if (a.conf !== undefined && a.conf !== null) return a.conf;
  switch (a.type) {
    case 'kill':
      return 0.7; // 击杀=队友报告的尸体精确位置，置信度最高（原 0.35 排最末不合理）
    case 'sight':
    case 'focus':
      return 1;
    case 'shot':
      return 0.55;
    case 'call':
    case 'dmg':
      return 0.5;
    case 'step':
      return 0.45;
    default:
      return 0.5;
  }
}

// 判断新警报是否应立即覆盖旧目标缓存（而非等 TTL 到期）：
// - 无新警报 → 不覆盖
// - 无旧目标 → 直接写入
// - 新警报置信度更高 → 立即覆盖（强警报压过旧位置，让 bot 更快转向新威胁）
// - 旧目标已超 4s TTL → 任何新警报接管
// - 新警报置信度更低 → 不覆盖（弱情报不冲掉强目标）
// - 同置信度 → 更新的情报覆盖旧的（避免追已过时位置）
// oldKnown/newAlert 均接受 {x,y,conf?,t?} 或 lastKnown 形态 {x,y,conf?,lastKnownT?}
// 纯函数、确定性：仅由输入决定，无随机/时间状态
export function shouldRefreshObjective(oldKnown, newAlert, now) {
  if (!newAlert) return false;
  if (!oldKnown) return true;
  const newConf = alertConf(newAlert);
  const oldConf = alertConf(oldKnown);
  const newAge = Math.max(0, now - (newAlert.t !== undefined ? newAlert.t : now));
  // t = 时间戳（now - t = 年龄）；lastKnownT 本身就是年龄（秒），直接取用
  const oldAge = oldKnown.t !== undefined
    ? Math.max(0, now - oldKnown.t)
    : Math.max(0, oldKnown.lastKnownT !== undefined ? oldKnown.lastKnownT : 0);
  if (newConf > oldConf) return true;
  if (oldAge >= 4) return true;
  if (newConf < oldConf) return false;
  return newAge < oldAge;
}