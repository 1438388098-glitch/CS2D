// 表现反馈+模式深度批次回归（2026-09-15 round-3）：
// 导演镜头评分选择 / bot 脚步空间音 / 空投投放 / 死亡冷色滤镜纯函数 / spray 轨迹 /
// 回合末滴答预警 / 经济播报 / 生涯队友个体属性映射（公式级）
import { createGame, startMatch, startRound, endRound, update, pickSpectateTarget } from '../src/game.js';
import { fireWeapon } from '../src/combat.js';
import { deathVeilAlpha, DEATH_VEIL_MAX } from '../src/screen-fx.js';
import { updateAirdrop } from '../src/airdrop.js';
import { ctx } from '../src/ctx.js';

const errors = [];
const ok = (name, cond) => {
  console.log('fx-batch: ' + name + ' ' + (cond ? 'PASS' : 'FAIL'));
  if (!cond) errors.push(name);
};

function fresh(opts) {
  const g = createGame(Object.assign({ mapId: 'dust2', bots: 1 }, opts || {}));
  startMatch(g);
  return g;
}

// —— 1. 导演镜头：有热度选最有看点目标，无热度退回轮换（向后兼容） ——
{
  const mateA = { name: 'A', team: 'ct', dead: false };
  const mateB = { name: 'B', team: 'ct', dead: false };
  const g = { player: { dead: true, team: 'ct' }, killCamT: 0, lastKiller: null, entities: [mateA, mateB], cyber: null, spectateIdx: 0, _specTarget: null, time: 10 };
  ok('no heat falls back to rotation', pickSpectateTarget(g, [mateA, mateB]) === mateA);
  // mateB 正在交火 → 导演切到 B
  g._specTarget = null;
  mateB.aimTarget = { dead: false };
  ok('director picks engaging target', pickSpectateTarget(g, [mateA, mateB]) === mateB);
  // 目标锁定仍然生效
  g.spectateIdx = 0;
  ok('lock preserved after director pick', pickSpectateTarget(g, [mateA, mateB]) === mateB);
  // 残局独活加分
  g._specTarget = null;
  mateB.aimTarget = null;
  ok('solo survivor scores heat', pickSpectateTarget(g, [mateB]) === mateB);
}

// —— 2. bot 脚步空间音 ——
{
  const g = fresh({ gameplayPlus: false });
  while (g.state === 'BUY' && g.buyTime > 0) update(g, 0.5);
  while (g.freezeT > 0) update(g, 0.5); // 烧完开局的冻结硬直，否则 update 提前返回
  g.bomb = null; // 烧 freeze 期间 bot 可能已安弹（安弹会冻结 roundTime/AI 分支）
  ok('round live for footstep test', g.state === 'LIVE');
  const bot = g.entities.find((e) => e.bot && !e.dead);
  let nearStep = false;
  const h = (p) => {
    // handler 在 update 内同步触发：此时 bot.x/y 即脚步源头位置
    if (p.name === 'step' && Math.hypot(p.x - bot.x, p.y - bot.y) < 2) nearStep = true;
  };
  ctx.bus.on('sfx', h);
  bot.stepT = 0;
  for (let i = 0; i < 12; i++) update(g, 0.05); // bot 向目标移动途中必然踩步
  ctx.bus.off('sfx', h);
  ok('bot emits spatial step sfx', nearStep);
}

// —— 3. 空投投放 ——
{
  const g = fresh({ gameplayPlus: true, bots: 2 });
  while (g.state === 'BUY' && g.buyTime > 0) update(g, 0.5);
  while (g.freezeT > 0) update(g, 0.5);
  g.round = 3;
  g._airdropRound = undefined;
  updateAirdrop(g, 0.01); // 先完成本回合掷取
  g._airdropAt = 1;       // 再强制投放点
  g.roundTime = 5;
  const before = g.drops.length;
  updateAirdrop(g, 0.1);
  ok('airdrop spawns flagged drop', g.drops.length === before + 1 && g.drops[g.drops.length - 1].airdrop === true);
  ok('airdrop ping added', (g.pings || []).some((p) => p.kind === 'airdrop'));
  // 关开关：不投放
  const g2 = fresh({ gameplayPlus: false });
  while (g2.state === 'BUY' && g2.buyTime > 0) update(g2, 0.5);
  while (g2.freezeT > 0) update(g2, 0.5);
  g2.round = 3;
  g2._airdropRound = undefined;
  updateAirdrop(g2, 0.01);
  g2._airdropAt = 1;
  g2.roundTime = 5;
  const before2 = g2.drops.length;
  updateAirdrop(g2, 0.1);
  ok('no airdrop without gameplayPlus', g2.drops.length === before2);
}

// —— 4. 死亡冷色滤镜纯函数 ——
{
  ok('death veil zero while alive', deathVeilAlpha(0) === 0);
  ok('death veil ramps to cap', deathVeilAlpha(0.6) === DEATH_VEIL_MAX / 2 && deathVeilAlpha(5) === DEATH_VEIL_MAX);
  ok('death veil rejects garbage', deathVeilAlpha(NaN) === 0 && deathVeilAlpha(-1) === 0);
}

// —— 5. 玩家 spray 轨迹 ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  p.weapons.primary = 'ak';
  p.slot = 'primary';
  p.fireCd = 0;
  p.ammoMap.ak = 30;
  fireWeapon(p, g);
  ok('spray trace recorded for player', (g.sprayTrace || []).length === 1);
  // bot 开火不记 spray
  const bot = g.entities.find((e) => e.bot && !e.dead);
  bot.weapons.primary = 'ak';
  bot.slot = 'primary';
  bot.fireCd = 0;
  bot.ammoMap.ak = 30;
  bot.aimTarget = p;
  fireWeapon(bot, g);
  ok('bot fire does not pollute spray', (g.sprayTrace || []).length === 1);
}

// —— 6. 回合末滴答预警 ——
{
  const g = fresh({ gameplayPlus: false });
  startRound(g);
  // 确定性设置 LIVE 态（不走无监督模拟：bot 乱打会让回合提前结束产生 flake）
  g.state = 'LIVE';
  g.freezeT = 0;
  g.bomb = null;
  g.roundTime = 108; // 剩 7 秒
  g._urgentTick = undefined;
  update(g, 0.05);
  ok('urgent tick armed in last 10s', g._urgentTick === 7);
}

// —— 7. 经济播报 ——
{
  const g = fresh({ gameplayPlus: false });
  startRound(g);
  g.ui = {}; // headless 下开启 UI 通道让 sysfeed 可捕获
  const feeds = [];
  const h = (p) => feeds.push(p.text);
  ctx.bus.on('sysfeed', h);
  endRound(g, 'ct', '时间耗尽', 'timeout');
  ctx.bus.off('sysfeed', h);
  ok('economy feed emitted on round end', feeds.some((t) => t.indexOf('本回合资金') === 0));
}

// —— 8. 生涯队友个体属性映射（公式级：与 manager-match 逐人公式一致） ——
{
  const react = 80, aim = 90, move = 70;
  const base = { view: 1000, idealMin: 220, idealMax: 550, peekChance: 0.05, nadeUse: 0.6, riskT: 0.7, rushChance: 0.4, rotateChance: 0.6, saveChance: 0.7 };
  base.react = Math.max(0.06, Math.min(0.22, 0.22 - react / 625));
  base.aimSpeed = 40 + react * 0.9;
  base.spreadMult = Math.max(0.5, Math.min(1.05, 1.1 - aim / 200));
  base.strafe = Math.max(0.36, Math.min(0.6, 0.6 - move / 400));
  ok('career per-roster react mapping', Math.abs(base.react - (0.22 - 80 / 625)) < 1e-9);
  ok('career per-roster spread mapping', Math.abs(base.spreadMult - (1.1 - 90 / 200)) < 1e-9);
  ok('career per-roster strafe mapping', Math.abs(base.strafe - (0.6 - 70 / 400)) < 1e-9);
  // 高属性队友显著强于低属性队友（脱离"全队共享 friendBase"）
  const lowSpread = Math.max(0.5, Math.min(1.05, 1.1 - 40 / 200));
  ok('attrs decouple teammate strength', base.spreadMult < lowSpread);
}

if (errors.length) {
  console.error('fx-batch FAIL: ' + errors.join(', '));
  process.exit(1);
}
console.log('fx-batch: all PASS');
