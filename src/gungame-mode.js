// 军备竞赛：击杀即升下一级武器梯，梯顶收刀，刀杀收尾者夺冠。
// 经典 killfeed 事件流 + 购买系统的零侵入拼装：回合制载体，死亡不重置梯阶，
// 换边清装备后按梯阶重新配枪（ggUpdate 兜底）。禁用地面掉落拾取保持梯阶纯净。
import { registerMode } from './registry.js';
import { setupMatchEntities, startRound, endRound } from './game.js';
import { WEAPONS, ROUND } from './config.js';
import { clearEquipment } from './economy.js';
import { ctx } from './ctx.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

const GG_LADDER = ['glock', 'p250', 'deagle', 'mp9', 'mac10', 'xm', 'famas', 'sg553', 'aug', 'awp'];

function ggGive(e, game) {
  const idx = game.gg.tiers.get(e) || 0;
  clearEquipment(e);
  if (idx >= GG_LADDER.length) {
    // 梯顶收刀：只剩战术刀，下一次刀杀夺冠
    e.slot = 'knife';
    return;
  }
  const wid = GG_LADDER[idx];
  e.weapons.primary = wid;
  e.slot = 'primary';
  e.ammoMap[wid] = WEAPONS[wid].mag;
  e.reserveMap[wid] = WEAPONS[wid].reserve;
}

function ggName(idx) {
  return idx >= GG_LADDER.length ? '战术刀（刀杀收尾！）' : WEAPONS[GG_LADDER[idx]].name;
}

function ggOnKill(game, killer) {
  if (!killer || killer.dead) return;
  const idx = game.gg.tiers.get(killer) || 0;
  if (idx >= GG_LADDER.length) {
    // 刀杀收尾：直接夺冠（endRound 记分后把该队分数顶到赛点，finishMatch 据此收尾）
    game.gg.winner = killer;
    endRound(game, killer.team, killer.name + ' 军备登峰 · 刀杀收尾！', 'gg');
    game.score[killer.team === 't' ? 'T' : 'CT'] = game.matchWin || ROUND.MATCH_WIN;
    return;
  }
  game.gg.tiers.set(killer, idx + 1);
  ggGive(killer, game);
  emit('sysfeed', { text: (killer === game.player ? '你升级 → ' : killer.name + ' 升级 → ') + ggName(game.gg.tiers.get(killer)) });
  if (killer === game.player) emit('sfx', { name: 'buy', vol: 0.7, game });
}

function ggRoundRefresh(game) {
  // 每回合开始：按梯阶重新配枪（覆盖换边 clearEquipment / 掉落污染），并清掉炸弹逻辑
  if (game._ggRound === game.round) return;
  game._ggRound = game.round;
  for (const e of game.entities) {
    e.hasBomb = false;
    ggGive(e, game);
  }
  game.bomb = null;
  game.drops.length = 0;
}

function ggStart(game) {
  game.noRoundEnd = false;
  if (game._ggOff) { game._ggOff(); game._ggOff = null; }
  setupMatchEntities(game);
  startRound(game);
  game.gg = { tiers: new Map(), winner: null };
  for (const e of game.entities) game.gg.tiers.set(e, 0);
  ggRoundRefresh(game);
  emit('sysfeed', { text: '军备竞赛：击杀升级武器，刀杀收尾夺冠！' });
  game._ggOff = ctx.bus.on('entityKill', (p) => {
    if (p.game !== game || game.over || game.gg.winner) return;
    ggOnKill(game, p.killer);
  });
}

function ggUpdate(game) {
  if (!game.gg || game.over) return;
  ggRoundRefresh(game);
  game.drops.length = 0;
}

function ggFinish(game) {
  if (game._ggOff) { game._ggOff(); game._ggOff = null; }
}

registerMode({
  id: 'gungame',
  name: '军备竞赛',
  desc: '击杀升级 · 刀杀收尾',
  customBots: false,
  start: ggStart,
  update: ggUpdate,
  onFinish: ggFinish
});
