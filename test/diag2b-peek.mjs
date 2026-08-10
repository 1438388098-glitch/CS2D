// 怀疑点2 受控实验：peek 目标 24~260px 区间内的 探身→清path→重寻路 循环
// 直接对 botObjective 返回的 peek 目标跑 botThink 级推进，统计卡死
import { mkGame, place, step, alive, forcedNet } from './diag-lib.mjs';
import { update } from '../src/game.js';
import { botObjective } from '../src/ai/decisions.js';
import { getMap, pathTo } from '../src/map.js';

const game = mkGame({ diff: 'normal' });
const m = getMap();
const bot = game.entities.find((e) => e.bot && e.team === 'ct' && e.role === 'b');
for (const e of game.entities) if (e.bot && e !== bot) e.dead = true;
game.bomb = null;

// 场景1：bot 站在距其"搜点目标"约 150px 处，目标带 peek:true
bot.aiParams = { ...(bot.aiParams || {}) };
bot.aiParams.peekChance = 0.25; // 模拟 hell 级高频探身
bot.objCache = null; bot.objAt = 0;

// 找一个真实 clearPoint 作为目标
const cp = (m.clearPoints || []).find((p) => p.site === 'B');
const target = { x: cp.x, y: cp.y, peek: true, search: true };
// 手动把缓存设为该目标
bot.objCache = target; bot.objAt = game.time * 1000; bot.objBombState = 'n';
bot.lastKnown = null;
bot.aimTarget = null;
// 放在目标 150px 处（视野内开阔即可）
place(bot, cp.x + 150, cp.y + 60);
pathTo(bot, cp.x, cp.y);

let t = 0;
let minD = 1e9;
const log = [];
for (let i = 0; i < 600; i++) {
  update(game, 1 / 30);
  const d = Math.hypot(bot.x - cp.x, bot.y - cp.y);
  if (d < minD) minD = d;
  t += 1 / 30;
  if (i % 60 === 0) {
    const obj = botObjective(bot, game);
    const od = obj ? Math.round(Math.hypot(bot.x - obj.x, bot.y - obj.y)) : null;
    log.push({ t: t.toFixed(1), d: Math.round(d), objD: od, path: bot.path !== null, plen: bot.path ? bot.path.length : 0, repathT: (bot.repathT || 0).toFixed(2), stuck: bot.stuckEscapes || 0, peekT: (bot.peekT || 0).toFixed(2), v: [Math.round(bot.vx), Math.round(bot.vy)].join(','), ang: (bot.angle || 0).toFixed(2) });
  }
}
console.log(`场景1 peek目标150px外: 20s 内最近距离=${Math.round(minD)}px stuckEscapes=${bot.stuckEscapes}`);
for (const l of log.slice(0, 20)) console.log(`  t=${l.t}s d=${l.d} objD=${l.objD} path=${l.path} plen=${l.plen} repathT=${l.repathT} escapes=${l.stuck} peekT=${l.peekT} v=${l.v} ang=${l.ang}`);

// 场景2：无 peek 的普通目标（对照组）
const bot2 = game.entities.find((e) => e.bot && e.team === 'ct' && e.role === 'a');
bot2.dead = false;
for (const e of game.entities) if (e.bot && e !== bot2) e.dead = true;
bot2.aiParams = { ...(bot2.aiParams || {}) };
bot2.aiParams.peekChance = 0.01;
bot2.objCache = { x: cp.x, y: cp.y }; bot2.objAt = game.time * 1000; bot2.objBombState = 'n';
bot2.lastKnown = null; bot2.aimTarget = null;
place(bot2, cp.x + 150, cp.y + 60);
pathTo(bot2, cp.x, cp.y);
let minD2 = 1e9;
for (let i = 0; i < 600; i++) {
  update(game, 1 / 30);
  minD2 = Math.min(minD2, Math.hypot(bot2.x - cp.x, bot2.y - cp.y));
}
console.log(`场景2 对照组: 20s 内最近距离=${Math.round(minD2)}px stuckEscapes=${bot2.stuckEscapes}`);

// 场景3：真实对局中 stuckEscapes 增长曲线（IGL 视角）
const game3 = mkGame({ diff: 'normal' });
const igl = game3.entities.find((e) => e.bot && e.team === 't' && e.igl);
let maxEsc = 0, peakAt = 0;
for (let i = 0; i < 1200; i++) {
  step(game3, 1);
  if (igl.stuckEscapes > maxEsc) { maxEsc = igl.stuckEscapes; peakAt = game3.roundTime; }
}
console.log(`场景3 真实对局 IGL: 峰值 stuckEscapes=${maxEsc} @${peakAt.toFixed(1)}s（>2 触发随机偏移寻路 ±140px）`);
