// 怀疑点3：aimTarget 丢失链 —— LOS 断后 1.4s 才丢目标；期间新可见敌人被忽略
import { mkGame, place, step, botOf } from './diag-lib.mjs';
import { los, getMap } from '../src/map.js';
import { diffOf } from '../src/config.js';

const game = mkGame({ diff: 'normal' });
const m = getMap();
const ct = botOf(game, 'ct');
const t1 = botOf(game, 't', 0);
const t2 = botOf(game, 't', 1);
for (const e of game.entities) {
  if (e.bot && e !== ct && e !== t1 && e !== t2) e.dead = true;
}
ct.aiParams = { ...diffOf(game), view: 1100 };
game.barrels = []; // 清除油桶/箱子干扰（运行时数据，非源码）
game.crates = [];

// 找开阔地
const grid = m.grid, T = m.tile;
let openX = null, openY = null;
for (let ty = 1; ty < grid.length - 1 && !openX; ty++) {
  for (let tx = 1; tx < grid[0].length - 14 && !openX; tx++) {
    let ok = true;
    for (let k = 0; k < 14; k++) {
      const c = grid[ty][tx + k];
      if (!(c === '.' || c === '~' || c === 't' || c === 'c')) { ok = false; break; }
    }
    if (ok) { openX = tx; openY = ty; }
  }
}
place(ct, (openX + 3) * T + T / 2, openY * T + T / 2);
place(t1, (openX + 10) * T + T / 2, openY * T + T / 2);
place(t2, (openX + 17) * T + T / 2, openY * T + T / 2);

// 钉住所有 bot（站桩），排除自主移动
const pinBot = (e) => {
  e.objCache = { x: e.x, y: e.y };
  e.objAt = game.time * 1000;
  e.objBombState = game.bomb ? (game.bomb.planted ? 'p' + game.bomb.site : 'n') : 'n';
};
const pin = () => { pinBot(ct); pinBot(t1); pinBot(t2); };
pin();
ct.angle = Math.atan2(t1.y - ct.y, t1.x - ct.x);
step(game, 8);
console.log(`[1] 目视建立: aimTarget=${ct.aimTarget ? ct.aimTarget.name : null} (期望 t1) reaction=${ct.reaction.toFixed(3)}`);

// 断 LOS：t1 到墙后（找墙）
let wallX = null, wallY = null;
for (let ty = Math.max(0, openY - 4); ty <= Math.min(grid.length - 1, openY + 4) && !wallX; ty++) {
  for (let tx = openX + 10; tx < grid[0].length && !wallX; tx++) {
    if (grid[ty][tx] === '#') { wallX = tx; wallY = ty; }
  }
}
if (wallX === null) { console.log('找不到墙'); process.exit(0); }
place(t1, (wallX + 2) * T + T / 2, wallY * T + T / 2);
console.log(`[2] t1 入墙后 LOS=${los(game, ct.x, ct.y, t1.x, t1.y, ct.height)} aimTarget=${ct.aimTarget ? ct.aimTarget.name : null}`);

// 期间把 t2 放到 FOV 内（ct 面向东，t2 在正东 280px）
place(t2, (openX + 10) * T + T / 2, openY * T + T / 2);
ct.angle = Math.atan2(t2.y - ct.y, t2.x - ct.x);
pin();
const frames = [];
let flick = 0;
for (let i = 0; i < 90; i++) {
  pin();
  step(game, 1);
  const l = los(game, ct.x, ct.y, t1.x, t1.y, ct.height);
  if (l !== (i % 30 === 0 ? l : l)) {}
  if (i < 10 || (i % 10 === 0)) frames.push({ i, los: l, lostT: ct.aimLostT.toFixed(2), aim: ct.aimTarget ? ct.aimTarget.name : 'null', ct: [Math.round(ct.x), Math.round(ct.y)].join(','), t1: [Math.round(t1.x), Math.round(t1.y)].join(',') });
  if (l) flick++;
}
const nearBarrel = game.barrels.filter((b) => Math.hypot(b.x - ct.x, b.y - ct.y) < 300).length;
const nearCrate = game.crates.filter((c) => Math.hypot(c.x - ct.x, c.y - ct.y) < 300).length;
console.log(`[3] LOS 断后 3s 逐帧观察: LOS 复现帧数=${flick}/90`);
for (const f of frames) console.log(`  i=${f.i} los=${f.los} lostT=${f.lostT} aim=${f.aim} ct=(${f.ct}) t1=(${f.t1})`);
