// 怀疑点1：botObjective objCache 失效链
// A) DQN netObjective 'rotate' 分支翻转 game.tAttackSite 后全队缓存不失效（且无防抖 → 反复横跳）
// B) 非 IGL bot 在 tAttackSite 翻转后沿用旧缓存目标最长 3s
// C) CT hotSite 变化 3s 缓存窗口内沿用旧 hot 目标
import { mkGame, botOf, forcedNet, step, dist, place, alive } from './diag-lib.mjs';
import { botObjective } from '../src/ai/decisions.js';
import { getMap } from '../src/map.js';

const siteDist = (o, s) => Math.hypot(o.x - s.cx, o.y - s.cy);

const game = mkGame({ diff: 'normal' });
const m = getMap();
const tIgl = game.entities.find((e) => e.bot && e.team === 't' && e.igl);
const sites = { A: m.sites.A, B: m.sites.B };

console.log('=== A) DQN rotate 翻转 vs objCache ===');
// 给 IGL 注入一个"永远 rotate"的网络
tIgl.aiParams = { netWeights: forcedNet(2) };
game.bomb = null;
game.tAttackSite = 'A';
game.tSwitchedAt = 0;
tIgl.role = game.tAttackSite;
tIgl.hasBomb = false;
const altCarrier = game.entities.find((e) => e.bot && e.team === 't' && e !== tIgl);
altCarrier.hasBomb = true;
tIgl.objCache = null; tIgl.objAt = 0; tIgl.netAct = undefined; tIgl.netAt = undefined;
place(tIgl, m.spawns.t[0].x, m.spawns.t[0].y);
game.roundTime = 50; // 绕过 legacy 分支直接到 netActT

const flips = [];
const baseTime = game.time;
for (let i = 0; i < 14; i++) {
  game.time = baseTime + i * 0.5;
  const obj = botObjective(tIgl, game);
  flips.push({ t: (game.time - baseTime).toFixed(1), site: game.tAttackSite, objX: obj && Math.round(obj.x), objY: obj && Math.round(obj.y) });
}
console.log('调用时序 (每0.5s调 botObjective):');
for (const f of flips) console.log(`  t=+${f.t}s  tAttackSite=${f.site}  obj=(${f.objX},${f.objY})`);
const flipCount = flips.filter((f, i) => i > 0 && f.site !== flips[i - 1].site).length;
console.log(`翻转次数=${flipCount}（0.6s 决策缓存窗口 + 3s objCache TTL 下若持续 rotate 则会周期横跳）`);

console.log('\n=== A2) netObjective rotate 无防抖直接翻转（代码证据 decisions.js:165-168 无 tSwitchedAt 冷却，此处理由 A3 端到端验证） ===');
{
  // 翻转后 IGL 自身目标（role 未同步改）
  game.tAttackSite = 'B';
  tIgl.role = 'A';
  tIgl.objCache = null; tIgl.objAt = 0;
  game.roundTime = 30;
  game.time = baseTime + 20;
  const obj = botObjective(tIgl, game);
  console.log(`翻转后(role=A, site=B, roundTime=30): IGL目标=(${Math.round(obj.x)},${Math.round(obj.y)}) 距A=${Math.round(siteDist(obj, sites.A))} 距B=${Math.round(siteDist(obj, sites.B))} → 决策层把自己拉回旧点`);
}

console.log('\n=== A3) roundTime>45 时 DQN rotate 反复翻转（绕过 legacy 分支） ===');
{
  game.bomb = null;
  game.tAttackSite = 'B';
  tIgl.role = 'A';
  tIgl.hasBomb = false;
  tIgl.objCache = null; tIgl.objAt = 0;
  tIgl.netAct = undefined; tIgl.netAt = undefined;
  game.roundTime = 50;
  const flips = [];
  for (let i = 0; i < 16; i++) {
    game.time = baseTime + 30 + i * 0.5;
    botObjective(tIgl, game);
    if (!flips.length || flips[flips.length - 1] !== game.tAttackSite) flips.push(game.tAttackSite);
  }
  console.log(`roundTime=50, 每0.5s调 botObjective, tAttackSite 序列: ${flips.join('→')} → ${flips.length > 2 ? '周期横跳确认' : '无横跳'}`);
}

console.log('\n=== B) 非 IGL bot 翻转后沿用旧缓存目标 ===');
const t2 = botOf(game, 't', 2);
t2.aiParams = null; // 纯 normal 逻辑
game.tAttackSite = 'A';
t2.objCache = null; t2.objAt = 0;
place(t2, m.spawns.t[0].x, m.spawns.t[0].y);
game.time += 0.1;
const o1 = botObjective(t2, game);
const d1A = siteDist(o1, sites.A);
const d1B = siteDist(o1, sites.B);
console.log(`缓存命中前: obj=(${Math.round(o1.x)},${Math.round(o1.y)}) 距A=${Math.round(d1A)} 距B=${Math.round(d1B)}`);
// 模拟 IGL 翻转（actions.js:52 清缓存的是 actions 分支；此处模拟 DQN/netObjective 翻转不清缓存）
game.tAttackSite = 'B';
game.time += 1.0; // 1s 后仍在 TTL 内
const o2 = botObjective(t2, game);
const d2A = siteDist(o2, sites.A);
const d2B = siteDist(o2, sites.B);
const cachedSame = o2 === o1 || (Math.abs(o2.x - o1.x) < 0.01 && Math.abs(o2.y - o1.y) < 0.01);
console.log(`翻转后 +1s: obj=(${Math.round(o2.x)},${Math.round(o2.y)}) 距A=${Math.round(d2A)} 距B=${Math.round(d2B)} 返回旧缓存=${cachedSame} (期望目标应改向B)`);
game.time += 2.5; // 超过 3s TTL
const o3 = botObjective(t2, game);
const d3B = siteDist(o3, sites.B);
console.log(`翻转后 +3.5s: obj=(${Math.round(o3.x)},${Math.round(o3.y)}) 距B=${Math.round(d3B)} (缓存过期后应指向B)`);

console.log('\n=== C) CT hotSite 变化后缓存沿用 ===');
const ctB = game.entities.find((e) => e.bot && e.team === 'ct' && e.role === 'b');
ctB.aiParams = null;
game.bomb = null;
ctB.objCache = null; ctB.objAt = 0;
place(ctB, m.holds.B.anchors[0].x, m.holds.B.anchors[0].y);
// 两名 T 蹲在 A 点 → hot=A
const ts = alive(game, 't');
ts.forEach((t, i) => place(t, sites.A.cx + (i - 1) * 60, sites.A.cy));
game.time += 0.05;
game.hotSiteCache = null;
const h1 = botObjective(ctB, game);
console.log(`hot=A 时 CT(B守点) 目标=(${Math.round(h1.x)},${Math.round(h1.y)}) 距A=${Math.round(siteDist(h1, sites.A))}`);
// T 全部转 B → hot 应变 B，但缓存 3s
ts.forEach((t, i) => place(t, sites.B.cx + (i - 1) * 60, sites.B.cy));
game.time += 1.0;
game.hotSiteCache = null;
const h2 = botObjective(ctB, game);
console.log(`T全部转B后 +1s: 目标=(${Math.round(h2.x)},${Math.round(h2.y)}) 距A=${Math.round(siteDist(h2, sites.A))} 距B=${Math.round(siteDist(h2, sites.B))} → 仍走向旧hot A=${siteDist(h2, sites.A) < siteDist(h2, sites.B)}`);
