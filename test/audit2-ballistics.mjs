// 只读审计脚本 2：射击数学全链路蒙特卡洛（AK/AWP 命中率、TTK、后坐力、移动散布）
import { installStubs } from './stubdom.js';
installStubs();
const { DIFF, BOT_AI } = await import('../src/config.js');
const { effectiveSpread, headshotChance, distanceFalloff, moveFactor } = await import('../src/ballistic.js');
const { WEAPONS } = await import('../src/config.js');

const AK = WEAPONS.ak, AWP = WEAPONS.awp;
const TGT_RAD = 15; // o.rad(13) + 2
const N = 20000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(12345);

// 模拟一次 bot 射击：aimErr 在进入窗口瞬间近似均匀 ±0.85*hitAng；散布均匀 ±spreadDeg（combat.js:89）
function simShot(weapon, dist, spreadDeg, hitAng, armor, helmet) {
  const windowDeg = hitAng * 180 / Math.PI;
  const aimErr = (rng() * 2 - 1) * 0.85 * windowDeg;
  const spread = (rng() * 2 - 1) * spreadDeg;
  const errDeg = aimErr + spread;
  const hit = Math.abs(errDeg) < windowDeg;
  let dmg = 0, head = false;
  if (hit) {
    const perp = dist * Math.sin(errDeg * Math.PI / 180);
    const aim = Math.min(1, Math.max(0.15, 1 - perp / (TGT_RAD * 0.75)));
    const far = Math.min(1, Math.max(0.25, 1.2 - dist / weapon.range));
    const base = weapon.kind === 'rifle' ? 0.2 : 0.55;
    const hs = Math.min(0.85, Math.max(0.03, base * aim * far));
    head = rng() < hs;
    dmg = weapon.dmg * distanceFalloff(weapon, dist);
    if (head) {
      dmg *= (armor && helmet) ? 4 * 0.75 : 4;
    } else if (armor) {
      dmg = Math.max(0, dmg - Math.min(dmg * 0.4, 100));
    }
  }
  return { hit, head, dmg };
}

// 命中窗口（bot 开火条件 core.js:183-184：误差 < hitAng*0.85 且 recoil<0.7）
const hitAng = (dist) => Math.atan2(TGT_RAD, dist);

// 散布：bot 急停后 stand，streak=0（远距 tap 每次重置）→ w.spread * ballistic.mult * diff.spreadMult
function botSpread(weapon, diff, streak, moving) {
  const b = weapon.ballistic;
  let mult = 1;
  if (streak <= 0) mult *= b.first;
  else mult *= Math.min(1 + b.perShot * streak, b.max);
  mult *= moving ? b.move.run : 1.0;
  return weapon.spread * mult * diff.spreadMult;
}

const DIFFS = {
  easy: DIFF.easy, normal: DIFF.normal, hard: DIFF.hard,
  H1: DIFF.hell.ladder[1], H10: DIFF.hell.ladder[10], H11: DIFF.hell.ladder[11],
  'H11+aiParams': { ...DIFF.hell.ladder[11], counterStrafe: 0.5915, spreadCtrl: 1.4095, peekSkill: 0.8777 }
};
const DISTS = [100, 300, 600, 900];
const ARMOR = true, HELMET = true;

console.log('=== (a) AK-47 bot 命中率（首发射击 spread=first，急停后 stand，误差<0.85*hitAng 才开火）===');
console.log('难度      | ' + DISTS.map((d) => `${d}px 命中/爆头/TTK`).join(' | '));
const ttk = (pHit, pHead, dmg, fireInt) => {
  // 期望每发伤害；AK 无甲爆头 160 一发死；有甲爆头 120；身体 24/发（甲）
  // 简化：每发期望伤害 = pHit*(pBody*24 + pHead*120)
  const expPerShot = pHit * ((1 - pHead) * 24 + pHead * 120);
  return expPerShot <= 0 ? Infinity : (100 / expPerShot - 1) * fireInt;
};
for (const [name, diff] of Object.entries(DIFFS)) {
  const row = [];
  for (const d of DISTS) {
    const spread = botSpread(AK, diff, 0, false);
    let hits = 0, heads = 0;
    for (let i = 0; i < N; i++) { const s = simShot(AK, d, spread, hitAng(d), ARMOR, HELMET); if (s.hit) { hits++; if (s.head) heads++; } }
    const pHit = hits / N, pHead = hits ? heads / hits : 0;
    const fireInt = d > 350 ? 0.22 : 0.1; // tap 模式 >350px
    row.push(`${(pHit * 100).toFixed(1)}%/${(pHead * 100).toFixed(1)}%/${ttk(pHit, pHead, AK.dmg, fireInt).toFixed(2)}s`);
  }
  console.log(name.padEnd(13) + ' | ' + row.join(' | '));
}
console.log('注: >350px 走 tap（0.22s/发），≤350px 连发（0.1s/发）；TTK=期望击杀所需时间(有甲)');
// 无甲（bot 保枪局常见）：身体 40/发 3 发死，爆头 160 一发死
console.log('无甲对照 (hard, 300px):');
{
  const d = 300, spread = botSpread(AK, DIFF.hard, 0, false);
  let hits = 0, heads = 0;
  for (let i = 0; i < N; i++) { const s = simShot(AK, d, spread, hitAng(d), false, false); if (s.hit) { hits++; if (s.head) heads++; } }
  const pHit = hits / N, pHead = heads / hits;
  const exp = pHit * ((1 - pHead) * 40 + pHead * 160);
  console.log(`  命中 ${(pHit * 100).toFixed(1)}% 爆头 ${(pHead * 100).toFixed(1)}% 期望击杀 ${(100 / exp * 0.1).toFixed(2)}s`);
}

console.log('\n=== (b) 连发散布（近距 <=350px 连发，streak 累积）===');
for (const [name, diff] of Object.entries({ easy: DIFF.easy, hard: DIFF.hard, H10: DIFF.hell.ladder[10], 'H11+aiParams': DIFFS['H11+aiParams'] })) {
  const row = [];
  for (const streak of [1, 2, 3, 5, 8]) {
    const spread = botSpread(AK, diff, streak, false);
    let hits = 0;
    for (let i = 0; i < N; i++) { const s = simShot(AK, 300, spread, hitAng(300), ARMOR, HELMET); if (s.hit) hits++; }
    row.push(`streak${streak}:${(hits / N * 100).toFixed(1)}%`);
  }
  console.log(name.padEnd(13) + ' @300px | ' + row.join(' '));
}

console.log('\n=== (c) AWP bot 裸射（从不 scoped：combat.js:102 仅玩家设 scoped）===');
console.log('AWP 裸射 spread = 14° * first(0.1) * spreadMult（每发独立，recoil 0.09/发）');
for (const [name, diff] of Object.entries({ easy: DIFF.easy, normal: DIFF.normal, hard: DIFF.hard, H10: DIFF.hell.ladder[10] })) {
  const row = [];
  for (const d of [300, 600, 900, 1200]) {
    const spread = botSpread(AWP, diff, 0, false);
    let hits = 0;
    for (let i = 0; i < N; i++) { const s = simShot(AWP, d, spread, hitAng(d), ARMOR, HELMET); if (s.hit) hits++; }
    row.push(`${d}px:${(hits / N * 100).toFixed(1)}%`);
  }
  console.log(name.padEnd(7) + ' | ' + row.join('  '));
}
console.log('AWP 伤害 115：身体一发 115-46=69（甲），需 2 发；爆头 460 一发死。TTK 受 rpm=41 → 1.46s 间隔限制');

console.log('\n=== (d) 移动散布（突击 zigzag 边跑边打）===');
// 突击模式 core.js:200-211: vx=cos(aimAng+π/2*sway)*spd*0.9, sway=±0.28 → 移动中；stopBurst 才急停（~30% 占空比）
// 移动时 moveFactor=run(1.6)，且连发 streak 累积
console.log('AK run 移动散布: spread = 2.4 * mult * 1.6 * spreadMult');
for (const [name, diff] of Object.entries({ easy: DIFF.easy, hard: DIFF.hard, H10: DIFF.hell.ladder[10] })) {
  const row = [];
  for (const streak of [0, 2, 4]) {
    const spread = botSpread(AK, diff, streak, true);
    let hits = 0;
    for (let i = 0; i < N; i++) { const s = simShot(AK, 400, spread, hitAng(400), ARMOR, HELMET); if (s.hit) hits++; }
    row.push(`streak${streak}:${(hits / N * 100).toFixed(1)}%`);
  }
  console.log(name.padEnd(7) + ' @400px 移动中 | ' + row.join('  '));
}
console.log('对照：静止急停散布同距离 = ' + (() => {
  const spread = botSpread(AK, DIFF.hard, 0, false); let hits = 0;
  for (let i = 0; i < N; i++) { const s = simShot(AK, 400, spread, hitAng(400), ARMOR, HELMET); if (s.hit) hits++; }
  return (hits / N * 100).toFixed(1) + '%';
})() + ' (hard)');

console.log('\n=== (e) 后坐力恢复（bot 1.2 vs 玩家 RECOIL_RECOVER 2.2）===');
// combat.js:94 recoil += 0.11/发(rifle)；actions.js:188 bot 衰减 1.2*(recoil>1.1?1.8:0.55)
// game.js:593 玩家衰减 2.2*(recoil>1.1?1.8:0.55)
const botDecay = (r) => 1.2 * (r > 1.1 ? 1.8 : 0.55);
const playerDecay = (r) => 2.2 * (r > 1.1 ? 1.8 : 0.55);
const botRecoilAfterBurst = (n, dt) => { let r = 0; for (let i = 0; i < n; i++) { r += 0.11; r = Math.max(0, r - botDecay(r) * dt); } return r; };
console.log(`AK 三连发(间隔0.1s)后 recoil = ${botRecoilAfterBurst(3, 0.1).toFixed(3)}`);
console.log(`AK 六连发后 recoil = ${botRecoilAfterBurst(6, 0.1).toFixed(3)}`);
console.log(`开火窗口条件 recoil<0.7：连发 n 发后是否仍<0.7：`);
for (const n of [5, 6, 7, 8, 10]) {
  const r = botRecoilAfterBurst(n, 0.1);
  console.log(`  ${n} 发 → recoil=${r.toFixed(3)} ${r < 0.7 ? '✓ 窗口内' : '✗ 被拒'}，恢复至 0.7 需 ${((r - 0.7) / botDecay(r)).toFixed(2)}s`);
}
console.log(`玩家从 recoil=0.7 恢复至 0 需 ${(0.7 / playerDecay(0.7)).toFixed(2)}s；bot 需 ${(0.7 / botDecay(0.7)).toFixed(2)}s`);
console.log(`远距 tap 逻辑（actions.js:234）：shotStreak>=1 且 dist>350 → fireCd=0.22 + shotStreak=0 → 每发都是首发散布，射速 4.5发/s`);
console.log(`  → 远距连发窗口实际不生效，散布恒为 first 档；TTK 由 4.5发/s 决定（vs 理论 10发/s）`);

console.log('\n=== (f) 急停质量 ===');
console.log('玩家急停：松开移动键后 vx 衰减 1-7*dt（game.js:358）→ 速度 <10px/s 需 ~0.3s（235px/s→0）；期间 moveFactor 走 walk 0.45');
console.log('bot 急停：core.js:188-191 直接 vx=vy=0 帧级归零 → 永远 stand 1.0 散布（除非 H11 aiParams counterStrafe 0.59 → 散布再×0.59）');
console.log('H11 counterStrafe=0.5915（需 aiParams）→ 静止散布 ×0.5915；quick match 中不生效 → 散布与 H10 相同档');
process.exit(0);
