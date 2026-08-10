// FX 模块接入渲染/游戏循环的数据流集成测试（candidate-241/244/298/309/310/242 接线）：
//   1) impact-fx：fireRay 命中墙体时写入 game.impacts（{x,y,tileType,t0,seed}），
//      impactMarksAt 可生成弹孔，update 按 IMPACT_LIFE 剪除过期项。
//   2) killcam-fx：killEntity 击杀时写入 game.player.killStreakT / game.killStreak /
//      game.killLabelHead；update 递减；玩家死亡清零；killLabel 输出随 streak/head 变化。
// 契约：全部确定性（无 Math.random 参与数据流状态）、对现有纯函数测试零回归。
import assert from 'node:assert/strict';
import { registerMap } from '../src/registry.js';
import { createGame, startMatch, update } from '../src/game.js';
import { fireWeapon, killEntity } from '../src/combat.js';
import { impactMarksAt, normalizeImpactTile, IMPACT_LIFE } from '../src/impact-fx.js';
import { killLabel, KILL_LABEL_DUR } from '../src/killcam-fx.js';

registerMap({
  id: 'fx-integration-test',
  name: 'fx-integration-test',
  accent: '#8fd8ff',
  tile: 16,
  allowDisconnected: true,
  rows: (() => {
    const w = 40, h = 20;
    const g = [];
    for (let y = 0; y < h; y++) g.push('.'.repeat(20).split('').concat('#'.repeat(20).split('')));
    g[10][2] = 't';
    g[12][35] = 'c';
    return g.map((r) => r.join(''));
  })()
});

// 墙体命中：fireRay 在命中墙体时记录确定性弹孔输入
{
  const g = createGame({ mapId: 'fx-integration-test', bots: 0 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  assert.equal(g.impacts.length, 0, 'impacts initialized empty');

  const p = g.player;
  p.x = 100; p.y = 160; p.angle = 0; p.vx = 0; p.vy = 0; p.fireCd = 0; p.stunT = 0;
  fireWeapon(p, g);
  assert.ok(g.impacts.length >= 1, 'wall hit records impact (got ' + g.impacts.length + ')');

  const im = g.impacts[g.impacts.length - 1];
  assert.ok(Number.isFinite(im.x) && Number.isFinite(im.y), 'impact x/y finite');
  assert.ok(Number.isFinite(im.t0) && im.t0 >= 0, 'impact t0 finite');
  assert.ok(Number.isInteger(im.seed) && im.seed > 0, 'impact seed deterministic positive integer');
  assert.equal(normalizeImpactTile(im.tileType), 'wall', 'wall surface detected via tile char (got ' + im.tileType + ')');

  // impactMarksAt 用 game.time 生成存活弹孔
  const marks = impactMarksAt(g.impacts, g.time);
  assert.ok(marks.length >= 1, 'alive marks generated from game.impacts');
  for (const m of marks) {
    assert.ok(m.alpha > 0, 'alive mark has alpha > 0');
    assert.ok(Number.isFinite(m.size) && m.size > 0, 'mark size finite');
  }

  // update 按 IMPACT_LIFE 剪除过期弹孔
  const frames = Math.ceil((IMPACT_LIFE + 0.5) * 60) + 2;
  for (let i = 0; i < frames; i++) update(g, 1 / 60);
  assert.equal(g.impacts.length, 0, 'expired impacts pruned by update');
}

// 击杀接线：killStreak / killLabelHead / killStreakT 写入 + 递减 + 玩家死亡清零
//（bots:2 保证击杀单名 T bot 不会触发"全灭"提前结束回合）
{
  const g = createGame({ mapId: 'fx-integration-test', bots: 2 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  const p = g.player;
  const tBot = g.entities.find((e) => e.bot && e.team === 't' && !e.dead);
  assert.ok(tBot, 'enemy bot present');

  // 普通击杀：streak=1、head=false
  killEntity(tBot, p, 'ak47', false, g);
  assert.equal(g.killStreak, 1, 'killStreak set to 1 after first kill');
  assert.equal(g.killLabelHead, false, 'killLabelHead false for body shot');
  assert.ok(p.killStreakT > 0, 'killStreakT armed on kill');
  assert.ok(p.killStreakT <= KILL_LABEL_DUR, 'killStreakT bounded by KILL_LABEL_DUR');
  let fx = killLabel('normal', g.killStreak, KILL_LABEL_DUR - p.killStreakT);
  assert.equal(fx.text, 'KILL', 'normal kill label text');

  // 补刀二次击杀：streak=2 → multikill 文案
  tBot.dead = false; tBot.hp = 100; tBot.lastDmgFrom = null; tBot.lastDmgT = -99999;
  killEntity(tBot, p, 'ak47', true, g);
  assert.equal(g.killStreak, 2, 'killStreak increments to 2');
  assert.equal(g.killLabelHead, true, 'killLabelHead true for headshot');
  assert.ok(p.killStreakT > 0, 'killStreakT refreshed on second kill');
  fx = killLabel('multikill', g.killStreak, KILL_LABEL_DUR - p.killStreakT);
  assert.equal(fx.text, 'DOUBLE KILL', 'double kill label text');
  assert.equal(fx.color, '#ff7a3c', 'multikill label color');

  // killStreakT 随 update 递减（先静默 bot 避免 AI 干扰）
  for (const e of g.entities) if (e.bot) e.dead = true;
  const before = p.killStreakT;
  update(g, 1 / 60);
  assert.ok(p.killStreakT < before, 'killStreakT decays over update');
  update(g, 1 / 60);

  // 玩家死亡：击杀标签状态清零
  const otherT = g.entities.find((e) => e.bot && e.team === 't' && !e.dead);
  killEntity(p, otherT, 'ak47', false, g);
  assert.equal(p.killStreakT, 0, 'killStreakT cleared on player death');
  assert.equal(g.killStreak, 0, 'killStreak cleared on player death');
}

// 确定性：同 seed 同操作两次开局 → 击杀产生的 killStreak 状态一致
{
  const mk = () => {
    const g = createGame({ mapId: 'fx-integration-test', bots: 2 });
    g.seed = 4242;
    startMatch(g);
    g.state = 'LIVE';
    g.freezeT = 0;
    const tBot = g.entities.find((e) => e.bot && e.team === 't' && !e.dead);
    killEntity(tBot, g.player, 'ak47', true, g);
    return { streak: g.killStreak, head: g.killLabelHead, t: g.player.killStreakT };
  };
  const a = mk();
  const b = mk();
  assert.equal(a.streak, b.streak, 'killStreak deterministic');
  assert.equal(a.head, b.head, 'killLabelHead deterministic');
  assert.equal(a.t, b.t, 'killStreakT deterministic');
}

console.log('fx-integration: all PASS');
