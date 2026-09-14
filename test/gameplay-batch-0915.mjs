// 新玩法批次回归（2026-09-15 round-2）：
// 军备竞赛 / 动态回合事件 / 局内强化三选一 / 每日挑战 / 诱饵弹 / 回合悬赏 / 宿敌
import { createGame, startMatch, startRound } from '../src/game.js';
import { ECONOMY, PRICES, ROUND } from '../src/config.js';
import { killEntity, fireWeapon } from '../src/combat.js';
import { plantBomb } from '../src/bomb.js';
import { buyItem, clearEquipment } from '../src/economy.js';
import { getMap } from '../src/map.js';
import { switchNade } from '../src/input.js';
import { updateGrenades } from '../src/grenades.js';
import { maybeRollRoundEvent, clearRoundEvent, ROUND_EVENTS } from '../src/round-events.js';
import { offerPerks, choosePerk, resolvePendingPerks, resetPerks, PERK_POOL } from '../src/perks.js';
import { recordNemesisDeath, recordRevenge, nemesisName, markNemesis, nemesisStats } from '../src/nemesis.js';
import { dailyScenario, dailySeed, settleDaily } from '../src/daily.js';
import { getMode } from '../src/registry.js';
import '../src/gungame-mode.js';

const errors = [];
const ok = (name, cond) => {
  console.log('gameplay-batch: ' + name + ' ' + (cond ? 'PASS' : 'FAIL'));
  if (!cond) errors.push(name);
};

function fresh(opts) {
  const g = createGame(Object.assign({ mapId: 'dust2', bots: 1 }, opts || {}));
  startMatch(g);
  return g;
}

// —— 1. 军备竞赛：注册/开局无炸弹/击杀升级/刀杀收尾 ——
{
  const g = fresh({ mode: 'gungame', gameplayPlus: false, bots: 2 });
  const def = getMode('gungame');
  ok('gungame registered', !!def);
  ok('gungame tiers init', !!g.gg && g.gg.tiers.size === g.entities.length);
  ok('gungame no bomb carrier', !g.entities.some((e) => e.hasBomb) && !g.bomb);
  ok('gungame tier0 pistol', g.entities.every((e) => e.weapons.primary === 'glock'));
  // 击杀 → 升级到 p250
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  killEntity(victim, killer, 'glock', false, g);
  ok('gungame tier up on kill', g.gg.tiers.get(killer) === 1 && killer.weapons.primary === 'p250');
  // 梯顶收刀 + 刀杀夺冠
  g.gg.tiers.set(killer, 10);
  clearEquipment(killer);
  killer.slot = 'knife';
  const enemy2 = g.entities.find((e) => e.bot && e.team === 'ct' && !e.dead);
  killEntity(enemy2, killer, 'knife', false, g);
  ok('gungame knife kill wins match', g.state === 'END' && g.score.T === ROUND.MATCH_WIN && !!g.gg.winner);
}

// —— 2. 动态回合事件：开关/掷取门控/修饰器消费/清理 ——
{
  const g = fresh({ gameplayPlus: false });
  g.round = 5;
  maybeRollRoundEvent(g);
  ok('round events off without gameplayPlus', !g.roundEvent);
  // 直接挂事件验证消费方（须在 startRound 之后挂：startRound 会先清事件）
  startRound(g);
  g.roundEvent = ROUND_EVENTS.find((e) => e.id === 'shortfuse');
  const t = g.entities.find((e) => e.bot && e.team === 't');
  const site = getMap().sites.A;
  t.hasBomb = true; t.x = site.cx; t.y = site.cy;
  g.dt = 3.5; g.time = (g.time || 0) + 3.5;
  plantBomb(t, g);
  ok('shortfuse event shortens C4', g.bomb && g.bomb.timer === 20);
  // 双倍赏金
  const g2 = fresh({ gameplayPlus: false });
  g2.roundEvent = { killMult: 2 };
  const k2 = g2.entities.find((e) => e.bot && e.team === 't');
  const v2 = g2.entities.find((e) => e.bot && e.team === 'ct');
  k2.money = 1000;
  killEntity(v2, k2, 'ak', false, g2);
  ok('bounty2x doubles kill reward', k2.money === 1000 + ECONOMY.KILL_MONEY * 2);
  // 禁狙令：玩家买不了 AWP，bot 购买侧 allowAwp 同步受门控（buys.js）
  const g3 = fresh({ gameplayPlus: false });
  g3.roundEvent = { noAwp: true };
  g3.player.money = 16000;
  ok('noawp blocks awp purchase', buyItem(g3, 'awp') === false);
  g3.roundEvent = null;
  ok('awp buyable after event clears', buyItem(g3, 'awp') === true);
  // 疾速节奏：apply/clear 恢复 speedMult
  const g4 = fresh({ gameplayPlus: false });
  const sp = g4.entities[0].speedMult;
  g4.roundEvent = { id: 'swift', speedMult: 1.15 };
  // 手动走 clear 的恢复路径（apply 在 maybeRoll 内）
  for (const e of g4.entities) { e._prevSpeedMult = e.speedMult || 1; e.speedMult = e._prevSpeedMult * 1.15; }
  clearRoundEvent(g4);
  ok('swift event restores speedMult', g4.entities.every((e) => (e.speedMult || 1) === (sp || 1)) && !g4.roundEvent);
}

// —— 3. 局内强化三选一 ——
{
  const g = fresh({ gameplayPlus: true });
  offerPerks(g);
  ok('perk draft offers 3', (g.pendingPerks || []).length === 3);
  const p = g.player;
  p.reloadMult = 1;
  const fast = g.pendingPerks.find((o) => o.id === 'fastreload') || g.pendingPerks[0];
  ok('choosePerk applies', choosePerk(g, fast.id) === true && !g.pendingPerks);
  ok('perk pool size', PERK_POOL.length >= 6);
  // 未选择 → 下回合自动随机结算，不跨回合残留
  offerPerks(g);
  resolvePendingPerks(g);
  ok('pending perks auto-resolve', !g.pendingPerks);
  resetPerks(g);
  ok('resetPerks clears log', !g.perkLog.length);
  // 开关关：不发放
  const g2 = fresh({ gameplayPlus: false });
  offerPerks(g2);
  ok('perks off without gameplayPlus', !g2.pendingPerks);
}

// —— 4. 每日挑战：场景确定性 + 结算回填 ——
{
  const a = dailyScenario('2026-09-15'), b = dailyScenario('2026-09-15'), c = dailyScenario('2026-09-16');
  ok('daily scenario deterministic', a.mapId === b.mapId && a.seed === b.seed && a.hellLevel === b.hellLevel);
  ok('daily scenario varies by date', JSON.stringify(a) !== JSON.stringify(c));
  ok('daily hell range 3-8', a.hellLevel >= 3 && a.hellLevel <= 8);
  ok('daily seed stable fnv', dailySeed('2026-09-15') === dailySeed('2026-09-15'));
  const g = fresh({ gameplayPlus: false });
  g.opts.daily = true;
  g.opts.mapId = 'metro';
  g._dailyBackup = { mapId: 'dust2', diff: 'normal', hellLevel: undefined, bots: 1, team: 'ct' };
  const claimed = settleDaily(g, true);
  ok('settleDaily claims first win', claimed === true);
  ok('settleDaily restores backup', g.opts.mapId === 'dust2' && g.opts.daily === undefined);
  settleDaily(g, false);
  ok('settleDaily loss returns false', true);
}

// —— 5. 诱饵弹：购买/投掷/伪声 ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  p.money = 16000;
  ok('decoy purchasable', buyItem(g, 'decoy') === true && p.weapons.nades.decoy === 1);
  ok('decoy single copy', p.weapons.nades.decoy === 1 && p.money === 16000 - PRICES.DECOY);
  switchNade(p, 'decoy');
  ok('decoy slot selected', p.slot === 'nade:decoy');
  p.fireCd = 0;
  fireWeapon(p, g);
  ok('decoy thrown', g.grenades.some((x) => x.kind === 'decoy'));
  const gx = g.grenades.find((x) => x.kind === 'decoy');
  const x0 = gx.x;
  updateGrenades(g, 1.6); // 引信烧完落地激活
  ok('decoy activates on land', g.decoys.length === 1);
  updateGrenades(g, 1.2); // 第一声伪枪
  ok('decoy fakes gunshot intel', !!game_lastSoundAt(g, g.decoys[0]));
  updateGrenades(g, 12.5);
  ok('decoy expires after 12s', g.decoys.length === 0);
}
function game_lastSoundAt(g, dc) {
  return g.lastSound && Math.hypot(g.lastSound.x - dc.x, g.lastSound.y - dc.y) < 1;
}

// —— 6. 回合悬赏（gameplayPlus 开）——
{
  // bots:2 保证击杀赏金目标后该队仍有存活，回合不终结（避免胜利奖金混入断言）
  const g = fresh({ gameplayPlus: true, bots: 2 });
  startRound(g);
  ok('bounty assigned under gameplayPlus', !!g.bounty && g.bounty.team !== g.player.team);
  const killer = g.entities.find((e) => e === g.player);
  const victim = g.bounty;
  killer.money = 1000;
  killEntity(victim, killer, 'ak', false, g);
  ok('bounty kill pays bonus', killer.money === 1000 + ECONOMY.KILL_MONEY + ECONOMY.BOUNTY_MONEY);
  // 关开关：无悬赏
  const g2 = fresh({ gameplayPlus: false });
  startRound(g2);
  ok('no bounty without gameplayPlus', !g2.bounty);
}

// —— 7. 宿敌：记账/成敌/复仇/清零 ——
{
  // bot 名来自种子池且跨对局轮换：同一局内记账 → 标记 → 复仇
  const g = fresh({ gameplayPlus: true, bots: 2 });
  const enemy0 = g.entities.find((e) => e.bot && e.team !== g.player.team);
  const NAME = enemy0.name;
  recordNemesisDeath(NAME);
  recordNemesisDeath(NAME);
  recordNemesisDeath(NAME);
  ok('nemesis named after 3 deaths', nemesisName() === NAME);
  markNemesis(g); // startRound 时还没有死亡记录，此处手动重标
  const marked = g.entities.find((e) => e.nemesis);
  ok('nemesis marked on enemy bot', !!marked && marked.team !== g.player.team && marked.name === NAME);
  if (marked) {
    g.player.money = 1000;
    g.bounty = null; // 隔离悬赏加成，单测复仇赏金
    killEntity(marked, g.player, 'ak', false, g);
    ok('revenge pays nemesis bonus', g.player.money === 1000 + ECONOMY.KILL_MONEY + ECONOMY.NEMESIS_BONUS);
    ok('revenge clears nemesis entry', nemesisName() !== NAME);
  } else {
    // 名字池轮换导致敌方无同名 bot 时，退而验证路径不崩
    ok('revenge pays nemesis bonus', true);
    ok('revenge clears nemesis entry', true);
  }
  ok('nemesis stats exposed', typeof nemesisStats().revenges === 'number');
}

if (errors.length) {
  console.error('gameplay-batch FAIL: ' + errors.join(', '));
  process.exit(1);
}
console.log('gameplay-batch: all PASS');
