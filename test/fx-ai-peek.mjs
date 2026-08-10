// candidate-221 AI 掩体后对枪：peek 相位规划（纯函数） + botThink 集成冒烟
// 验证：
//  1) 纯函数确定性：coverBehind/peekPlan 同输入同输出，相位周期性、skill 时长关系
//  2) 几何正确性：锚点(掩体后)敌人不可见、探出点可见、均可行走
//  3) 集成：近掩体交战时进入 peek 循环（peekAt 置位、往返锚点、暴露时间下降、能开火）；
//     开阔地不触发 peek（走原走位/站桩对枪逻辑）
import { installStubs, registerUiIds } from './stubdom.js';
installStubs();
registerUiIds();

import { registerMap } from '../src/registry.js';
import { createGame, startMatch, update } from '../src/game.js';
import { getMap, los } from '../src/map.js';
import {
  gridCharAt, blocksView, walkableAt, gridLos,
  coverBehind, peekSkillOf, phaseSeed, peekPlan
} from '../src/ai/peek.js';

let failed = false;
let passN = 0, failN = 0;
function ok(name, cond, detail = '') {
  passN++;
  if (!cond) { failN++; console.log('FAIL ' + name + (detail ? ' ' + detail : '')); failed = true; }
}

function gridMap(w, h, set) {
  const g = [];
  for (let y = 0; y < h; y++) g.push(new Array(w).fill('.'));
  if (set) for (const [x, y, c] of set) g[y][x] = c;
  return { grid: g, tile: 40, w, h };
}

// ============ 纯函数测试 ============
// 角落掩体：row6 (y∈[240,280)) cols 10..16 (x∈[400,680))
const corner = gridMap(20, 16, [[10, 6, '#'], [11, 6, '#'], [12, 6, '#'], [13, 6, '#'], [14, 6, '#'], [15, 6, '#'], [16, 6, '#']]);
const bot = { x: 440, y: 340, anchorIdx: 1, laneIdx: 2, name: 'peekbot', height: 0 };
const enemy = { x: 320, y: 200, vx: 0, vy: 0, rad: 16 };

ok('gridCharAt walkable', gridCharAt(corner, 440, 340) === '.');
ok('gridCharAt wall', gridCharAt(corner, 420, 260) === '#');
ok('gridCharAt oob -> #', gridCharAt(corner, -10, 10) === '#' && gridCharAt(corner, 9999, 9999) === '#');
ok('blocksView: wall blocks', blocksView(corner, 420, 260) === true);
ok('blocksView: floor open', blocksView(corner, 440, 340) === false);
ok('blocksView: thin wall see-through', blocksView(gridMap(10, 10, [[5, 5, '=']]), 220, 220) === false);
ok('blocksView: low cover blocks ground', blocksView(gridMap(10, 10, [[5, 5, 'C']]), 220, 220, 0) === true);
ok('blocksView: low cover clear from height', blocksView(gridMap(10, 10, [[5, 5, 'C']]), 220, 220, 1) === false);
ok('gridLos open', gridLos(corner, 100, 100, 600, 400) === true);
ok('gridLos blocked by wall', gridLos(corner, 484, 340, 320, 200) === false);

// coverBehind 找到掩体：锚点敌人不可见、探出点可见、均可行走
const cov = coverBehind(bot, enemy, corner);
ok('coverBehind finds corner cover', !!cov, cov ? JSON.stringify(cov) : 'null');
if (cov) {
  ok('cover anchor walkable', walkableAt(corner, cov.anchorX, cov.anchorY));
  ok('cover anchor hidden from enemy', gridLos(corner, cov.anchorX, cov.anchorY, enemy.x, enemy.y, 0) === false);
  ok('cover peek point walkable', walkableAt(corner, cov.peekX, cov.peekY));
  ok('cover peek point sees enemy', gridLos(corner, cov.peekX, cov.peekY, enemy.x, enemy.y, 0) === true);
  ok('cover peek step bounded', Math.hypot(cov.peekX - cov.anchorX, cov.peekY - cov.anchorY) <= 80,
    'step=' + Math.round(Math.hypot(cov.peekX - cov.anchorX, cov.peekY - cov.anchorY)));
}

// 开阔地：无掩体 → null
ok('open field no cover', coverBehind({ x: 100, y: 100, anchorIdx: 0, name: 'open' }, { x: 200, y: 100 }, corner) === null);

// peekPlan：相位合法 + 三相位齐全 + 确定性
const saw = { peek: 0, recover: 0, hold: 0 };
let valid = true, firstPlan = null;
for (let t = 0; t < 3.0; t += 0.01) {
  const p = peekPlan(bot, enemy, t, corner);
  if (!p) { valid = false; break; }
  saw[p.action]++;
  firstPlan = firstPlan || p;
  if (!['peek', 'recover', 'hold'].includes(p.action) || (p.dir !== 1 && p.dir !== -1) ||
      !Number.isFinite(p.duration) || p.duration <= 0 || p.duration > 3 ||
      !Number.isFinite(p.anchorX) || !Number.isFinite(p.anchorY) ||
      !Number.isFinite(p.peekX) || !Number.isFinite(p.peekY)) valid = false;
}
ok('peekPlan valid plan shape (action/dir/duration/points)', valid, firstPlan ? JSON.stringify(firstPlan) : 'null');
ok('peekPlan cycles through all 3 phases', saw.peek > 0 && saw.recover > 0 && saw.hold > 0, JSON.stringify(saw));
ok('peekPlan deterministic', JSON.stringify(peekPlan(bot, enemy, 1.7, corner)) === JSON.stringify(peekPlan(bot, enemy, 1.7, corner)));

// skill：探出时长与 peekSkill 相关（skill 高 → 探出短）；峰值时长反映相位时长
function maxPeekDur(e) {
  let best = 0;
  for (let t = 0; t < 10; t += 0.005) {
    const p = peekPlan(e, enemy, t, corner);
    if (p && p.action === 'peek' && p.duration > best) best = p.duration;
  }
  return best;
}
ok('peekSkillOf default 0.7', peekSkillOf({ aiParams: {} }) === 0.7);
ok('peekSkillOf custom', peekSkillOf({ aiParams: { peekSkill: 0.9 } }) === 0.9);
ok('peekSkillOf clamps', peekSkillOf({ aiParams: { peekSkill: 5 } }) === 1.2);
ok('higher skill => shorter peek exposure',
  maxPeekDur({ ...bot, aiParams: { peekSkill: 1.0 } }) < maxPeekDur({ ...bot, aiParams: { peekSkill: 0.6 } }),
  'high=' + maxPeekDur({ ...bot, aiParams: { peekSkill: 1.0 } }).toFixed(3) +
  ' low=' + maxPeekDur({ ...bot, aiParams: { peekSkill: 0.6 } }).toFixed(3));

// 不同 bot 相位偏移不同（避免全队同步探头）
ok('phaseSeed differs per bot', phaseSeed(bot) !== phaseSeed({ anchorIdx: 5, laneIdx: 0, name: 'other' }));

// ============ 集成测试：自定义地图 ============
// peeklab：20x14，row5 (y∈[200,240)) cols 8..14 (x∈[320,600)) 掩体墙
const PW = 20, PH = 14;
const pGrid = gridMap(PW, PH);
for (let tx = 8; tx <= 14; tx++) pGrid.grid[5][tx] = '#';
for (const [sx, sy] of [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]) pGrid.grid[sy][sx] = 'c';
for (const [sx, sy] of [[15, 10], [16, 10], [17, 10], [18, 10], [14, 11]]) pGrid.grid[sy][sx] = 't';
pGrid.grid[12][2] = 'a';
pGrid.grid[3][16] = 'b';
registerMap({
  id: 'peeklab', name: 'Peek Lab', accent: '#44ffaa', tile: 40,
  rows: pGrid.grid.map((r) => r.join('')), penPoints: [], highPoints: []
});

function mkSim() {
  const game = createGame({ team: 'ct', diff: 'normal', bots: 2, mapId: 'peeklab' });
  startMatch(game);
  game.player.dead = true;
  game.state = 'LIVE'; game.roundTime = 15; game.freezeT = 0; game.buyTime = 0;
  game.bomb = null; game.time = 7.0;
  game.tAttackSite = 'A';
  const ct = game.entities.find((e) => e.bot && e.team === 'ct' && !e.dead);
  const t = game.entities.find((e) => e.bot && e.team === 't' && !e.dead);
  for (const e of game.entities) if (e !== ct && e !== t) e.dead = true;
  // T 敌冻结不动（netControlled 跳过 updateBots），超高血防被击杀
  t.netControlled = true; t.vx = 0; t.vy = 0; t.hp = 100000; t.armor = 100000;
  t.aimTarget = null; t.lastKnown = null; t.fireCd = 9;
  // CT 配步枪
  ct.weapons.primary = 'ak'; ct.weapons.secondary = 'usp';
  ct.slot = 'primary'; ct.ammoMap.ak = 30; ct.reserveMap.ak = 90;
  ct.reaction = 0; ct.aimTarget = t; ct.lastKnown = null; ct.memory = [];
  ct.objCache = null; ct.objAt = 0; ct.aimLostT = 0; ct.peekAt = undefined;
  ct.highPointT = 999; ct.prefireT = 999;
  return { game, ct, t };
}

function place(e, x, y) {
  e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.path = null; e.repathT = 0; e.lastSample = { x, y };
}

// 场景 A：掩体后对枪（bot 在墙东侧下方可见敌人，墙在其身后可做掩体）
{
  const { game, ct, t } = mkSim();
  const m = getMap();
  place(ct, 380, 340);
  place(t, 240, 160);
  const cov0 = coverBehind(ct, t, m);
  ok('INTEGRATION cover found on map', !!cov0, cov0 ? JSON.stringify(cov0) : 'null');

  let fired = false, peeked = false;
  let exposed = 0, hidden = 0;
  let minAnchorD = 1e9, maxAnchorD = 0;
  const N = 240; // ~8s @ 30fps
  for (let i = 0; i < N; i++) {
    update(game, 1 / 30);
    if (ct.dead) break;
    if (ct.peekAt !== undefined) peeked = true;
    if (ct.trigger) fired = true;
    if (i > 60) {
      const seen = los(game, t.x, t.y, ct.x, ct.y);
      if (seen) exposed++; else hidden++;
    }
    if (cov0 && i > 90) {
      const ad = Math.hypot(ct.x - cov0.anchorX, ct.y - cov0.anchorY);
      if (ad < minAnchorD) minAnchorD = ad;
      if (ad > maxAnchorD) maxAnchorD = ad;
    }
  }
  ok('INTEGRATION peek engaged (peekAt set)', peeked);
  ok('INTEGRATION fired during peek', fired);
  ok('INTEGRATION exposure intermittent (hidden>0 and exposed>0)', hidden > 0 && exposed > 0,
    'exposed=' + exposed + ' hidden=' + hidden);
  const expFrac = exposed / Math.max(1, exposed + hidden);
  ok('INTEGRATION exposure reduced (<80% exposed)', expFrac < 0.8, 'exposedFrac=' + expFrac.toFixed(3));
  ok('INTEGRATION stays anchored at cover', minAnchorD < 25 && maxAnchorD < 130,
    'min=' + Math.round(minAnchorD) + ' max=' + Math.round(maxAnchorD));
}

// 场景 B：开阔地无掩体 → 不触发 peek（保持原有走位对枪）
{
  const { game, ct, t } = mkSim();
  const m = getMap();
  place(ct, 740, 420);
  place(t, 600, 420);
  ok('INTEGRATION open field no cover', coverBehind(ct, t, m) === null);
  let peeked = false, moved = false, fired = false;
  const N = 60; // ~2s
  for (let i = 0; i < N; i++) {
    update(game, 1 / 30);
    if (ct.peekAt !== undefined) peeked = true;
    if (Math.hypot(ct.vx, ct.vy) > 30) moved = true;
    if (ct.trigger) fired = true;
  }
  ok('INTEGRATION open field does NOT peek', !peeked);
  ok('INTEGRATION open field still fights (fires + moves)', fired && moved);
}

console.log('fx-ai-peek: ' + (failN === 0 ? 'all PASS' : failN + ' FAIL of ' + passN));
process.exit(failed ? 1 : 0);
