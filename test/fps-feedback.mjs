// FPS 反馈系统纯逻辑测试（不渲染）：命中停顿 / 伤害数字 / 取消换弹 / 开镜平滑 / 击杀者
// 契约：game.hitPauseT（update 开头冻结）、game.dmgPops（applyDamage 记录）、
//       fireWeapon 扣扳机取消换弹、game.scopeT 平滑、game.lastKiller（击杀者）
import { createGame, startMatch, update } from '../src/game.js';
import { applyDamage, fireWeapon, killEntity } from '../src/combat.js';

function ok(name, cond) {
  if (!cond) throw new Error('fps-feedback: ' + name + ' FAIL');
  console.log('fps-feedback: ' + name + ' PASS');
}

function fresh() {
  const g = createGame({ mapId: 'dust2', bots: 2 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  return g;
}

// 死亡 bot 隔离：避免 AI 干扰（射击/伤害/击杀）污染被测状态
function silenceBots(g) {
  for (const e of g.entities) if (e.bot) e.dead = true;
  g.input.keys = {};
}

// 命中停顿：update 开头冻结世界（hitPauseT 递减，game.time 不推进）
{
  const g = fresh();
  const t0 = g.time;
  g.hitPauseT = 0.06;
  update(g, 1 / 60);
  ok('hitstop drains by dt', Math.abs(g.hitPauseT - 0.0433) < 1e-3);
  ok('hitstop exact dt drain', Math.abs(g.hitPauseT - (0.06 - 1 / 60)) < 1e-9);
  ok('hitstop freezes time', g.time === t0);
  let guard = 0;
  while (g.hitPauseT > 0 && guard < 60) { update(g, 1 / 60); guard++; }
  ok('hitstop unfreezes after drain', g.hitPauseT <= 0 && guard <= 4);
  update(g, 1 / 60);
  ok('hitstop releases time flow', g.time > t0 + 0.01);
}

// dmgPops 记录：applyDamage 记录 {x,y,dmg,head,t:0.8}
{
  const g = fresh();
  const bot = g.entities.find((e) => e.bot);
  bot.dead = false; bot.hp = 100; bot.armor = 0; bot.helmet = false;
  const before = g.dmgPops.length;
  applyDamage(bot, 40, { killer: g.player, weapon: { kind: 'rifle' }, head: false }, g);
  ok('dmgPops appended', g.dmgPops.length === before + 1);
  const pop = g.dmgPops[g.dmgPops.length - 1];
  ok('dmgPops dmg 40', pop && pop.dmg === 40);
  ok('dmgPops head false', pop && pop.head === false);
  ok('dmgPops t 0.8', pop && Math.abs(pop.t - 0.8) < 1e-9);
  g.hitPauseT = 0;
}

// dmgPops 衰减：非命中停顿帧内 t 每帧减 dt，归零移除
{
  const g = fresh();
  silenceBots(g);
  g.hitPauseT = 0;
  const mine = { x: 0, y: 0, dmg: 10, head: false, t: 0.8 };
  g.dmgPops.push(mine);
  update(g, 1 / 60);
  update(g, 1 / 60);
  ok('dmgPops decays 2 frames', Math.abs(mine.t - (0.8 - 2 / 60)) < 1e-9);
  ok('dmgPops ~0.767', Math.abs(mine.t - 0.767) < 1e-3);
}

// 取消换弹：fireWeapon 直调，reloading 时扣扳机即取消（fireCd==0 时生效）
{
  const g = fresh();
  const p = g.player;
  p.reloading = true;
  p.reloadT = 0.5;
  p.fireCd = 0;
  p.stunT = 0;
  fireWeapon(p, g);
  ok('fireWeapon cancels reload', p.reloading === false);
  ok('fireWeapon clears reloadT', p.reloadT === 0);
}

// scopeT 平滑：开镜趋近 1（updatePlayer 按 10/s 指数趋近，需 20 帧到 ~0.97）
{
  const g = fresh();
  silenceBots(g);
  const p = g.player;
  g.viewMode = 'fps';
  p.slot = 'primary';
  p.weapons.primary = 'awp';
  g.input.mouse.rdown = true;
  g.scopeT = 0;
  for (let i = 0; i < 20; i++) update(g, 1 / 60);
  ok('scopeT ramps toward 1', g.scopeT > 0.9);
}

// lastKiller：仅当玩家阵亡时记录击杀者；bot 阵亡不影响
{
  const g = fresh();
  const b0 = g.entities.find((e) => e.bot && !e.dead);
  const b1 = g.entities.find((e) => e.bot && e !== b0) || b0;
  killEntity(b0, b1, 'ak47', true, g);
  ok('bot kill keeps lastKiller null', g.lastKiller === null);
  killEntity(g.player, b1, 'ak47', false, g);
  ok('player kill sets lastKiller', g.lastKiller === b1);
}

console.log('fps-feedback: all PASS');
