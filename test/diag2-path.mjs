// 怀疑点2+3：寻路/推进死锁 & lastKnown/objective 优先级冲突 & aimTarget 丢失链
// 真实对局统计：探身→清path→重寻路循环、卡死回合比例、目标达成时间
import { mkGame, step, alive, dist } from './diag-lib.mjs';
import { botObjective } from '../src/ai/decisions.js';
import { getMap } from '../src/map.js';

const ROUNDS = 6;
const game = mkGame({ diff: 'normal' });
const m = getMap();
game.player.dead = true;

let lastRound = game.round;
let tick = 0;
const stats = []; // per bot per round
let cur = new Map();

function frameSample() {
  if (game.state !== 'LIVE') return;
  for (const e of alive(game, 't')) {
    if (!cur.has(e)) cur.set(e, { round: game.round, t0: game.time, lastX: e.x, lastY: e.y, moved: 0, pathNullT: 0, repathEvents: 0, peekEvents: 0, prevStuck: 0, prevPath: false, maxObjDist: 0, reached: false, winT: 0 });
    const s = cur.get(e);
    s.moved += Math.hypot(e.x - s.lastX, e.y - s.lastY);
    s.lastX = e.x; s.lastY = e.y;
    if (e.path === null) s.pathNullT += 1 / 30; else s.prevPath = true;
    if (e.path === null && s.prevPath) s.repathEvents++;
    if (e.peekT > 0) s.peekEvents++;
    const obj = botObjective(e, game);
    if (obj) {
      const d = dist(e, { x: obj.x, y: obj.y });
      if (d > s.maxObjDist) s.maxObjDist = d;
      if (d < 24 && !s.reached) { s.reached = true; s.winT = game.roundTime; }
    }
  }
}

for (let i = 0; i < 12000; i++) {
  step(game, 1);
  frameSample();
  if (game.round !== lastRound) {
    // 回合收尾
    const cap = [];
    for (const [e, s] of cur) {
      if (s.round !== lastRound) continue;
      cap.push({ ...s, bot: e.name });
    }
    stats.push(...cap);
    cur.clear();
    lastRound = game.round;
    if (cap.length) console.log(`回合 ${lastRound - 1} 收尾: 样本 ${cap.length}`);
    if (game.round > ROUNDS) break;
  }
  if (game.over) break;
}

console.log(`结束状态: round=${game.round} state=${game.state} score=${game.score.T}:${game.score.CT}`);

const stuckRounds = stats.filter((s) => s.moved < 50).length;
console.log(`统计: 共 ${stats.length} 个 bot-回合样本`);
console.log(`卡死回合(移动<50px): ${stuckRounds} (${(stuckRounds / Math.max(1, stats.length) * 100).toFixed(1)}%)`);
const peekCyc = stats.filter((s) => s.pathNullT > 3);
console.log(`path=null 累计>3s 的样本: ${peekCyc.length}`);
const slow = stats.filter((s) => s.moved < 200 && s.pathNullT > 0);
console.log(`移动慢(<200px)且 pathNull 的样本: ${slow.length}`);
if (peekCyc.length) {
  console.log('典型样本:');
  for (const s of peekCyc.slice(0, 5)) {
    console.log(`  ${s.bot} R${s.round}: 移动=${Math.round(s.moved)}px pathNull=${s.pathNullT.toFixed(1)}s repath事件=${s.repathEvents} peek事件=${s.peekEvents} 达成目标=${s.reached}${s.reached ? ' @' + s.winT.toFixed(1) + 's' : ''}`);
  }
}
console.log(`目标达成率: ${stats.filter((s) => s.reached).length}/${stats.length}`);
