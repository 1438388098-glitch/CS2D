// 队伍编成：角色分配（突破/狙击/辅助/绕后/步枪）+ 队长 IGL + 玩家战术指令
import { diffOf } from '../config.js';
import { getMap } from '../map.js';
import { ctx } from '../ctx.js';
import { assignArchetypes } from '../persona.js';
import { emit } from './shared.js';

export function assignRoles(game) {
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  game.tAttackSite = ctx.rand() < 0.5 ? 'A' : 'B';
  game.tSwitchedAt = 0;
  // rush 决策：训练队（aiParams）用基因，否则用难度基线
  const t0 = tBots[0];
  game.tRush = ctx.rand() < (t0 && t0.aiParams ? t0.aiParams.rushChance : diffOf(game).rushChance);
  // 角色分配（阵容：突破/辅助/狙击/绕后/步枪）
  assignArchetypes(tBots, game.seed || 1);
  assignArchetypes(cBots, (game.seed || 1) + 7);
  const tRoles = [];
  const tn = tBots.length;
  const tMainN = Math.max(2, Math.ceil(tn * 0.6));
  const tMidN = tn >= 4 ? 1 : 0;
  const tOtherN = Math.max(0, tn - tMainN - tMidN);
  for (let i = 0; i < tn; i++) {
    tRoles.push(i < tMainN ? game.tAttackSite : i < tMainN + tOtherN ? (game.tAttackSite === 'A' ? 'B' : 'A') : 'mid');
  }
  for (let i = tRoles.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rand() * (i + 1));
    const t = tRoles[i];
    tRoles[i] = tRoles[j];
    tRoles[j] = t;
  }
  for (let i = 0; i < tBots.length; i++) {
    const e = tBots[i];
    e.role = tRoles[i];
    e.rushMode = game.tRush && e.role === game.tAttackSite;
    e.vanguard = i < 2 && e.role === game.tAttackSite;
    e.objCache = null;
    e.objAt = 0;
    e.guardPoint = null;
    e.igl = i === 0;
  }
  const cRoles = [];
  const cN = cBots.length;
  const cA = Math.max(1, Math.round(cN * 0.4));
  const cB = Math.max(1, Math.round(cN * 0.4));
  const cM = Math.max(0, cN - cA - cB);
  for (let i = 0; i < cN; i++) {
    cRoles.push(i < cA ? 'a' : i < cA + cB ? 'b' : 'mid');
  }
  for (let i = cRoles.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rand() * (i + 1));
    const t = cRoles[i];
    cRoles[i] = cRoles[j];
    cRoles[j] = t;
  }
  const siteCount = { a: 0, b: 0, mid: 0 };
  for (let i = 0; i < cBots.length; i++) {
    const e = cBots[i];
    e.role = cRoles[i];
    e.anchorIdx = e.role === 'mid' ? 0 : siteCount[e.role]++;
    e.objCache = null;
    e.objAt = 0;
    e.igl = i === 0;
    e.ctRoamer = false;
  }
  const midIdx = cBots.findIndex((e) => e.role === 'mid');
  if (midIdx >= 0) {
    cBots[midIdx].ctRoamer = true;
  } else {
    let roamer = cBots[0];
    for (const e of cBots) {
      const pa = e.personality ? e.personality.aggression : 0.65;
      const pb = roamer && roamer.personality ? roamer.personality.aggression : 0.65;
      if (pa > pb) roamer = e;
    }
    if (roamer) roamer.ctRoamer = true;
  }
}

const ORDER_TEXT = {
  follow: '全体集合！', siteA: '全体进攻 A 点！', siteB: '全体进攻 B 点！', hold: '全体守住当前位置！'
};

// 玩家→bot 战术指令（F1-F4）：下发后 15s 内覆盖 bot 默认目标（低团队性 bot 可能无视）
export function setPlayerOrder(game, type) {
  const p = game.player;
  if (!p || p.dead || game.over || game.state === 'MENU') return;
  if (!ORDER_TEXT[type]) return;
  game.tOrder = { type, at: game.roundTime, x: p.x, y: p.y };
  for (const e of game.entities) {
    if (e.bot) { e.objCache = null; e.objAt = 0; }
  }
  emit('toast', { text: ORDER_TEXT[type] });
}
