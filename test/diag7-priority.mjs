// 怀疑点2b：lastKnown 分支（core.js:311-322）在 objective 之后覆盖 vx/vy/angle
// + 怀疑点8b：CT combat 分支优先冲向炸弹（core.js:142-152）
import { mkGame, place, step, alive } from './diag-lib.mjs';
import { getMap } from '../src/map.js';

const game = mkGame({ diff: 'normal' });
const m = getMap();
const ct = game.entities.find((e) => e.bot && e.team === 'ct' && e.role === 'b');
const t1 = alive(game, 't')[0];
for (const e of game.entities) if (e.bot && e !== ct && e !== t1) e.dead = true;
game.barrels = [];
game.crates = [];

// 场景1：CT 站守 B 锚点（objective=锚点），同时收到 250px 外 lastKnown（ctReactsTo 260px 阈值内）
const holdB = m.holds.B.anchors[0];
place(ct, holdB.x, holdB.y);
ct.objCache = { x: holdB.x, y: holdB.y };
ct.objAt = game.time * 1000;
ct.objBombState = 'n';
ct.lastKnown = { x: holdB.x + 250, y: holdB.y }; // 250px 东（<260 触发 ctReactsTo）
ct.lastKnownT = 0;
ct.aimTarget = null;
const start = { x: ct.x, y: ct.y };
step(game, 90); // 3s
const moved = Math.hypot(ct.x - start.x, ct.y - start.y);
const dirA = Math.atan2(holdB.y - ct.y, holdB.x - ct.x);
console.log(`[lastKnown覆盖] CT守点+250px外lastKnown: 3s后位移=${Math.round(moved)}px 方向角=${(dirA * 180 / Math.PI).toFixed(0)}° (0°=朝东→离开锚点)`);
console.log(`  → ${moved > 200 ? '离开守点追 lastKnown（objective 被覆盖）' : '未离开'}`);

// 场景2：代码验证 core.js:142-152 —— combat 时 CT 距炸弹>420px 且敌人距炸弹>260px → 无条件弃战奔弹
// （本场景因放置几何 NaN 未能干净复现，见报告；此处仅输出代码路径结论）
console.log('\n[战斗vs炸弹] 代码路径 core.js:142-152: combat && CT && planted && myD>420 && tD>260 → pathTo(bomb)+followPath+return');
console.log('  → return 跳过本帧全部瞄准/开火（line 164-238）；敌人从背后可自由射击该 CT（P2）');
