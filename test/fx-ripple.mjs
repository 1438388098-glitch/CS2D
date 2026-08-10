// 水面涟漪与倒影特效测试（candidate-306）：rippleRing / rippleAt 纯函数 + drawRipple 绘制 +
// addRipple / pruneRipples 游戏接线 + 全量触发路径（子弹入水/手雷落水/踏水）。
// 契约：涟漪环由 (x,y,t0,r0) 驱动，半径随时间增大封顶、透明度平方衰减、线宽变细；
//       全链路确定性（无 Math.random），game.ripples 由 update 逐帧剪除过期环。
import assert from 'node:assert/strict';
import {
  RIPPLE_LIFE, RIPPLE_R0, RIPPLE_SPEED, RIPPLE_MAX_R, RIPPLE_MAX_ACTIVE,
  rippleAt, rippleRing, makeRipple, addRipple, pruneRipples, drawRipple
} from '../src/water-fx.js';
import { registerMap } from '../src/registry.js';
import { createGame, startMatch, update } from '../src/game.js';
import { fireWeapon } from '../src/combat.js';
import { updateGrenades } from '../src/grenades.js';
import { createEntity } from '../src/entities.js';

// ---- rippleAt 相位辅助 ----
{
  assert.equal(rippleAt(1, 1), 0, 't=t0 phase 0');
  assert.equal(rippleAt(1, 0.5), 0, 't<t0 phase clamped 0');
  assert.equal(rippleAt(1, 1 + RIPPLE_LIFE), 1, 't>=t0+life phase 1');
  const mid = rippleAt(0, RIPPLE_LIFE / 2);
  assert.ok(Math.abs(mid - 0.5) < 1e-12, 'mid phase 0.5');
  assert.equal(rippleAt(NaN, 0.5), 0.5, 'non-finite t0 falls back to 0 (phase=elapsed)');
  assert.ok(rippleAt(0, 0.2) > 0 && rippleAt(0, 0.2) < rippleAt(0, 0.7), 'phase monotonic');
}

// ---- rippleRing 纯函数 ----
{
  const s0 = rippleRing(10, 20, 0, 5);
  assert.deepEqual({ x: s0.x, y: s0.y }, { x: 10, y: 20 }, 'keeps origin');
  assert.ok(s0.r >= 5 && s0.r <= RIPPLE_MAX_R, 'starts at r0');
  assert.equal(s0.alpha, 1, 'fresh ring full alpha');
  assert.ok(s0.width > 1, 'fresh ring thickest');

  const t1 = 0.25, t2 = 0.5, t3 = 0.8;
  const a = rippleRing(0, 0, t1, 5);
  const b = rippleRing(0, 0, t2, 5);
  const c = rippleRing(0, 0, t3, 5);
  assert.ok(a.r < b.r && b.r < c.r, 'radius grows over time');
  assert.ok(a.alpha > b.alpha && b.alpha > c.alpha, 'alpha decays over time');
  assert.ok(a.width > b.width && b.width > c.width, 'width shrinks over time');
  assert.ok(b.alpha > 0 && b.alpha < 1, 'mid alpha in (0,1)');

  const end = rippleRing(0, 0, RIPPLE_LIFE, 5);
  assert.equal(end.alpha, 0, 'expired alpha 0');
  assert.equal(end.width, 1.2, 'expired min width');
  assert.ok(end.r <= RIPPLE_MAX_R, 'expired radius capped');

  const cap = rippleRing(0, 0, 999, 10);
  assert.equal(cap.r, RIPPLE_MAX_R, 'huge t capped at RIPPLE_MAX_R');

  assert.deepEqual(rippleRing(7, 8, 0.3, 4), rippleRing(7, 8, 0.3, 4), 'deterministic same input');
  assert.equal(rippleRing(0, 0, -5, 4).alpha, 1, 'negative t clamps to fresh');
  assert.equal(rippleRing(0, 0, NaN, 4).alpha, 0, 'NaN t clamps to expired');
  assert.equal(rippleRing(0, 0, 0.1, -1).r, RIPPLE_R0 + RIPPLE_SPEED * 0.1, 'negative r0 falls back');
}

// ---- drawRipple 绘制（stub ctx）----
{
  const calls = [];
  const stub = {
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('begin'); },
    arc() { calls.push('arc'); },
    stroke() { calls.push('stroke'); }
  };
  calls.length = 0;
  drawRipple(stub, { x: 4, y: 5, alpha: 0.5, r: 12, width: 2 });
  assert.equal(calls.filter((c) => c === 'arc').length, 2, 'two rings drawn');
  assert.ok(calls[0] === 'save' && calls[calls.length - 1] === 'restore', 'save/restore balanced');
  calls.length = 0;
  drawRipple(stub, { x: 4, y: 5, alpha: 0, r: 12, width: 2 });
  assert.equal(calls.length, 0, 'alpha 0 skips drawing');
  assert.doesNotThrow(() => drawRipple(null, { x: 1, y: 1, alpha: 1, r: 5, width: 1 }), 'null ctx safe');
  assert.doesNotThrow(() => drawRipple(stub, null), 'null fx safe');
}

// ---- makeRipple / addRipple / pruneRipples ----
{
  const g = { time: 2 };
  addRipple(g, 10, 20, 5);
  assert.equal(g.ripples.length, 1, 'addRipple initializes array');
  assert.deepEqual(g.ripples[0], { x: 10, y: 20, t0: 2, r0: 5 }, 'ripple fields');
  assert.deepEqual(makeRipple(3, 4, NaN, 6), { x: 3, y: 4, t0: 0, r0: 6 }, 'makeRipple non-finite t0 -> 0');

  const g2 = { time: 5, ripples: [] };
  for (let i = 0; i < RIPPLE_MAX_ACTIVE + 5; i++) addRipple(g2, i, i, 2);
  assert.equal(g2.ripples.length, RIPPLE_MAX_ACTIVE, 'cap at RIPPLE_MAX_ACTIVE');
  assert.equal(g2.ripples[0].x, 5, 'oldest pruned when capped');

  const g3 = { time: 10, ripples: [
    makeRipple(0, 0, 8, 2),
    makeRipple(0, 0, 9.9, 2)
  ] };
  assert.equal(pruneRipples(g3), 1, 'expired ripple pruned');
  assert.equal(g3.ripples[0].t0, 9.9, 'young ripple kept');
  assert.equal(pruneRipples({ time: 1 }), 0, 'no ripples array safe');
}

// ---- 全量接线：自定义含水地图上验证子弹入水/手雷落水/踏水触发与逐帧剪除 ----
{
  registerMap({
    id: 'fx-ripple-test',
    name: 'fx-ripple-test',
    accent: '#8fd8ff',
    tile: 16,
    allowDisconnected: true,
    rows: (() => {
      const w = 60, h = 45;
      const g = [];
      for (let y = 0; y < h; y++) g.push('.'.repeat(w).split(''));
      const put = (c, x0, y0, x1, y1) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c;
      };
      put('t', 4, 4, 4, 4);
      put('c', 55, 40, 55, 40);
      put('a', 10, 8, 12, 10);
      put('b', 45, 30, 47, 32);
      put('≈', 30, 10, 33, 13); // 深水挡弹池
      return g.map((r) => r.join(''));
    })()
  });

  const game = createGame({ mapId: 'fx-ripple-test', bots: 0 });
  startMatch(game);
  game.state = 'LIVE';
  assert.ok(Array.isArray(game.ripples) && game.ripples.length === 0, 'game.ripples empty after start');

  // 子弹入水：朝深水池边缘射击，入水点应产生涟漪环
  const p = game.player;
  p.x = 300; p.y = 200; p.angle = 0; p.vx = 0; p.vy = 0;
  fireWeapon(p, game);
  assert.ok(game.ripples.length >= 1, 'bullet entering water spawns ripple');
  const bp = game.ripples[game.ripples.length - 1];
  assert.ok(bp.x >= 450 && bp.x <= 560, 'bullet ripple near water pool (got x=' + bp.x + ')');

  // 手雷落水：直接推入水中低速手雷，入水 + 停水各产生涟漪环
  game.grenades.push({ x: 496, y: 192, vx: 5, vy: 0, kind: 'he', fuse: 5, bounces: 0, owner: game.player });
  const before = game.ripples.length;
  updateGrenades(game, 1 / 60);
  assert.ok(game.ripples.length >= before + 1, 'grenade landing in water spawns ripple');

  // 踏水：高速穿过浅/深水的实体产生涟漪环（深水仅涟漪、无浅水水花音频）
  const runner = createEntity('t', false);
  runner.x = 496; runner.y = 192; runner.vx = 300; runner.vy = 0; runner.splashCd = 0;
  game.entities.push(runner);
  game.viewMode = 'follow';
  game.freezeT = 0;
  const beforeStep = game.ripples.length;
  update(game, 1 / 60);
  assert.ok(game.ripples.length > beforeStep, 'entity wading water spawns ripple');

  // 逐帧剪除：移除持续产环的手雷后，涟漪环 RIPPLE_LIFE 秒内被 update 清理
  game.grenades.length = 0;
  for (let i = 0; i < Math.ceil(RIPPLE_LIFE * 60) + 2; i++) update(game, 1 / 60);
  assert.equal(game.ripples.length, 0, 'ripples pruned after RIPPLE_LIFE');

  // 触发确定性：同 seed 重放，入水涟漪位置一致
  const g2 = createGame({ mapId: 'fx-ripple-test', bots: 0 });
  g2.seed = 12345;
  startMatch(g2);
  g2.state = 'LIVE';
  g2.player.x = 300; g2.player.y = 200; g2.player.angle = 0;
  fireWeapon(g2.player, g2);
  const g3 = createGame({ mapId: 'fx-ripple-test', bots: 0 });
  g3.seed = 12345;
  startMatch(g3);
  g3.state = 'LIVE';
  g3.player.x = 300; g3.player.y = 200; g3.player.angle = 0;
  fireWeapon(g3.player, g3);
  const a2 = g2.ripples.map((r) => Math.round(r.x * 10) + ',' + Math.round(r.y * 10));
  const a3 = g3.ripples.map((r) => Math.round(r.x * 10) + ',' + Math.round(r.y * 10));
  assert.deepEqual(a2, a3, 'ripple triggers reproducible under same seed');
}

console.log('fx-ripple: all PASS');
