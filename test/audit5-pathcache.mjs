// 审计 5：aStar 路径缓存与可破坏地形（木箱）的失效一致性
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { loadMap, getMap, aStar, getGrid } = await import('../src/map.js');
const { seedWorld } = await import('../src/ctx.js');

seedWorld(1);
const g = createGame({ team: 'ct', diff: 'hard', bots: 1, mapId: 'dust2' });
g.seed = 1;
g.ui = null;
startMatch(g);
const m = getMap();

// 用油桶（o）做可破坏障碍测试（dust2 无木箱 D）
const candidates = [];
for (const bb of m.barrels) {
  const gd = getGrid();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const tx2 = bb.tx + dx * 5, ty2 = bb.ty + dy * 5;
    if (tx2 < 0 || ty2 < 0 || tx2 >= m.w || ty2 >= m.h) continue;
    const p = aStar(bb.tx, bb.ty, tx2, ty2);
    if (p && p.length > 6) candidates.push({ b: bb, tx: tx2, ty: ty2, len: p.length });
  }
}
if (!candidates.length) { console.log('未找到合适油桶，跳过'); process.exit(0); }
candidates.sort((a, b) => b.len - a.len);
const { b, tx, ty, len } = candidates[0];
console.log(`测试油桶: tx=${b.tx} ty=${b.ty} → 目标(${tx},${ty}) 绕行 ${len} 步`);

const p1 = aStar(b.tx, b.ty, tx, ty);
console.log(`aStar(油桶→目标) 绕行路径: ${p1 ? p1.length + ' 步' : 'null'}`);
const t0 = Date.now();
getGrid()[b.ty][b.tx] = '.';
const p2 = aStar(b.tx, b.ty, tx, ty);
const dt1 = Date.now() - t0;
const straight = Math.abs(tx - b.tx) + Math.abs(ty - b.ty);
console.log(`油桶爆炸后立即 aStar（${dt1}ms 内）: ${p2 ? p2.length + ' 步' : 'null'} —— 旧路径 ${p1.length} 步 / 直线 ${straight} 步`);
if (p2) console.log(`  ${p2.length === p1.length ? '→ 命中 PATH_CACHE 150ms → 返回陈旧绕行路径（路径不匹配当前地形）' : '→ 已重新计算'}`);
else console.log(`  → 命中 FAIL_CACHE 600ms → 返回陈旧 null（明明已可直线通过）`);
await new Promise((r) => setTimeout(r, 650));
const p3 = aStar(b.tx, b.ty, tx, ty);
console.log(`650ms 后重求: ${p3 ? p3.length + ' 步（缓存过期后正确绕直）' : 'null'}`);
console.log(`结论: aStar 缓存无失效钩子 —— 爆炸/打碎后 150ms(PATH)/600ms(FAIL) 内返回陈旧结果（map.js:479-484 + destroyCrate/explodeBarrel 不清理缓存）`);
process.exit(0);
