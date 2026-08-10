// 怀疑点2 确定性验证：peek 触发→清 path→重寻路→又 peek 的循环（rand 固定小值强制 peek）
import { mkGame, place, update as _u } from './diag-lib.mjs';
import { update } from '../src/game.js';
import { getMap, pathTo } from '../src/map.js';
import { ctx } from '../src/ctx.js';

const game = mkGame({ diff: 'normal' });
const m = getMap();
const bot = game.entities.find((e) => e.bot && e.team === 'ct' && e.role === 'b');
for (const e of game.entities) if (e.bot && e !== bot) e.dead = true;
game.bomb = null;

const cp = (m.clearPoints || []).find((p) => p.site === 'B');
bot.aiParams = { ...(bot.aiParams || {}), peekChance: 0.5 };
bot.objCache = { x: cp.x, y: cp.y, peek: true, search: true };
bot.objAt = game.time * 1000;
bot.objBombState = 'n';
bot.lastKnown = null;
bot.aimTarget = null;

// 固定 rand：0.02 → 探身条件 rand()<dt*0.9 几乎每帧成立（强制 peek 循环）
const origRand = ctx.rand;
ctx.rand = () => 0.02;
place(bot, cp.x + 150, cp.y + 60);
pathTo(bot, cp.x, cp.y);

let minD = 1e9;
let pathWipes = 0, prevPath = bot.path !== null;
const events = [];
for (let i = 0; i < 900; i++) {
  // 每帧重注入缓存（模拟 objective 固定不变），排除目标漂移干扰
  bot.objCache = { x: cp.x, y: cp.y, peek: true, search: true };
  bot.objAt = game.time * 1000;
  bot.objBombState = 'n';
  update(game, 1 / 30);
  const d = Math.hypot(bot.x - cp.x, bot.y - cp.y);
  if (d < minD) minD = d;
  if ((bot.path === null) !== prevPath) {
    if (bot.path === null) { pathWipes++; events.push({ t: (i / 30).toFixed(1), d: Math.round(d), ev: 'WIPE', esc: bot.stuckEscapes || 0 }); }
    prevPath = bot.path !== null;
  }
  if (i % 150 === 0) events.push({ t: (i / 30).toFixed(1), d: Math.round(d), ev: 'sample', esc: bot.stuckEscapes || 0 });
}
ctx.rand = origRand;
console.log(`确定性 peek 循环测试 (30s): 最近距离=${Math.round(minD)}px path 清空次数=${pathWipes} 最终 stuckEscapes=${bot.stuckEscapes}`);
for (const ev of events) console.log(`  t=${ev.t}s d=${ev.d} ${ev.ev} escapes=${ev.esc}`);
