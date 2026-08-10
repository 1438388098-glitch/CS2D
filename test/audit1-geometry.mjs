// 只读审计脚本 1：视野/几何/LOS 数学（不修改任何 src 源码）
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, BOT_AI, MAP_CT_REACT } = await import('../src/config.js');
const { loadMap, getMap, los, tileAt } = await import('../src/map.js');
const { viewCap } = await import('../src/utils.js');
const { findVisibleEnemy } = await import('../src/ai/perception.js');
const { hearGunshot, weaponHearRadius } = await import('../src/ai/senses.js');
const { seedWorld } = await import('../src/ctx.js');

// ---------- 地图几何 ----------
const g = createGame({ team: 'ct', diff: 'hell', hellLevel: 10, bots: 5, mapId: 'dust2' });
g.seed = 42;
startMatch(g);
g.player.dead = true;
const m = getMap();
console.log(`=== 地图 ${m.id} ${m.name}: W=${m.W} H=${m.H} tile=${m.tile} ===`);
console.log(`site A: cx=${m.sites.A.cx} cy=${m.sites.A.cy}  x0=${m.sites.A.x0} y0=${m.sites.A.y0} x1=${m.sites.A.x1} y1=${m.sites.A.y1}`);
console.log(`site B: cx=${m.sites.B.cx} cy=${m.sites.B.cy}`);
console.log(`T spawn0: (${m.spawns.t[0].x}, ${m.spawns.t[0].y})  CT spawn0: (${m.spawns.ct[0].x}, ${m.spawns.ct[0].y})`);
console.log(`CT holds A:`, JSON.stringify(m.holds.A.anchors.map(a => `(${Math.round(a.x)},${Math.round(a.y)})`)));
console.log(`CT holds B:`, JSON.stringify(m.holds.B.anchors.map(a => `(${Math.round(a.x)},${Math.round(a.y)})`)));
console.log(`entries A: (${Math.round(m.entries.A.x)},${Math.round(m.entries.A.y)})  B: (${Math.round(m.entries.B.x)},${Math.round(m.entries.B.y)})`);

// ---------- 玩家可见 vs bot 感知 ----------
const vc = viewCap(g); // hypot(1280,720)/2
console.log(`\n=== 视野不对称 ===`);
console.log(`viewCap(未除 zoom) = hypot(1280,720)/2 = ${vc.toFixed(1)}px`);
console.log(`运行时 zoom=0.75 → 玩家实际可视半对角 = ${vc / 0.75}px（相机可见世界 = 屏幕/zoom）`);
console.log(`玩家实际水平半宽 = ${1280 / 2 / 0.75}px, 垂直半高 = ${720 / 2 / 0.75}px`);
for (const d of ['easy', 'normal', 'hard']) {
  const bv = Math.min(DIFF[d].view, vc, BOT_AI.MAX_VIEW);
  console.log(`${d}: DIFF.view=${DIFF[d].view} → bestD=min(view, ${vc.toFixed(0)}, 720)=${bv}px`);
}
console.log(`fog 开启 → bestD 再 min 560`);
console.log(`H10/H11 view=1171/1056 → 实际取 ${Math.min(1171, vc, 720)} / ${Math.min(1056, vc, 720)}`);
console.log(`结论: bot 感知(≤720, 雾 560) vs 玩家可见(979) — bot 盲区 [720..979]px`);
console.log(`玩家在 720-979px 处可看到 bot，bot 看不到玩家（对 bot 不利，非作弊）；aimTarget 保留至 viewCap*1.2=${(vc * 1.2).toFixed(0)}px`);

// FOV 覆盖
const fovDeg = BOT_AI.FOV * 180 / Math.PI;
console.log(`\nBOT_AI.FOV=${BOT_AI.FOV}rad(${fovDeg.toFixed(1)}°) 单侧 ±${(fovDeg / 2).toFixed(1)}°`);
console.log(`移动扫视摆动 ±0.95rad=${(0.95 * 180 / Math.PI).toFixed(1)}° 仅 e.path===null 时生效（核心 305-308 行: if (!e.path)）`);
console.log(`跟随路径时 followPath 强制 e.angle=移动方向（map.js:640）→ 行进中无扫视，侧翼敌人仅在 ±${(fovDeg / 2).toFixed(1)}° 内可见`);
console.log(`静止站位扫视有效覆盖 ≈ ±(0.95+0.575)rad ≈ ±${((0.95 + BOT_AI.FOV / 2) * 180 / Math.PI).toFixed(1)}°（仍看不到背后）`);

// ---------- 通信半径 ----------
const comRad = Math.max(BOT_AI.COM_RADIUS, Math.hypot(g.mapW, g.mapH) * 0.42);
console.log(`\n=== 信息流 ===`);
console.log(`COM_RADIUS = max(1200, hypot(${g.mapW},${g.mapH})*0.42) = ${comRad.toFixed(0)}px`);
// T 在 A 点开枪 → CT 各位置能否收到（直接距离 ≤ comRad 的 CT bot）
const tPos = { x: m.sites.A.cx, y: m.sites.A.cy };
console.log(`T 在 A 点中心 (${Math.round(tPos.x)},${Math.round(tPos.y)}) 开枪:`);
const cts = [
  ['A 点 hold anchor0', m.holds.A.anchors[0]],
  ['A 点 hold anchor1', m.holds.A.anchors[1]],
  ['B 点 hold anchor0', m.holds.B.anchors[0]],
  ['B 点 hold anchor1', m.holds.B.anchors[1]],
  ['CT 出生点', m.spawns.ct[0]],
  ['中路过点(mid)', m.mid],
];
for (const [name, p] of cts) {
  if (!p) continue;
  const d = Math.hypot(p.x - tPos.x, p.y - tPos.y);
  console.log(`  ${name} (${Math.round(p.x)},${Math.round(p.y)}): 距离=${Math.round(d)}px ${d <= comRad ? '✓ 收到(半径内)' : '✗ 收不到'}`);
}
console.log(`REPORT_COOLDOWN=1.0s: 同一 bot 每类消息 1s 冷却（info.js:38）——首枪后 1s 内的后续枪声不会刷新坐标`);
console.log(`intel 模式（需 e.aiParams.intel）：消息无半径 + 无模糊；quick match 中 aiParams=null → 不生效`);

// 听觉
console.log(`\nhearGunshot: rifle 半径=${weaponHearRadius({ kind: 'rifle' })}px(1000*1.15), 方向误差 err=sin(...)*0.22, 距离模糊 spread=max(30, d*0.22)`);
console.log(`hearStep: 跑 820px / 走 420px（仅玩家脚步 game.js:579 生成）`);
console.log(`hearSplash (actions.js:12-20): 700px 内精确 lastKnown, 无 LOS、无误差、0.5s 时效`);
console.log(`decisions.js:339-347: CT 听枪循环 —— 1000px 内敌方 lastShot 精确坐标（无 LOS 无模糊）→ 直接作为回防目标`);
console.log(`\n=== LOS 数学 ===`);
console.log(`los(): 步长 ceil(d/6)，6px 采样，losBlocked 用 passableTolerant(墙缘 0.12 tile=4.8px 容差)`);
console.log(`fireRay(): 命中半径 effRad = o.rad+2 = 15px（低打高 ×0.75），墙采样 6px`);
console.log(`关键不一致: los 用中心线（无目标半径补偿），fireRay 有 15px 命中半径`);
console.log(`  → 目标半身卡墙（中心线被挡）时 bot 看不到也不开枪（对 bot 不利）`);
console.log(`  → 反之 los 可见时子弹必然可能命中 → “看到就能打中”方向上一致`);
console.log(`高台: losBlocked c==='C' 判定 optH===1；fireRay 用 e.height>=0.75 — height 取值 {0,0.5,1} → 仅 '^'=1 可通过，两者一致`);

// ---------- 视野不对称实测：bot 从背后看玩家 ----------
seedWorld(99);
const g2 = createGame({ team: 'ct', diff: 'hard', bots: 1, mapId: 'dust2' });
g2.seed = 99;
startMatch(g2);
const bot = g2.entities.find((e) => e.bot && e.team === 't');
const player = g2.player;
player.bot = false;
// 空地图点：用出生点附近开阔地
const bx = m.spawns.t[0].x, by = m.spawns.t[0].y + 300;
const px2 = m.spawns.t[0].x, py2 = m.spawns.t[0].y;
bot.x = bx; bot.y = by; player.x = px2; player.y = py2;
bot.angle = Math.PI; // 背对玩家
player.angle = 0;
const d0 = Math.hypot(px2 - bx, py2 - by);
const visBack = findVisibleEnemy(bot, g2);
console.log(`\n=== 实测 findVisibleEnemy ===`);
console.log(`bot(硬难度) 背对玩家 距离=${d0.toFixed(0)}px: 可见? ${visBack ? '是' : '否（FOV ±33° 外）'}`);
bot.angle = Math.atan2(py2 - by, px2 - bx); // 面向玩家
const visFront = findVisibleEnemy(bot, g2);
console.log(`bot 面向玩家 同距离: 可见? ${visFront ? '是' : '否'}（diff hard view=1120 → 上限 ${Math.min(1120, vc, 720)}px, 无雾 560 限制则 720）`);

// 雾模式
g2.opts.fog = true;
const visFog = findVisibleEnemy(bot, g2);
console.log(`fog=true 同距离(${d0.toFixed(0)}px): ${d0 > 560 ? `可见? ${visFog ? '是' : '否 — 560px 雾帽截断'}` : '可见（560px 内）'}`);

// ---------- 关键长视线（fog 560 对 dust2 适配） ----------
console.log(`\n=== 560px 雾帽 vs dust2 关键交火线 ===`);
const lines = [
  ['CT A 守点到 A 入口', m.holds.A.anchors[0], m.entries.A],
  ['CT A 守点到 B 入口(换防)', m.holds.A.anchors[0], m.entries.B],
  ['CT 出生点到 A 入口', m.spawns.ct[0], m.entries.A],
  ['mid 到 A 入口', m.mid, m.entries.A],
];
for (const [name, a, b] of lines) {
  if (!a || !b) continue;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const open = los(g2, a.x, a.y, b.x, b.y, 0);
  console.log(`  ${name}: 直线距离=${Math.round(d)}px LOS开放=${open} ${d > 560 ? `→ 560px 雾帽不足` : ''}`);
}
console.log(`T spawn→A site: ${Math.round(Math.hypot(m.spawns.t[0].x - m.sites.A.cx, m.spawns.t[0].y - m.sites.A.cy))}px`);
console.log(`A site → B site: ${Math.round(Math.hypot(m.sites.A.cx - m.sites.B.cx, m.sites.A.cy - m.sites.B.cy))}px`);
console.log(`地图对角线: ${Math.round(Math.hypot(m.W, m.H))}px`);
process.exit(0);
