// 怀疑点1d：CT search 目标（search:true → 600ms TTL + searchIdx++）是否造成 0.6s 级反复换点
import { mkGame, place, step } from './diag-lib.mjs';
import { botObjective } from '../src/ai/decisions.js';
import { getMap } from '../src/map.js';

const game = mkGame({ diff: 'normal' });
const m = getMap();
const ct = game.entities.find((e) => e.bot && e.team === 'ct' && e.role === 'a');
for (const e of game.entities) if (e.bot && e !== ct) e.dead = true;
game.bomb = null;
ct.aiParams = { ...(ct.aiParams || {}) };
ct.lastKnown = null;
ct.aimTarget = null;
ct.lastKnownT = 99;
ct.objCache = null;
ct.objAt = 0;
game.roundTime = 25; // >18 触发搜点
ct.highPointT = 999; // 屏蔽高台分支
place(ct, m.holds.A.anchors[0].x, m.holds.A.anchors[0].y);

const seen = [];
let last = null;
for (let i = 0; i < 200; i++) {
  game.time += 0.1;
  const o = botObjective(ct, game);
  if (o) {
    const key = Math.round(o.x) + ',' + Math.round(o.y);
    if (key !== last) { seen.push({ t: (i * 0.1).toFixed(1), key, search: !!o.search }); last = key; }
  }
}
console.log(`CT 搜点目标变化序列（20s 内 ${seen.length} 次换点）:`);
for (const s of seen.slice(0, 15)) console.log(`  t=${s.t}s → (${s.key}) search=${s.search}`);
console.log(`→ ${seen.length > 10 ? '确认：search:true 缓存 TTL=600ms + searchIdx++ → 0.6s 级反复换点，每个搜点目标从未被走到' : '换点不频繁'}`);
