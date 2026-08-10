// 怀疑点4 加强版：安弹链全统计（含拆/炸，latch 安弹事件）
import { mkGame, step } from './diag-lib.mjs';
import { getMap } from '../src/map.js';

const ROUNDS = 8;
const game = mkGame({ diff: 'normal' });
const m = getMap();

let lastRound = game.round;
let carrier = null;
const rec = { entryT: null, nearT: null, plantStartT: null, retryAt: null, handoffs: 0, planted: false, interrupts: 0, prevPlantT: 0, plantDone: false };
const all = [];

function onFrame() {
  if (game.state !== 'LIVE') return;
  if (carrier && (carrier.dead || !carrier.hasBomb)) {
    rec.handoffs++;
    carrier = game.entities.find((e) => e.bot && e.team === 't' && !e.dead && e.hasBomb) || null;
  }
  if (!carrier) carrier = game.entities.find((e) => e.bot && e.team === 't' && !e.dead && e.hasBomb);
  if (!carrier) return;
  const rt = game.roundTime;
  const cs = game.tAttackSite === 'A' ? m.sites.A : m.sites.B;
  const d = Math.hypot(carrier.x - cs.cx, carrier.y - cs.cy);
  if (rec.entryT === null && d < 150) rec.entryT = rt;
  if (rec.nearT === null && d < 300) rec.nearT = rt;
  if (carrier.plantT > 0 && rec.plantStartT === null) rec.plantStartT = rt;
  if (carrier.plantRetryT > 0 && rec.retryAt === null) rec.retryAt = rt;
  if (carrier.plantT > 0 && carrier.plantT < rec.prevPlantT) rec.interrupts++;
  rec.prevPlantT = carrier.plantT;
  if (!rec.planted && game.bomb && game.bomb.planted) rec.planted = true;
}

for (let i = 0; i < 15000; i++) {
  step(game, 1);
  if (game.round !== lastRound) {
    all.push({ round: lastRound, ...rec });
    lastRound = game.round;
    carrier = null;
    Object.assign(rec, { entryT: null, nearT: null, plantStartT: null, retryAt: null, handoffs: 0, planted: false, interrupts: 0, prevPlantT: 0 });
    if (game.round > ROUNDS) break;
  }
  onFrame();
  if (game.over) break;
}

console.log('持包者安弹链统计 (dust2 normal, 8回合):');
console.log('回合 | 安弹? | 首次<300px(s) | 首次<150px(s) | 开始安弹(s) | 被打断 | retry(s) | 换手');
for (const r of all) {
  console.log(`R${r.round} | ${r.planted ? '已安' : '未安'} | ${r.nearT !== null ? r.nearT.toFixed(1) : '-'} | ${r.entryT !== null ? r.entryT.toFixed(1) : '-'} | ${r.plantStartT !== null ? r.plantStartT.toFixed(1) : '-'} | ${r.interrupts} | ${r.retryAt !== null ? r.retryAt.toFixed(1) : '-'} | ${r.handoffs}`);
}
const w = all.filter((r) => r.planted).length;
console.log(`安弹成功 ${w}/${all.length}`);
const waited = all.filter((r) => r.nearT !== null && r.nearT > 8);
if (waited.length) console.log(`持包者在入口干等(>8s 未进点)的回合: ${waited.map((r) => 'R' + r.round + '(' + r.nearT.toFixed(1) + 's)').join(' ')}`);
