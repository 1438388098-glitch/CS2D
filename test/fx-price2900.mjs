// 技能价格 2900 档（candidate-147）：FAMAS 中间步枪定价 2900 与 bot 购买/购买校验回归
// 纯逻辑、确定性：不读 Date/performance，结果仅由入参决定
import { WEAPONS, PRICES } from '../src/config.js';
import { createGame, startMatch } from '../src/game.js';
import { buyItem } from '../src/economy.js';
import { botBuyAll } from '../src/ai.js';
import { hasGoodGun } from '../src/ai/shared.js';
import { ctx } from '../src/ctx.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-price2900: ' + name + ' FAIL');
  console.log('fx-price2900: ' + name + ' PASS');
}

const dps = (w) => w.dmg * (w.rpm / 60);

// ---- 注册与档位 ----
ok('famas registered at 2900', WEAPONS.famas && WEAPONS.famas.price === 2900);
ok('famas is rifle', WEAPONS.famas.kind === 'rifle' && WEAPONS.famas.auto === true);
ok('2900 unique tier', Object.keys(WEAPONS).filter((id) => WEAPONS[id].price === 2900).length === 1);
ok('2900 between ak(2700) and m4(3100)', WEAPONS.ak.price < 2900 && 2900 < WEAPONS.m4.price);
ok('famas dps between ak and m4', dps(WEAPONS.ak) > dps(WEAPONS.famas) && dps(WEAPONS.famas) > dps(WEAPONS.m4));
ok('famas dmg between ak and m4', WEAPONS.m4.dmg < WEAPONS.famas.dmg && WEAPONS.famas.dmg < WEAPONS.ak.dmg);
ok('famas spread between ak and m4', WEAPONS.m4.spread < WEAPONS.famas.spread && WEAPONS.famas.spread < WEAPONS.ak.spread);

// ---- buyItem 购买校验（economy.js）----
function fresh() {
  const g = createGame({ mapId: 'dust2', bots: 1 });
  startMatch(g);
  g.state = 'BUY';
  return g;
}

{
  const g = fresh();
  const p = g.player;
  p.money = 3000;
  p.weapons.primary = null;
  ok('buyItem famas deducts 2900', buyItem(g, 'famas') === true && p.money === 100 && p.weapons.primary === 'famas');
  ok('buyItem famas sets ammo', p.ammoMap.famas === WEAPONS.famas.mag && p.reserveMap.famas === WEAPONS.famas.reserve);
}

{
  const g = fresh();
  const p = g.player;
  p.money = 2000;
  p.weapons.primary = null;
  ok('buyItem famas rejects short money', buyItem(g, 'famas') === false && p.weapons.primary === null && p.money === 2000);
}

{
  const g = fresh();
  const p = g.player;
  p.money = 4000;
  p.weapons.primary = 'ak';
  const before = g.drops.length;
  ok('buyItem famas drops old primary', buyItem(g, 'famas') === true && g.drops.length === before + 1 && g.drops[g.drops.length - 1].wid === 'ak');
}

{
  const g = fresh();
  const p = g.player;
  p.money = 5000;
  p.weapons.primary = 'famas';
  ok('buyItem famas rejects duplicate', buyItem(g, 'famas') === false && p.money === 5000);
}

// ---- bot 购买决策（ai/buys.js）----
function freshBotGame() {
  const g = createGame({ mapId: 'dust2', bots: 5 });
  startMatch(g);
  g.round = 3;
  g.roundPlan = {};
  return g;
}

function setupBot(g, team, money, round, lossStreak) {
  const bot = g.entities.find((e) => e.bot && e.team === team);
  bot.archetype = 'rifler';
  bot.money = money;
  bot.weapons.primary = null;
  bot.weapons.nades = { he: 0, flash: 0, smoke: 0 };
  bot.armor = 0;
  bot.helmet = false;
  g.round = round;
  if (team === 't') g.lossStreakT = lossStreak; else g.lossStreakCT = lossStreak;
  return bot;
}

{
  // CT 中段经济 [3550,3750) → 买 FAMAS+甲（2900 档全买）
  const g = freshBotGame();
  const bot = setupBot(g, 'ct', 3600, 3, 0);
  botBuyAll(g);
  ok('ct mid-budget buys famas+armor', bot.weapons.primary === 'famas' && bot.armor === 100 && bot.money >= 0);
  ok('ct mid-budget no debt', bot.money >= 0);
}

{
  // 边界：3749 买 FAMAS+甲，3750 回落到 M4+甲
  const a = freshBotGame();
  const botA = setupBot(a, 'ct', 3749, 3, 0);
  botBuyAll(a);
  ok('ct boundary 3749 famas+armor', botA.weapons.primary === 'famas' && botA.armor === 100);
  const b = freshBotGame();
  const botB = setupBot(b, 'ct', 3750, 3, 0);
  botBuyAll(b);
  ok('ct boundary 3750 m4+armor', botB.weapons.primary === 'm4' && botB.armor === 100);
}

{
  // CT 连败强制局 → 2900 档半买步枪（FAMAS 为 CT 专用经济步枪）
  const g = freshBotGame();
  const bot = setupBot(g, 'ct', 3000, 4, 3);
  botBuyAll(g);
  ok('ct force buys famas half-buy', bot.weapons.primary === 'famas' && bot.money >= 0);
  ok('ct force buys famas cost 2900', 3000 - bot.money === WEAPONS.famas.price);
}

{
  // T 连败强制局 → 无 FAMAS（T 专属经济不变，回落冲锋枪）
  const g = freshBotGame();
  const bot = setupBot(g, 't', 3000, 4, 3);
  botBuyAll(g);
  ok('t force below famas stays smg', bot.weapons.primary === 'mac10' && bot.money >= 0);
}

{
  // 边界：CT 连败 2900 整 → FAMAS，2899 → 冲锋枪
  const a = freshBotGame();
  const botA = setupBot(a, 'ct', 2900, 4, 3);
  botBuyAll(a);
  ok('ct force boundary 2900 famas', botA.weapons.primary === 'famas');
  const b = freshBotGame();
  const botB = setupBot(b, 'ct', 2899, 4, 3);
  botBuyAll(b);
  ok('ct force boundary 2899 smg', botB.weapons.primary === 'mp9');
}

{
  // 识别：FAMAS 算好枪（持枪不再降级购买）
  ok('hasGoodGun famas', hasGoodGun({ weapons: { primary: 'famas' } }) === true);
  ok('hasGoodGun ak still true', hasGoodGun({ weapons: { primary: 'ak' } }) === true);
  ok('hasGoodGun p250 still false', hasGoodGun({ weapons: { primary: 'p250' } }) === false);
}

// ---- 确定性：同入参同结果 ----
{
  const savedRand = ctx.rand;
  ctx.rand = () => 0.5;
  const g1 = freshBotGame();
  const b1 = setupBot(g1, 'ct', 3600, 3, 0);
  botBuyAll(g1);
  const state1 = b1.weapons.primary + ':' + b1.armor + ':' + b1.money;
  const g2 = freshBotGame();
  const b2 = setupBot(g2, 'ct', 3600, 3, 0);
  botBuyAll(g2);
  const state2 = b2.weapons.primary + ':' + b2.armor + ':' + b2.money;
  ctx.rand = savedRand;
  ok('deterministic famas buy', state1 === state2 && state1 === 'famas:100:50');
}

console.log('fx-price2900: all PASS');
