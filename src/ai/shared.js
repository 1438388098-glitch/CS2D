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
