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
export function report(game, e, type, x, y) {
  if (!game.info || !e.bot) return;
  if (!e.lastReport) e.lastReport = {};
  if (game.time - (e.lastReport[type] || -9) < REPORT_COOLDOWN) return;
  e.lastReport[type] = game.time;
  push(game, e.team, {
    type, x, y,
    t: game.time,
    srcX: e.x, srcY: e.y
  });
}

// 查询黑板：返回该 bot 当前"最有价值"的可信消息（通信半径内 + 未过期），模糊化后返回
// 返回 {x, y, age, type} 或 null。模糊圈随年龄扩大：err = 30 + age*90
export function query(game, e) {
  if (!game.info) return null;
  const b = board(game, e.team);
  let best = null;
  for (const m of b) {
    const age = game.time - m.t;
    if (age > MAX_AGE) continue;
    // 通信半径：消息源离自己太远则收不到（模拟无线电范围）
    const d = Math.hypot(m.srcX - e.x, m.srcY - e.y);
    if (d > (BOT_AI.COM_RADIUS || 1200)) continue;
    // 价值分：越新越高，目击 > 枪声 > 受击 > 击杀（对防守方 kill 优先级高）
    const prio = m.type === MSG.SIGHT ? 4 : (m.type === MSG.SHOT ? 3 : (m.type === MSG.DMG ? 2 : 1));
    const score = prio * 10 - age;
    if (!best || score > best.score) best = { m, score };
  }
  if (!best) return null;
  const m = best.m;
  const age = game.time - m.t;
  const err = 30 + age * 90;
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
