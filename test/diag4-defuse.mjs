// 怀疑点5：defuse 执行链 —— 非拆弹 CT 的 return 冻结 fireCd/recoil/reloadT；拆弹手被远距攻击
import { mkGame, place, step, alive, dist } from './diag-lib.mjs';
import { getMap } from '../src/map.js';
import { applyDamage } from '../src/combat.js';

const game = mkGame({ diff: 'normal' });
const m = getMap();
const site = m.sites.A;
const ctA = alive(game, 'ct')[0];
const ctB = alive(game, 'ct')[1];
const t1 = alive(game, 't')[0];

// 关掉其他 bot
for (const e of game.entities) if (e.bot && e !== ctA && e !== ctB && e !== t1) e.dead = true;

// 在 A 点安炸弹（直接构造 planted 状态）
const bx = site.cx, by = site.cy;
game.bomb = { x: bx, y: by, dropped: false, planted: true, site: 'A', timer: 20, defusing: false, defuseT: 0 };
game.lastPlantSite = 'A';

place(ctA, bx - 40, by);
place(ctB, bx + 40, by);
place(t1, m.spawns.t[0].x, m.spawns.t[0].y); // 远

// 给 ctA 制造"刚开过枪/在换弹"状态，观察冻结
ctA.fireCd = 0.4;
ctA.recoil = 1.5;
ctA.reloading = true;
ctA.reloadT = 1.2;
ctB.fireCd = 0.4;
ctB.recoil = 1.5;
ctB.reloading = true;
ctB.reloadT = 1.2;

step(game, 90); // 3 秒

const defuser = game.entities.find((o) => o.bot && o.team === 'ct' && o.defuseT > 0);
const other = defuser === ctA ? ctB : ctA;
console.log(`3s 后: defuser=${defuser ? defuser.name : '无'}`);
console.log(`非拆弹手 ${other.name}: fireCd=${other.fireCd.toFixed(3)} (初始0.4，应已归零) recoil=${other.recoil.toFixed(2)} (初始1.5，应已下降) reloading=${other.reloading} reloadT=${other.reloadT.toFixed(2)} (初始1.2，应已完成)`);
console.log(`   → 冻结判定: fireCd未降=${other.fireCd >= 0.39} recoil未降=${other.recoil >= 1.49} reload未完成=${other.reloading}`);

// 观察非拆弹手是否还能开火：给 other 制造可见敌人并统计射击
const t3 = alive(game, 't')[0] || t1;
place(t3, other.x + 260, other.y);
other.angle = Math.atan2(t3.y - other.y, t3.x - other.x);
other.fireCd = 0;
other.recoil = 0;
other.reloading = false;
const shotsBefore = t3.lastShot;
step(game, 60); // 2s
const fired = t3.lastShot > shotsBefore;
console.log(`非拆弹手对着 2s 内可见敌人 开火=${fired}（若 false → 炸弹安装后 CT bot 永不开火）`);

// 拆弹手被 350px 外敌人攻击（LOS 内但在 300px 判定圈外）：先重置
for (const e of game.entities) { e.defuseT = 0; e.aimTarget = null; e.reaction = 0; }
game.bomb.defusing = false;
game.bomb.timer = 20;
const def2 = defuser || ctA;
place(def2, bx - 40, by);
place(ctB, 2000, 2000); // 其他 CT 撤走，def2 成为唯一拆弹手
place(t1, def2.x + 350, def2.y); // 350px LOS 外于 300 判定圈
def2.angle = Math.atan2(t1.y - def2.y, t1.x - def2.x); // 面向敌人（FOV 内 → aimTarget 会设？测盲区场景）
def2.aiParams = { ...(def2.aiParams || {}) };
// 让 t1 在 def2 正背后开火（不在 FOV → 无 aimTarget）
place(t1, def2.x - 350, def2.y);
def2.angle = 0; // 面向正东
let defuseT0 = 0;
for (let i = 0; i < 30; i++) {
  step(game, 1);
  if (i === 10) { applyDamage(def2, 20, { killer: t1, weapon: 'm4', head: false }, game); }
  if (def2.defuseT > defuseT0) defuseT0 = def2.defuseT;
}
console.log(`拆弹手被 350px 外敌人射击 + 受击 20hp 后: defuseT=${def2.defuseT.toFixed(2)} 累计峰值=${defuseT0.toFixed(2)} aimTarget=${def2.aimTarget ? def2.aimTarget.name : null} → 拆弹是否被打断=${def2.defuseT < 0.1}`);
