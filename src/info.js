// 队内信息共享黑板：bot 感知事件 → 消息 → 同队消费（非透视，信息带衰减）
// 消息类型：目击 SIGHT / 受击 DMG / 枪声 SHOT / 击杀 KILL
// 公平性：只传播 bot 自己感知到的信息；通信半径限制（落单队友收不到远处情报）；
// 信息衰减：消息越老，坐标越模糊（人类"大概在那个方向"），且置信度随时间下降
import {BOT_AI} from './config.js';
;
import {rand} from './utils.js';

export const MSG = { SIGHT: 'sight', DMG: 'dmg', SHOT: 'shot', KILL: 'kill', FOCUS: 'focus' };

// 消息置信标定（info.js 内定义）：
// 击杀=尸体精确位置（最强情报）→ 0.7；目击=直接全身看到 → 1.0；
// 枪声受遮挡/音源模糊影响 → 0.55；受击大致方向 → 0.5；脚步只能大致定位 → 0.4（最低档）
// 类型区分：脚步（'step'）与枪声（MSG.SHOT）分开标定，脚步不会被当作枪声的高置信情报。
// 注：MSG 导出常量保持不变（兼容既有测试），'step' 类型按字符串处理，供上报方按需报告。
const MSG_CONF = {
  sight: 1.0,
  focus: 1.0,
  kill: 0.7,
  shot: 0.55,
  dmg: 0.5,
  step: 0.4
};

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
// conf 可选（第 6 参）：显式置信；缺省时 query 按消息类型回退到 MSG_CONF 标定
export function report(game, e, type, x, y, conf) {
  if (!game.info || !e.bot) return;
  if (!e.lastReport) e.lastReport = {};
  if (game.time - (e.lastReport[type] || -9) < REPORT_COOLDOWN) return;
  e.lastReport[type] = game.time;
  const intel = !!(e.aiParams && e.aiParams.intel);
  const msg = {
    type, x, y,
    t: game.time,
    srcX: e.x, srcY: e.y,
    intel,
    igl: !!e.igl
  };
  if (Number.isFinite(conf)) msg.conf = conf;
  push(game, e.team, msg);
}

// 查询黑板：返回该 bot 当前"最有价值"的可信消息，模糊化后返回
// 返回 {x, y, age, type} 或 null。模糊圈随年龄扩大：err = 30 + age*90；intel 消息精确且半径无限
export function query(game, e) {
  if (!game.info) return null;
  const b = board(game, e.team);
  let best = null;
  for (const m of b) {
    const ageLimit = m.intel ? 30 : (m.type === MSG.FOCUS ? 5 : MAX_AGE);
    const age = game.time - m.t;
    if (age > ageLimit) continue;
    // 通信半径：消息源离自己太远则收不到（intel 模式无限）
    if (!m.intel) {
      const d = Math.hypot(m.srcX - e.x, m.srcY - e.y);
      // 空间门控：基础通信半径缩小，且来源在自身背后时更短（减少全队"隔墙透视"定位感）
      const radius = m.igl ? Math.max(900, Math.hypot(game.mapW || 2400, game.mapH || 1800) * 0.3) : Math.max(BOT_AI.COM_RADIUS || 700, Math.hypot(game.mapW || 2400, game.mapH || 1800) * 0.24);
      if (d > radius) continue;
      if (d > 420) {
        const toSrc = Math.atan2(m.srcY - e.y, m.srcX - e.x);
        const faceDot = Math.cos(e.angle - toSrc);
        if (faceDot < -0.3) continue;
      }
    }
    // 价值分 = 置信度 × 类型优先级 − 年龄：
    // 击杀（尸体=精确位置，高置信）> 目击 > 枪声 > 受击 > 脚步；
    // 置信加权防止低置信大龄消息压过新鲜的强情报（对防守方 kill 优先级高）
    const conf = (m.conf !== undefined && m.conf !== null) ? m.conf : (MSG_CONF[m.type] || 0.5);
    const prio = m.type === MSG.FOCUS ? 6
      : (m.type === MSG.SIGHT ? 4
        : (m.type === MSG.KILL ? 4
          : (m.type === MSG.SHOT ? 3
            : (m.type === MSG.DMG ? 2
              : (m.type === 'step' ? 2 : 1)))));
    const score = conf * prio * 10 - age;
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
