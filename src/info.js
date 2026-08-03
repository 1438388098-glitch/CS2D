// 队内信息共享黑板：bot 感知事件 → 消息 → 同队消费（非透视，信息带衰减）
// 消息类型：目击 SIGHT / 受击 DMG / 枪声 SHOT / 击杀 KILL
// 公平性：只传播 bot 自己感知到的信息；通信半径限制（落单队友收不到远处情报）；
// 信息衰减：消息越老，坐标越模糊（人类"大概在那个方向"），且置信度随时间下降
import { BOT_AI } from './config.js';
import { ctx } from './ctx.js';
import { rand } from './utils.js';

export const MSG = { SIGHT: 'sight', DMG: 'dmg', SHOT: 'shot', KILL: 'kill' };

const MAX_MSG = 24;
const REPORT_COOLDOWN = 1.0;
const MAX_AGE = 6.0;

export function initInfo(game) {
  game.info = { t: [], ct: [] };
  game.commLog = [];
}

function board(game, team) {
  return game.info[team === 't' ? 't' : 'ct'];
}

function push(game, team, msg) {
  const b = board(game, team);
  b.push(msg);
  if (b.length > MAX_MSG) b.splice(0, b.length - MAX_MSG);
  if (game.commLog && game.commLog.length < 40) {
    game.commLog.push({ t: Math.floor(game.time), team, type: msg.type, x: Math.round(msg.x), y: Math.round(msg.y) });
  }
}

// 报告感知事件（带每 bot 每类冷却，防刷屏）
// intel 模式（H11 信息优势）：消息全图共享（无通信半径）+ 位置精确（无模糊）+ 更长有效期
export function report(game, e, type, x, y) {
  if (!game.info || !e.bot) return;
  if (!e.lastReport) e.lastReport = {};
  if (game.time - (e.lastReport[type] || -9) < REPORT_COOLDOWN) return;
  e.lastReport[type] = game.time;
  const intel = !!(e.aiParams && e.aiParams.intel);
  push(game, e.team, {
    type, x, y,
    t: game.time,
    srcX: e.x, srcY: e.y,
    intel
  });
}

// 查询黑板：返回该 bot 当前"最有价值"的可信消息，模糊化后返回
// 返回 {x, y, age, type} 或 null。模糊圈随年龄扩大：err = 30 + age*90；intel 消息精确且半径无限
export function query(game, e) {
  if (!game.info) return null;
  const b = board(game, e.team);
  let best = null;
  for (const m of b) {
    const ageLimit = m.intel ? 30 : MAX_AGE;
    const age = game.time - m.t;
    if (age > ageLimit) continue;
    // 通信半径：消息源离自己太远则收不到（intel 模式无限）
    if (!m.intel) {
      const d = Math.hypot(m.srcX - e.x, m.srcY - e.y);
      if (d > (BOT_AI.COM_RADIUS || 1200)) continue;
    }
    // 价值分：越新越高，目击 > 枪声 > 受击 > 击杀（对防守方 kill 优先级高）
    const prio = m.type === MSG.SIGHT ? 4 : (m.type === MSG.SHOT ? 3 : (m.type === MSG.DMG ? 2 : 1));
    const score = prio * 10 - age;
    if (!best || score > best.score) best = { m, score };
  }
  if (!best) return null;
  const m = best.m;
  const age = game.time - m.t;
  const err = m.intel ? 0 : 30 + age * 90;
  return {
    x: m.x + rand(-err, err),
    y: m.y + rand(-err, err),
    age,
    type: m.type
  };
}

// 黑板维护：清空过时消息（惰性，查询时已过滤；此处仅作容量兜底）
export function prune(game) {
  if (!game.info) return;
  for (const team of ['t', 'ct']) {
    const b = board(game, team);
    for (let i = b.length - 1; i >= 0; i--) {
      if (game.time - b[i].t > MAX_AGE * 2) b.splice(i, 1);
    }
  }
}

// H11 实时位置流（intel 极致版）：CT 位置实时广播，走独立队列（不污染黑板消息流）
export function intelBroadcast(game, id, x, y) {
  if (!game.ctStream) game.ctStream = new Map();
  game.ctStream.set(id, { x, y, t: game.time });
  if (game.ctStream.size > 8) {
    // 裁剪最旧
    let oldest = null;
    for (const [k, v] of game.ctStream) if (!oldest || v.t < oldest.v.t) oldest = { k, v };
    if (oldest) game.ctStream.delete(oldest.k);
  }
}

// 查询实时位置流（H11 决策专用）：返回 [ {x, y, age} ... ]
export function queryAll(game, e) {
  if (!game.ctStream || !e.aiParams || !e.aiParams.intel) return [];
  const out = [];
  for (const [, v] of game.ctStream) {
    const age = game.time - v.t;
    if (age > 30) continue;
    out.push({ x: v.x, y: v.y, age, type: 'sight' });
  }
  return out;
}
