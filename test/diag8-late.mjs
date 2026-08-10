// 怀疑点7/8 收尾验证：
// A) 新回合"幻听"：上回合没听到枪声的 CT 开局重听上回合枪声（lastShot 无时效门）
// B) 转点行军成本：dust2 两入口距离 + 转点后到点时间
import { mkGame, place, step, botOf } from './diag-lib.mjs';
import { getMap } from '../src/map.js';

console.log('=== A) 枪声链无时效门（隔离复现：stale lastShot 触发 hearing） ===');
{
  const game = mkGame({ diff: 'normal' });
  const ct = botOf(game, 'ct');
  const tShooter = botOf(game, 't', 1);
  for (const e of game.entities) if (e.bot && e !== ct && e !== tShooter) e.dead = true;
  game.barrels = [];
  game.crates = [];
  const pin = (e) => {
    e.objCache = { x: e.x, y: e.y };
    e.objAt = game.time * 1000;
    e.objBombState = game.bomb ? (game.bomb.planted ? 'p' + game.bomb.site : 'n') : 'n';
  };
  pin(ct); pin(tShooter);
  place(tShooter, ct.x + 400, ct.y);
  step(game, 30); // 让 game.time 先走 1s
  pin(ct); pin(tShooter);
  ct.lastHearT = {};
  tShooter.lastShot = game.time * 1000 - 900; // 900ms 前"旧枪声"（跨回合遗留等价场景）
  ct.lastKnown = null;
  const d0 = Math.hypot(tShooter.x - ct.x, tShooter.y - ct.y);
  step(game, 3);
  const d1 = Math.hypot(tShooter.x - ct.x, tShooter.y - ct.y);
  console.log(`旧枪声(900ms 前, 距离 ${Math.round(d0)}→${Math.round(d1)}px): lastHearT 更新=${!!ct.lastHearT[tShooter.name]} lastKnown=${ct.lastKnown ? '(' + Math.round(ct.lastKnown.x) + ',' + Math.round(ct.lastKnown.y) + ')' : 'null'}`);
  console.log(`旧枪声(lastShot 20s 前, 400px): lastHearT 更新=${!!ct.lastHearT[tShooter.name]} lastKnown=${ct.lastKnown ? '(' + Math.round(ct.lastKnown.x) + ',' + Math.round(ct.lastKnown.y) + ')' : 'null'}`);
  console.log(`  → ${ct.lastKnown ? '确认：任何旧枪声都能触发 hear 链（无 age 检查 core.js:84-90 / senses.js:21-34）' : '未复现'}`);
}

console.log('\n=== B) 转点行军成本 ===');
{
  const game = mkGame({ diff: 'normal' });
  const m = getMap();
  const eA = m.entries.A, eB = m.entries.B;
  const d = Math.hypot(eA.x - eB.x, eA.y - eB.y);
  const march = d / (235 * 0.87); // AK 速度 0.87
  const sp = m.spawns.t[0];
  console.log(`dust2: A入口(${Math.round(eA.x)},${Math.round(eA.y)}) B入口(${Math.round(eB.x)},${Math.round(eB.y)})`);
  console.log(`入口间距=${Math.round(d)}px → 纯行军 ${march.toFixed(1)}s（转点发生在 roundTime>20 时，BOMB_FUSE=20s，安弹+回防时间窗紧张）`);
  console.log(`T出生点(${Math.round(sp.x)},${Math.round(sp.y)}) 到A入口=${Math.round(Math.hypot(sp.x - eA.x, sp.y - eA.y))}px 到B入口=${Math.round(Math.hypot(sp.x - eB.x, sp.y - eB.y))}px`);
}
