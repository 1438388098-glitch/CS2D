// 怀疑点4 受控验证：单独持包者站进 A/B 点内，无敌人，安弹是否 3s 完成
import { mkGame, place, step, botOf } from './diag-lib.mjs';
import { getMap, inSite } from '../src/map.js';

const game = mkGame({ diff: 'normal' });
const m = getMap();
const carrier = game.entities.find((e) => e.bot && e.team === 't' && e.hasBomb);
for (const e of game.entities) if (e.bot && e !== carrier) e.dead = true;
game.bomb = null;

for (const siteName of ['A', 'B']) {
  const s = m.sites[siteName];
  place(carrier, s.cx, s.cy);
  carrier.objCache = { x: s.cx, y: s.cy };
  carrier.objAt = game.time * 1000;
  carrier.objBombState = 'n';
  carrier.plantRetryT = 0;
  const inS = inSite(carrier.x, carrier.y, s);
  let plantedAt = null;
  for (let i = 0; i < 200; i++) {
    step(game, 1);
    if (game.bomb && game.bomb.planted) { plantedAt = i / 30; break; }
  }
  console.log(`${siteName}点: inSite=${inS} 安弹完成时间=${plantedAt !== null ? plantedAt.toFixed(2) + 's' : '未完成（plantT=' + carrier.plantT.toFixed(2) + '）'}`);
  game.bomb = null;
}

// R6 场景复刻：持包者在入口附近（距点 200-300px）行为轨迹
console.log('\n持包者 250px 处行为（等队友/清点逻辑）:');
place(carrier, m.sites.B.cx - 250, m.sites.B.cy);
carrier.objCache = null; carrier.objAt = 0;
carrier.plantRetryT = 0;
carrier.hasBomb = true;
const trace = [];
for (let i = 0; i < 600; i++) {
  step(game, 1);
  if (i % 60 === 0) {
    const d = Math.hypot(carrier.x - m.sites.B.cx, carrier.y - m.sites.B.cy);
    trace.push({ t: (i / 30).toFixed(1), d: Math.round(d), path: carrier.path ? carrier.path.length : 0, plantT: carrier.plantT.toFixed(2) });
  }
}
for (const tr of trace) console.log(`  t=${tr.t}s 距B点=${tr.d}px pathLen=${tr.path} plantT=${tr.plantT}`);
