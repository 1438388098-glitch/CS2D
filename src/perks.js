// 局内强化三选一：经典模式赢下回合后从池中抽 3 个增益，玩家点选一个，下回合起生效。
// 复用实体既有乘数钩子（speedMult/reloadMult/nadeMult/recoverMult），整局累积，换边/开新局清零。
import { ctx } from './ctx.js';
import { rand } from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export const PERK_POOL = [
  { id: 'fastreload', name: '快速换弹', desc: '换弹速度 +20%', apply: (e) => { e.reloadMult = (e.reloadMult || 1) * 0.8; } },
  { id: 'swift', name: '轻装疾行', desc: '移动速度 +8%', apply: (e) => { e.speedMult = (e.speedMult || 1) * 1.08; } },
  { id: 'nadeup', name: '投掷专精', desc: '投掷物伤害 +25%', apply: (e) => { e.nadeMult = (e.nadeMult || 1) + 0.25; } },
  { id: 'steady', name: '稳如磐石', desc: '准星恢复 +30%', apply: (e) => { e.recoverMult = (e.recoverMult || 1) + 0.3; } },
  { id: 'medic', name: '战地医疗', desc: '立即回复 35 HP', apply: (e) => { e.hp = Math.min(100, (e.hp || 0) + 35); } },
  { id: 'plating', name: '板甲加持', desc: '获得 50 点护甲', apply: (e) => { e.armor = Math.min(100, (e.armor || 0) + 50); } }
];

export function perksEnabled(game) {
  return !!game && !game.mode && game.opts.gameplayPlus === true && game.opts.perks !== false && !!game.player;
}

// endRound 玩家方获胜时调用：抽 3 个不重复增益进入待选
export function offerPerks(game) {
  if (!perksEnabled(game)) return;
  const pool = PERK_POOL.slice();
  const options = [];
  while (options.length < 3 && pool.length) {
    options.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  game.pendingPerks = options;
  emit('perkDraft', { options });
}

// UI 点选（ui.js 调用）：应用增益并结束待选
export function choosePerk(game, id) {
  const p = game && game.player;
  const opt = (game.pendingPerks || []).find((o) => o.id === id);
  if (!p || !opt) return false;
  opt.apply(p);
  game.perkLog = game.perkLog || [];
  game.perkLog.push(opt.id);
  game.pendingPerks = null;
  emit('perkDraftHide');
  emit('toast', { text: '强化生效：' + opt.name + ' — ' + opt.desc });
  emit('sfx', { name: 'buy', vol: 0.7, game });
  return true;
}

// startRound 兜底：玩家没来得及选则自动随机一个，保证待选不跨回合残留
export function resolvePendingPerks(game) {
  if (!game || !game.pendingPerks) return;
  const opt = game.pendingPerks[Math.floor(rand() * game.pendingPerks.length)];
  choosePerk(game, opt.id);
}

// 对局重置（startMatch/换边）：清空待选与已获强化痕迹
export function resetPerks(game) {
  if (!game) return;
  game.pendingPerks = null;
  game.perkLog = [];
  emit('perkDraftHide');
}
