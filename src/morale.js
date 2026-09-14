// 局内士气系统（candidate-597）：回合胜负驱动全队士气 0-100，
// 士气为全队 bot 提供速度/准星恢复微增益（上限 ±6%），连败掉士气清零增益。
// 与生涯赛季层 morale（career）不同，这是对局内动态值；数值向、全队共享。
import { ctx } from './ctx.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export const MORALE_MAX = 100;
export const MORALE_WIN = 12;
export const MORALE_LOSE = 8;

// startMatch/startRound 初始化
export function initMorale(game) {
  if (!game.teamMorale) game.teamMorale = { t: 50, ct: 50 };
}

// endRound 调用：胜负驱动
export function applyMoraleResult(game, winner) {
  if (!game || !winner) return;
  initMorale(game);
  const winKey = winner === 't' ? 't' : 'ct';
  const loseKey = winKey === 't' ? 'ct' : 't';
  const before = game.teamMorale[winKey];
  game.teamMorale[winKey] = Math.min(MORALE_MAX, game.teamMorale[winKey] + MORALE_WIN);
  game.teamMorale[loseKey] = Math.max(0, game.teamMorale[loseKey] - MORALE_LOSE);
  if (game.player && game.teamMorale[game.player.team] !== undefined) {
    const mine = game.teamMorale[game.player.team];
    const diff = game.teamMorale[game.player.team === winKey ? winKey : loseKey] - (game.teamMorale[game.player.team === winKey ? loseKey : winKey]);
    if (diff > 0 && mine > before) emit('sysfeed', { text: '🔥 队伍士气高涨（' + mine + '）' });
    else if (mine < 25) emit('sysfeed', { text: '💤 队伍士气低落（' + mine + '）——稳住节奏' });
  }
}

// 微增益乘数（speedMult/recoverMult 消费）：0-100 士气 → 0.97-1.06
export function moraleMult(morale) {
  const m = Math.max(0, Math.min(MORALE_MAX, Number(morale) || 0));
  return 0.94 + (m / MORALE_MAX) * 0.12;
}

// bot 每回合应用（startRound 后由 game.js 调用）：用 _baseSpeedMult 防复合膨胀
export function applyMoraleToEntities(game) {
  if (!game || !game.teamMorale) return;
  for (const e of game.entities) {
    if (!e.bot) continue;
    if (e._baseSpeedMult === undefined) e._baseSpeedMult = e.speedMult || 1;
    if (e._baseRecoverMult === undefined) e._baseRecoverMult = e.recoverMult || 1;
    const m = game.teamMorale[e.team] || 50;
    e.speedMult = e._baseSpeedMult * moraleMult(m);
    e.recoverMult = e._baseRecoverMult * moraleMult(m); // 准星恢复同样受士气（candidate-626）
  }
}
