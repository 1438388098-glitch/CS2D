// 审计 4：quick match（aiParams=null）下 H10 vs H11 实战强度 + 同 seed 确定性 + 烟雾/闪光行为
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');
const { findVisibleEnemy } = await import('../src/ai/perception.js');
const { los } = await import('../src/map.js');

const BASE_DUR = ROUND.DURATION;
ROUND.DURATION = 40;

function runMatch(hellLevel, useAiParams, seed, roundsLimit = 10) {
  seedWorld(seed);
  const g = createGame({ team: 'ct', diff: 'hell', hellLevel, bots: 5, mapId: 'dust2' });
  g.seed = seed;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  const params = { ...DIFF.hell.ladder[hellLevel] };
  if (useAiParams) {
    for (const e of g.entities) if (e.bot) e.aiParams = params;
  }
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  let tWins = 0, rounds = 0, tkills = 0, ckills = 0;
  let prevTK = 0, prevCK = 0, prevT = 0;
  let plants = 0, planted = false;
  let prevRound = g.round;
  for (let t = 0; t < 300000; t++) {
    update(g, 1 / 60);
    if (g.round !== prevRound) {
      prevRound = g.round;
      rounds++;
      planted = false;
      if (rounds >= roundsLimit) break;
    }
    if (g.bomb && g.bomb.planted && !planted) { plants++; planted = true; }
    const tk2 = g.entities.filter((e) => e.team === 't').reduce((s, e) => s + e.kills, 0);
    const ck2 = g.entities.filter((e) => e.team === 'ct').reduce((s, e) => s + e.kills, 0);
    tkills += tk2 - prevTK; prevTK = tk2;
    ckills += ck2 - prevCK; prevCK = ck2;
    if (g.score.T > prevT) { tWins++; prevT = g.score.T; }
    if (g.over) break;
  }
  return { tWins, rounds: Math.max(1, rounds), tkills, ckills, plants };
}

const SEEDS = [7, 101, 2023];
console.log('=== quick match（aiParams=null，即玩家实际体验配置）T 队胜率 ===');
console.log('配置                    | seed7 | seed101 | seed2023 | T胜率   | T杀/CT杀');
const cfgs = [
  ['H10 quick(无aiParams)', 10, false],
  ['H11 quick(无aiParams)', 11, false],
  ['H10 +aiParams', 10, true],
  ['H11 +aiParams', 11, true],
];
for (const [name, lv, ap] of cfgs) {
  const res = [];
  for (const s of SEEDS) res.push(runMatch(lv, ap, s));
  const wins = res.reduce((a, r) => a + r.tWins, 0);
  const rnds = res.reduce((a, r) => a + r.rounds, 0);
  const tk = res.reduce((a, r) => a + r.tk, 0);
  const ck = res.reduce((a, r) => a + r.ck, 0);
  console.log(`${name.padEnd(25)} | ${res.map((r) => r.tWins + '/' + r.rounds).join('   | ')} | ${(wins / rnds * 100).toFixed(0)}%  | ${tk}/${ck}`);
}

console.log('\n=== 确定性验证：同 seed 两次模拟 ===');
for (const lv of [10, 11]) {
  seedWorld(4242);
  const r1 = runMatch(lv, false, 4242, 4);
  const r2 = runMatch(lv, false, 4242, 4);
  const same = r1.tWins === r2.tWins && r1.tk === r2.tk && r1.ck === r2.ck && r1.plants === r2.plants;
  console.log(`H${lv} seed=4242: run1(T胜${r1.tWins} 杀${r1.tk}/${r1.ck} 安弹${r1.plants})  run2(${r2.tWins}, ${r2.tk}/${r2.ck}, ${r2.plants}) → ${same ? '✓ 完全一致' : '✗ 不一致!'}`);
}

console.log('\n=== 烟雾遮视野验证（findVisibleEnemy / los / fireRay 路径）===');
{
  seedWorld(5);
  const g = createGame({ team: 'ct', diff: 'hard', bots: 1, mapId: 'dust2' });
  g.seed = 5;
  g.ui = null;
  startMatch(g);
  const bot = g.entities.find((e) => e.bot && e.team === 't');
  const p = g.player;
  // 用 mid 附近开阔直线 (1080,792) 与 (1080, 992)
  bot.x = 1080; bot.y = 992; p.x = 1080; p.y = 792;
  bot.angle = -Math.PI / 2;
  p.angle = Math.PI / 2;
  const noSmoke = findVisibleEnemy(bot, g);
  console.log(`无烟: bot(1080,992)→玩家(1080,792) 200px 可见? ${noSmoke ? '是 ✓' : '否'}`);
  // 烟雾挡中间
  g.smokes.push({ x: 1080, y: 892, r: 150, gr: 150, life: 12 });
  const inSmoke = findVisibleEnemy(bot, g);
  console.log(`有烟(半径150 挡中): 可见? ${inSmoke ? '是 — 透视级 BUG!' : '否 ✓ los 正确截断'}`);
  // fireRay 是否同样截断（烟后仍能命中=击杀级 bug）
  const losOk = los(g, bot.x, bot.y, p.x, p.y, 0);
  console.log(`los() 同路径: ${losOk ? '穿透' : '被烟阻断 ✓'}`);
  g.smokes.length = 0;
}

console.log('\n=== 闪光盲射行为（core.js:51-68 代码路径分析）===');
console.log(`被闪后: blind>0 时每帧 vx=cos(angle)*60 → 以 60px/s 沿当前朝向直线前冲`);
console.log(`panicTarget = aimTarget || lastKnown(2.5s内) → 直冲敌阵方向（不逃生）`);
console.log(`有 panicTarget 时: 每帧 rand()<dt*1.2 → 盲射概率 1.2/s（fireCd 允许时），blindShotT=0.5 节流`);
console.log(`无 panicTarget 时: 角度 ±0.15 游走，不开火 → 原地乱转`);
console.log(`闪光最久 4s（grenades.js:65 dur=(1-d/800)*4）→ 最多前冲 240px + 4.8 发盲射`);
console.log(`盲射无散布惩罚（spread 用 stand + 首发档）→ 盲射命中率与正常射击相同（若方向对）`);
ROUND.DURATION = BASE_DUR;
process.exit(0);
