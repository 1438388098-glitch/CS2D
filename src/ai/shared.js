// AI 共享工具：事件发射 / 决策日志 / 人格乘子
import { ctx } from '../ctx.js';
import { ARCHETYPES } from '../persona.js';

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
  return p === 'ak' || p === 'm4' || p === 'awp';
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