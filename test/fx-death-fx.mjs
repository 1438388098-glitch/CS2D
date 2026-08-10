// 死亡特效回归测试：deathMarkerSpec 纯函数（闪白 + 星/十字标记）+ killEntity 接线
// 契约：killEntity 设置 v.dead 与 v.deathT=DEATH_MARKER_LIFE；update 逐帧衰减 deathT；
//       deathMarkerSpec(e) 返回 {x,y,alpha,scale,t,flash,shape,rot}（确定性，无随机）
import assert from 'node:assert/strict';
import { deathMarkerSpec, DEATH_MARKER_LIFE, DEATH_FLASH_TIME } from '../src/render.js';
import { createGame, startMatch, update } from '../src/game.js';
import { killEntity } from '../src/combat.js';

const dead = (deathT, x = 0, y = 0) => ({ dead: true, deathT, x, y, team: 't' });

// 刚死亡：t=0，闪白最强，标记从 0.55 弹出、alpha 从 0 淡入
{
  const s = deathMarkerSpec(dead(DEATH_MARKER_LIFE));
  assert.equal(s.t, 0, 'fresh death t=0');
  assert.equal(s.flash, 1, 'fresh death flash full');
  assert.ok(Math.abs(s.scale - 0.55) < 1e-9, 'fresh death marker starts small');
  assert.equal(s.alpha, 0, 'fresh death marker fading in from 0');
  assert.equal(s.x, 0 && s.y, 0, 'fresh death keeps position');
}

// 闪白衰减：flash 在 DEATH_FLASH_TIME 内线性归零，且单调递减
{
  const early = deathMarkerSpec(dead(DEATH_MARKER_LIFE - 0.05));
  const midF = deathMarkerSpec(dead(DEATH_MARKER_LIFE - DEATH_FLASH_TIME / 2));
  const lateF = deathMarkerSpec(dead(DEATH_MARKER_LIFE - DEATH_FLASH_TIME));
  assert.ok(early.flash < 1 && early.flash > 0, 'flash decays from full');
  assert.ok(early.flash > midF.flash && midF.flash > lateF.flash, 'flash monotonic decay');
  assert.ok(Math.abs(lateF.flash) < 1e-9, 'flash gone after DEATH_FLASH_TIME');
  assert.ok(midF.scale > early.scale && midF.scale < 1, 'marker mid pop-in between start and full');
  assert.ok(Math.abs(lateF.scale - 1) < 1e-9, 'marker finished pop-in by DEATH_FLASH_TIME');
}

// 稳定期：alpha=1、scale=1、flash=0，标记持续可见
{
  const s = deathMarkerSpec(dead(DEATH_MARKER_LIFE * 0.5));
  assert.ok(Math.abs(s.t - 0.5) < 1e-9, 'mid t=0.5');
  assert.equal(s.flash, 0, 'mid flash gone');
  assert.equal(s.alpha, 1, 'mid marker fully visible');
  assert.equal(s.scale, 1, 'mid marker full size');
}

// 末段淡出：t>0.7 后 alpha 线性降到 0
{
  const s = deathMarkerSpec(dead(DEATH_MARKER_LIFE * 0.05));
  assert.ok(s.t > 0.9, 'late near expiry');
  assert.ok(s.alpha > 0 && s.alpha < 1, 'late marker fading out');
  assert.equal(s.alpha, (1 - s.t) / 0.3, 'late fade linear');
  const gone = deathMarkerSpec(dead(0));
  assert.equal(gone.alpha, 0, 'expired marker invisible');
  assert.equal(gone.t, 1, 'expired marker t=1');
}

// 存活实体：不产生任何死亡特效
{
  const s = deathMarkerSpec({ dead: false, deathT: DEATH_MARKER_LIFE, x: 10, y: 20, team: 'ct' });
  assert.equal(s.alpha, 0, 'alive alpha=0');
  assert.equal(s.flash, 0, 'alive flash=0');
  assert.equal(s.t, 1, 'alive t=1');
}

// 确定性：同位置形状/旋转可复现；形状限定为星形或十字
{
  const a = deathMarkerSpec(dead(1, 320, 180));
  const b = deathMarkerSpec(dead(1, 320, 180));
  assert.equal(a.shape, b.shape, 'same position same shape');
  assert.equal(a.rot, b.rot, 'same position same rotation');
  assert.ok(a.shape === 'star' || a.shape === 'cross', 'shape is star or cross');
  const c = deathMarkerSpec(dead(1, 321, 180));
  assert.ok(c.shape === 'star' || c.shape === 'cross', 'other position yields valid shape');
}

// killEntity 接线：死亡时设置 deathT；update 逐帧衰减，归零后标记消失
{
  const g = createGame({ mapId: 'dust2', bots: 2 });
  startMatch(g);
  g.state = 'LIVE';
  const b0 = g.entities.find((e) => e.bot && !e.dead);
  assert.ok(b0, 'bot present for kill test');
  killEntity(b0, g.player, 'ak47', false, g);
  assert.equal(b0.dead, true, 'killEntity marks dead');
  assert.equal(b0.deathT, DEATH_MARKER_LIFE, 'killEntity arms deathT to DEATH_MARKER_LIFE');
  assert.equal(DEATH_MARKER_LIFE, 1.8, 'marker lifetime 1.8s');
  assert.ok(DEATH_FLASH_TIME < DEATH_MARKER_LIFE, 'flash shorter than marker life');
  for (const e of g.entities) if (e.bot) e.dead = true;
  update(g, 1 / 60);
  update(g, 1 / 60);
  assert.ok(Math.abs(b0.deathT - (DEATH_MARKER_LIFE - 2 / 60)) < 1e-9, 'deathT drains 2 frames');
  const s = deathMarkerSpec(b0);
  assert.equal(s.alpha > 0, true, 'mid-death marker visible during drain');
  for (let i = 0; i < 120; i++) update(g, 1 / 60);
  assert.equal(b0.deathT, 0, 'deathT reaches zero');
  assert.equal(deathMarkerSpec(b0).alpha, 0, 'marker invisible after expiry');
}

console.log('fx-death-fx: all PASS');
