// 战斗视觉（Round 5）契约测试：burst-fx 金色迸发/余烬生成与绘制规格。
// 契约：
//   spawnGoldBurst —— 爆头生成 8 颗 gspark 条纹粒子（速度有限、寿命 0.25-0.5s）；
//                     非爆头/非法 spawn 返回 0 不生成。
//   spawnEmbers —— 生成 n 颗 ember（vy 向上、带相位、寿命 1.2-2.2 / maxLife 2.2）。
//   goldStreakSpec —— 条纹长度随速度增长夹在 [3,12]，方向归一，零速退化默认方向。
//   emberSpec —— alpha 随寿命线性衰减 × 相位闪烁 ∈ [0,1]；t<0.5 橙黄、≥0.5 暗红。
import assert from 'node:assert/strict';
import { spawnGoldBurst, spawnEmbers, emberSpec, goldStreakSpec } from '../src/burst-fx.js';

function stubGame() {
  return { particles: [], _particlePool: [] };
}
function spawnRecorder(game) {
  return (g, props) => {
    assert.equal(g, game, 'spawn receives same game');
    game.particles.push(Object.assign({}, props));
  };
}

{
  const game = stubGame();
  const n = spawnGoldBurst(game, spawnRecorder(game), 100, 80, Math.PI / 4, true);
  assert.equal(n, 8, '8 gold sparks on headshot');
  assert.equal(game.particles.length, 8, 'particles pushed');
  for (const p of game.particles) {
    assert.equal(p.kind, 'gspark', 'kind gspark');
    assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy), 'finite velocity');
    assert.ok(p.life >= 0.25 && p.life <= 0.5, 'life range');
    assert.equal(p.x, 100, 'spawn at hit point');
  }
  const g2 = stubGame();
  assert.equal(spawnGoldBurst(g2, spawnRecorder(g2), 1, 1, 0, false), 0, 'non-head spawns none');
  assert.equal(g2.particles.length, 0, 'no particles on non-head');
  const g3 = stubGame();
  assert.equal(spawnGoldBurst(g3, null, 1, 1, 0, true), 0, 'invalid spawn fn safe');
}

{
  const game = stubGame();
  const n = spawnEmbers(game, spawnRecorder(game), 50, 60, 12, 46);
  assert.equal(n, 12, 'ember count');
  for (const p of game.particles) {
    assert.equal(p.kind, 'ember', 'kind ember');
    assert.ok(p.vy < 0, 'embers rise');
    assert.ok(p.life >= 1.2 && p.life <= 2.2, 'life range');
    assert.equal(p.maxLife, 2.2, 'maxLife pinned');
    assert.ok(Number.isFinite(p.phase), 'phase finite');
  }
  assert.equal(spawnEmbers(null, spawnRecorder(game), 0, 0, 5), 0, 'null game safe');
}

{
  const fresh = emberSpec({ life: 2.2, maxLife: 2.2, size: 2, phase: 0 });
  const mid = emberSpec({ life: 1.1, maxLife: 2.2, size: 2, phase: 0 });
  const dead = emberSpec({ life: 0, maxLife: 2.2, size: 2, phase: 0 });
  assert.ok(fresh.alpha > mid.alpha, 'alpha decays with life');
  assert.equal(dead.alpha, 0, 'dead ember invisible');
  assert.ok(fresh.color.startsWith('rgba(255,170,70,'), 'fresh orange');
  assert.ok(dead.color.startsWith('rgba(220,90,40,'), 'dead dark red');

  const fast = goldStreakSpec({ vx: 400, vy: 0 });
  assert.equal(fast.len, 12, 'len clamps to 12');
  const slow = goldStreakSpec({ vx: 0, vy: 0 });
  assert.equal(slow.len, 3, 'zero speed min len');
  const diag = goldStreakSpec({ vx: 60, vy: 60 });
  assert.ok(Math.abs(diag.ux - Math.SQRT1_2) < 1e-9, 'direction normalized');
}

console.log('burst-fx: all PASS');
