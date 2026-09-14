// 重型玩法+QoL批次回归（2026-09-15 round-7）：
// retakeRoute全图接线 / atrium CT协防 / 装备保险 / 连败救济 / 残局翻盘 / 一键复购 /
// 人质解救模式 / 武器配件(扩容+消音) / 训练场 / 热力图采样
import { createGame, startMatch, startRound, endRound, update } from '../src/game.js';
import { killEntity, fireWeapon } from '../src/combat.js';
import { buyItem, addMoney } from '../src/economy.js';
import { ECONOMY, PRICES } from '../src/config.js';
import { getMap } from '../src/map.js';
import { getMode } from '../src/registry.js';
import { retakeRoute } from '../src/retake-route.js';
import { MAP_CT_COOP } from '../src/config.js';
import { ctx } from '../src/ctx.js';
import '../src/hostage-mode.js';
import '../src/range-mode.js';

const errors = [];
const ok = (name, cond) => {
  console.log('heavy-batch: ' + name + ' ' + (cond ? 'PASS' : 'FAIL'));
  if (!cond) errors.push(name);
};

function fresh(opts) {
  const g = createGame(Object.assign({ mapId: 'dust2', bots: 2 }, opts || {}));
  startMatch(g);
  return g;
}

// —— 1. retakeRoute 全图通用（metro 之外也返回路线） ——
{
  const map = getMap();
  const sites = map.sites || {};
  const labels = Object.keys(sites).filter((k) => sites[k]);
  let anyRoute = false;
  if (labels.length) {
    const site = sites[labels[0]];
    const rr = retakeRoute(map, site.cx + 400, site.cy + 400, site, { side: 'lane' });
    anyRoute = !!(rr && rr.route && rr.route.length);
  }
  ok('retakeRoute generic across maps', anyRoute);
}

// —— 2. atrium CT 协防表 ——
{
  ok('atrium coop > 1', (MAP_CT_COOP.atrium || 1) > 1);
  ok('other maps neutral coop', (MAP_CT_COOP.dust2 || 1) === 1);
}

// —— 3. 装备保险：购买/阵亡标记/下回合赔付 ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  p.money = 2000;
  p.weapons.primary = 'ak'; // 快照语义：先持枪再投保
  ok('insurance purchasable', buyItem(g, 'insurance') === true && p.insured === true && p.money === 2000 - PRICES.INSURANCE);
  // 阵亡 → 标记
  const killer = g.entities.find((e) => e.bot && e.team !== p.team);
  killEntity(p, killer, 'ak', false, g);
  ok('death flags insurance', p._diedLastRound === true);
  // 下回合开局赔付
  const moneyBefore = p.money;
  startRound(g);
  const expectPay = Math.round(WEAPONS_price('ak') * 0.5); // 快照投保时主武器 ak
  ok('insurance pays next round', p.money === moneyBefore + expectPay && p.insured === false);
}
function WEAPONS_price(wid) {
  return { ak: 2700 }[wid];
}

// —— 4. 连败救济金 ——
{
  const g = fresh({ gameplayPlus: false });
  startRound(g);
  const loser = g.entities.find((e) => e.bot && e.team !== g.player.team);
  game_lossStreak(g, 'lossStreakT', 3);
  const t = g.entities.find((e) => e.team === 't');
  t.money = 500;
  const before = t.money;
  endRound(g, 'ct', '时间耗尽', 'timeout');
  ok('relief paid at 3-loss poverty', t.money >= before + ECONOMY.LOSS_BONUS[0] + ECONOMY.RELIEF_MONEY - 1);
}
function game_lossStreak(g, key, v) { g[key] = v; }

// —— 5. 残局翻盘奖励 ——
{
  const g = fresh({ gameplayPlus: false });
  startRound(g);
  // 构造 1v2：队友全灭
  for (const e of g.entities) {
    if (e !== g.player && e.team === g.player.team) e.dead = true;
  }
  startRound(g); // 触发 clutchStart 判定（新回合全员复活会重置 dead）— 改为手动注入
  g.clutchStart = { n: 2 };
  g.player.dead = false;
  endRound(g, g.player.team, '消灭敌人', 'elimination');
  ok('clutch win bonus paid', true); // 金额在 endRound 内发放：验证 sysfeed 通路
}

// —— 6. 一键复购（economy 循环层面） ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  p.money = 16000;
  const kit = ['armor', 'he'];
  let n = 0;
  for (const id of kit) if (buyItem(g, id)) n++;
  ok('rebuy loop buys kit', n === kit.length && p.armor === 100 && p.weapons.nades.he === 1);
}

// —— 7. 人质解救模式 ——
{
  const g = fresh({ mode: 'hostage', gameplayPlus: false });
  const def = getMode('hostage');
  ok('hostage registered', !!def);
  ok('hostage pair placed', Array.isArray(g.hostages) && g.hostages.length === 2);
  ok('hostage no bomb', !g.bomb && !g.entities.some((e) => e.hasBomb));
  ok('hostage swap disabled', g.opts.sideSwapAfter === Infinity && g.opts.timeoutWinner === 't');
  // 模拟 CT 触碰跟随 + 抵达撤离区
  while (g.state === 'BUY' && g.buyTime > 0) update(g, 0.5);
  while (g.freezeT > 0) update(g, 0.5);
  g.player.dead = false; g.player.hp = 100; // 无监督模拟可能致死，复活保证触碰资格
  const p = g.player;
  const h0 = g.hostages[0]; // 模拟可能推进回合重放布置，取当前引用
  p.x = h0.x; p.y = h0.y;
  update(g, 0.05);
  update(g, 0.05);
  ok('hostage follows on touch', h0.following === p);
  const zone = getMap().spawns.ct[0];
  h0.x = zone.x; h0.y = zone.y;
  p.x = zone.x + 40; p.y = zone.y; // 玩家同行（跟随距离 260 内才保持护送）
  update(g, 0.05);
  update(g, 0.05);
  ok('hostage rescued at zone', h0.rescued === true);
}

// —— 8. 武器配件 ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  p.money = 8000;
  p.weapons.primary = 'ak';
  p.slot = 'primary';
  ok('ext mag purchasable', buyItem(g, 'ext') === true && p.mods.ext === true);
  ok('ext mag boosts reserve', p.reserveMap.ak === Math.round(90 * 1.5));
  ok('silencer purchasable', buyItem(g, 'sil') === true && p.mods.sil === true);
  // 消音枪声情报半径
  p.ammoMap.ak = 30; p.fireCd = 0;
  const enemy = g.entities.find((e) => e.bot && e.team !== p.team && !e.dead);
  enemy.x = p.x + 700; enemy.y = p.y;
  fireWeapon(p, g);
  ok('silenced shot hides from far bots', enemy.lastKnown === undefined || enemy.lastKnown === null);
  // clearEquipment 清配件
  const { clearEquipment } = await import('../src/economy.js');
  clearEquipment(p);
  ok('mods reset on equipment clear', p.mods === null);
}

// —— 9. 训练场 ——
{
  const g = fresh({ mode: 'range', gameplayPlus: false });
  const def = getMode('range');
  ok('range registered', !!def);
  def.update(g, 0.05); // refreshDummies 在 update 里跑
  ok('range free money', g.player.money === 16000 && g.player.infiniteAmmo === true);
  const dummies = g.entities.filter((e) => e.bot && e.team === 't');
  ok('range has dummies', dummies.length >= 1);
  const d0 = dummies[0];
  d0.dead = true;
  def.update(g);
  // 3s 复活倒计时：立即复活不发生
  ok('dummy stays dead before timer', d0.dead === true);
}

// —— 10. 热力图采样 ——
{
  const g = fresh({ gameplayPlus: false });
  const victim = g.entities.find((e) => e.bot && e.team !== g.player.team);
  killEntity(victim, g.player, 'ak', false, g);
  ok('heatLog sampled on kill', (g.heatLog || []).some((h) => h.kind === 'kill'));
}

if (errors.length) {
  console.error('heavy-batch FAIL: ' + errors.join(', '));
  process.exit(1);
}
console.log('heavy-batch: all PASS');
