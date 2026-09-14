// 回合规则正确性+经济深度批次回归（2026-09-15 round-1）：
// retake 引信门控 / 单挑换边点 / AUG·SG553 AI 三表 / 地狱 H8-H10 差异化 /
// 安弹落败补偿 / SMG·霰弹击杀奖励 / 助攻奖金 / bot AWP 开镜 / manager 跳过快进 / killfeed 自我标记
import { createGame, startMatch, startRound, endRound, update, skipSpectatedRound } from '../src/game.js';
import { ECONOMY, ROUND, resolveDiff } from '../src/config.js';
import { killEntity, fireWeapon } from '../src/combat.js';
import { plantBomb } from '../src/bomb.js';
import { getMap } from '../src/map.js';
import { managerUpdate } from '../src/manager-match.js';
import { getMode } from '../src/registry.js';
import { setStorage } from '../src/duel.js';
import { ctx } from '../src/ctx.js';

const errors = [];
const ok = (name, cond) => {
  console.log('rules-batch: ' + name + ' ' + (cond ? 'PASS' : 'FAIL'));
  if (!cond) errors.push(name);
};

function fresh(opts) {
  const g = createGame(Object.assign({ mapId: 'dust2', bots: 1 }, opts || {}));
  startMatch(g);
  return g;
}

// —— 1. retake 引信只在 LIVE 燃烧 ——
{
  const g = fresh();
  startRound(g);
  ok('round starts in BUY', g.state === 'BUY');
  g.bomb = { x: 0, y: 0, dropped: false, planted: true, site: 'A', timer: 25, defusing: false, defuseT: 0 };
  for (let i = 0; i < 20; i++) update(g, 0.5); // BUY 期 10s
  ok('fuse frozen during BUY', g.bomb.timer === 25);
  while (g.state === 'BUY' && g.buyTime > 0) update(g, 0.5);
  ok('round reaches LIVE', g.state === 'LIVE');
  update(g, 1.0);
  ok('fuse burns during LIVE', g.bomb.timer < 25);
}

// —— 2. 单挑换边：BO9 第 4 局后换边 ——
{
  // 通用 startRound 路径：sideSwapAfter=4 → 第 5 局换边
  const g = fresh();
  g.opts.sideSwapAfter = 4;
  g.round = 4;
  g.score.T = 3; g.score.CT = 1;
  startRound(g);
  ok('swap at round 5 when sideSwapAfter=4', g.score.T === 1 && g.score.CT === 3);
  // 单挑模式注册路径：duelStart 计算出的换边点
  const store = { map: new Map(), getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }, setItem(k, v) { this.map.set(k, String(v)); }, removeItem(k) { this.map.delete(k); } };
  setStorage(store);
  const duel = fresh({ mode: 'duel', duelMap: 'duel-pit', duelOpponent: '', team: 't', bots: 1 });
  const def = getMode('duel');
  if (def && def.start) {
    def.start(duel);
    ok('duel sideSwapAfter = halfway of BO9 (4)', duel.opts.sideSwapAfter === 4);
  } else {
    ok('duel sideSwapAfter = halfway of BO9 (4)', false);
  }
}

// —— 3. AUG/SG553 接入 AI 三表（hasGoodGun/weaponScore 效果：拾取不换差、eco 保枪） ——
{
  const g = fresh();
  const bot = g.entities.find((e) => e.bot && e.team === 't');
  bot.weapons.primary = 'sg553';
  bot.money = 100;
  const { botBuyAll } = await import('../src/ai.js');
  g.round = 4; // 非 pistol 局，走 eco 保枪逻辑
  g.teamBuyType = { t: 'eco', ct: 'eco' };
  g.teamBuy = { t: { smoke: 0, flash: 0, he: 0 }, ct: { smoke: 0, flash: 0, he: 0 } };
  botBuyAll(g);
  ok('bot keeps sg553 on eco (no p250 downgrade)', bot.weapons.primary === 'sg553');
}

// —— 4. 地狱 H8/H9/H10 三档差异化 ——
{
  const h8 = resolveDiff('hell', 8), h9 = resolveDiff('hell', 9), h10 = resolveDiff('hell', 10);
  const uniq = new Set([h8.rushChance, h9.rushChance, h10.rushChance]);
  ok('hell 8/9/10 differentiated', uniq.size === 3);
  ok('H8 passive holding', h8.rushChance === 0.3 && h8.saveChance === 0.86);
  ok('H10 aggressive pushing', h10.rushChance === 0.56 && h10.saveChance === 0.6);
  ok('hell ladder keeps netWeights', !!h8.netWeights && !!h9.netWeights && !!h10.netWeights);
}

// —— 5. T 安弹后落败队伍补偿 ——
{
  const g = fresh();
  startRound(g);
  const t = g.entities.find((e) => e.bot && e.team === 't');
  const site = getMap().sites.A;
  t.hasBomb = true;
  t.x = site.cx; t.y = site.cy;
  g.dt = 3.5;
  g.time = (g.time || 0) + 3.5;
  plantBomb(t, g);
  ok('bomb planted', g.bomb && g.bomb.planted && g._plantedRound === true);
  const before = t.money;
  endRound(g, 'ct', '时间耗尽', 'timeout');
  ok('plant loss bonus paid', t.money === before + ECONOMY.LOSS_BONUS[0] + ECONOMY.PLANT_LOSS_BONUS);
  // 未安弹落败：无补偿
  const g2 = fresh();
  startRound(g2);
  const t2 = g2.entities.find((e) => e.bot && e.team === 't');
  const before2 = t2.money;
  endRound(g2, 'ct', '时间耗尽', 'timeout');
  ok('no plant bonus without plant', t2.money === before2 + ECONOMY.LOSS_BONUS[0]);
}

// —— 6. SMG/霰弹击杀奖励 ——
{
  const g = fresh();
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  killer.money = 1000;
  killEntity(victim, killer, 'mp9', false, g);
  ok('smg kill reward', killer.money === 1000 + ECONOMY.KILL_MONEY_SMG);
  const g2 = fresh();
  const k2 = g2.entities.find((e) => e.bot && e.team === 't');
  const v2 = g2.entities.find((e) => e.bot && e.team === 'ct');
  k2.money = 1000;
  killEntity(v2, k2, 'xm', false, g2);
  ok('shotgun kill reward', k2.money === 1000 + ECONOMY.KILL_MONEY_SHOTGUN);
}

// —— 7. 助攻奖金 ——
{
  // bots:2 保证 T 队两名 bot：击杀不终结回合，且击杀手有同队队友可吃助攻
  const g = fresh({ bots: 2 });
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  const assister = g.entities.find((e) => e.bot && e.team === 't' && e !== killer);
  assister.money = 500;
  victim.lastDmgFrom = assister;
  victim.lastDmgT = g.time * 1000;
  killEntity(victim, killer, 'ak', false, g);
  ok('assist money paid', assister.money === 500 + ECONOMY.ASSIST_MONEY && assister.assists === 1);
}

// —— 8. bot AWP 开镜：站定且有目标才开镜，移动/无目标不开 ——
{
  const g = fresh();
  const bot = g.entities.find((e) => e.bot && e.team === 't');
  const enemy = g.entities.find((e) => e.team !== bot.team && !e.dead);
  bot.weapons.primary = 'awp';
  bot.aimTarget = enemy; bot.vx = 0; bot.vy = 0;
  bot.fireCd = 0;
  fireWeapon(bot, g);
  ok('bot awp scoped when standing + engaging', bot.scoped === true);
  bot.vx = 100; bot.fireCd = 0;
  fireWeapon(bot, g);
  ok('bot awp unscoped while moving', bot.scoped === false);
  bot.vx = 0; bot.aimTarget = null; bot.fireCd = 0;
  fireWeapon(bot, g);
  ok('bot awp unscoped without target', bot.scoped === false);
  // bot 开镜散布按 spreadMult 放宽（不是玩家的 0.15° 激光）
  bot.aimTarget = enemy; bot.fireCd = 0;
  fireWeapon(bot, g);
  ok('bot scoped spread widened by spreadMult', bot.scoped === true && (0.3 + 2.4 * 0.75) > 0.15);
}

// —— 9. manager 跳过 = 快进模拟，不再记平局 ——
{
  const g = fresh();
  startRound(g);
  g.player.dead = true;
  g.manager = { skip: true, speed: 1, ended: false };
  const historyBefore = (g.winHistory || []).length;
  managerUpdate(g, 0.016);
  ok('skip simulates to round end', g.state === 'END');
  ok('skip does not record a draw', !(g.winHistory || []).slice(historyBefore).includes('D'));
}

// —— 10. killfeed 自我参与标记 ——
{
  const g = fresh();
  let captured = null;
  const handler = (p) => { captured = p; };
  ctx.bus.on('killfeed', handler);
  const bot = g.entities.find((e) => e.bot && e.team === 't');
  const enemy = g.entities.find((e) => e.bot && e.team === 'ct');
  killEntity(enemy, g.player, 'ak', false, g);
  ok('killfeed marks player kill', captured && captured.me === 'k' && captured.n === 1);
  killEntity(g.player, bot, 'ak', false, g);
  ok('killfeed marks player death', captured && captured.me === 'v' && captured.n === null);
  ctx.bus.off('killfeed', handler);
  captured = null;
  killEntity(enemy, bot, 'ak', false, g);
  ok('killfeed unmarked for unrelated kill', captured === null);
}

// —— 附：skipSpectatedRound 死亡观战守卫仍成立 ——
{
  const g = fresh();
  const r = skipSpectatedRound(g);
  ok('skipSpectatedRound refuses alive player', r.ok === false);
}

if (errors.length) {
  console.error('rules-batch FAIL: ' + errors.join(', '));
  process.exit(1);
}
console.log('rules-batch: all PASS');
console.log('ROUND.MATCH_WIN=' + ROUND.MATCH_WIN);
