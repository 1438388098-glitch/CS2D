// 队伍编成：角色分配（突破/狙击/辅助/绕后/步枪）+ 队长 IGL + 玩家战术指令
import { DIFF } from '../config.js';
import { getMap } from '../map.js';
import { ctx } from '../ctx.js';
import { assignArchetypes } from '../persona.js';
import { emit } from './shared.js';

export function assignRoles(game) {
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  game.tAttackSite = ctx.rand() < 0.5 ? 'A' : 'B';
  game.tSwitchedAt = 0;
  game.tRush = ctx.rand() < (DIFF[game.opts.diff] || DIFF.normal).rushChance;
  // 角色分配（阵容：突破/辅助/狙击/绕后/步枪）
  assignArchetypes(tBots, game.seed || 1);
  assignArchetypes(cBots, (game.seed || 1) + 7);
  for (let i = 0; i < tBots.length; i++) {
    const e = tBots[i];
    e.role = game.tAttackSite;
    e.rushMode = game.tRush;
    e.vanguard = i < 2;
    e.objCache = null;
    e.objAt = 0;
    e.guardPoint = null;
    e.igl = i === 0;
  }
  for (let i = 0; i < cBots.length; i++) {
    const e = cBots[i];
    // CT 守点分配：结合玩家(敌方)近期击杀位置偏好做反制（对手建模）
    let kA = 0, kB = 0;
    const ks = (game.playerKills || []).slice(-6);
    for (const k of ks) {
      const sA = getMap().sites.A, sB = getMap().sites.B;
      if (Math.hypot(k.x - sA.cx, k.y - sA.cy) < Math.hypot(k.x - sB.cx, k.y - sB.cy)) kA++; else kB++;
    }
    const biasA = kA > kB;
    const r = ctx.rand();
    if (biasA && ctx.rand() < 0.6) e.role = 'a';
    else if (!biasA && ctx.rand() < 0.6) e.role = 'b';
    else e.role = r < 0.4 ? 'a' : (r < 0.8 ? 'b' : 'mid');
    e.anchorIdx = Math.floor(ctx.rand() * 4);
    e.objCache = null;
    e.objAt = 0;
    e.igl = i === 0;
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
