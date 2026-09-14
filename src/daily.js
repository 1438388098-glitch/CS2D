// 每日挑战：按日期种子生成固定场景（地图/难度/阵营/ bot 数），打赢即打卡，记录连胜。
// seedWorld 已让整局可复现——每日挑战只是给这个能力一个"今天必须回来"的理由。
import { ctx } from './ctx.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
const KEY = 'cs2d_daily_v1';

const MAP_POOL = ['dust2', 'metro', 'forge', 'atrium', 'arctic', 'harbor'];

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}

// FNV-1a：日期字符串 → 32 位整数种子（确定性）
export function dailySeed(dateStr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

// mulberry32 PRNG：从种子派生场景参数
export function dailyScenario(dateStr) {
  const ds = dateStr || todayStr();
  let t = dailySeed(ds) >>> 0;
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const mapId = MAP_POOL[Math.floor(next() * MAP_POOL.length)];
  const hellLevel = 3 + Math.floor(next() * 6); // H3-H8：有压力但可打
  const team = next() < 0.5 ? 't' : 'ct';
  const bots = 3; // 4v4：比默认 5v5 短，适合打卡
  return { date: ds, mapId, hellLevel, team, bots, seed: dailySeed(ds + '#daily'), label: mapId.toUpperCase() + ' · HELL H' + hellLevel + ' · ' + (team === 't' ? 'T 进攻' : 'CT 防守') };
}

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function loadDaily() {
  const s = store();
  if (!s) return { date: '', done: false, streak: 0, best: 0 };
  try {
    const raw = s.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.date !== todayStr()) return { date: todayStr(), done: false, streak: d.streak || 0, best: d.best || 0 };
      return d;
    }
  } catch (e) { /* 坏档重建 */ }
  return { date: todayStr(), done: false, streak: 0, best: 0 };
}

function saveDaily(d) {
  const s = store();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 配额满忽略 */ }
}

// finishMatch 调用：结算每日挑战（win 由 finishMatch 判定），返回是否为今日首次完成
export function settleDaily(game, win) {
  if (!game || !game.opts || !game.opts.daily) return false;
  const d = loadDaily();
  const firstToday = !d.done;
  if (win) {
    if (!d.done) {
      d.done = true;
      d.streak = (d.streak || 0) + 1;
      d.best = Math.max(d.best || 0, d.streak);
      d.date = todayStr();
    }
  } else {
    d.streak = 0;
    d.date = todayStr();
  }
  saveDaily(d);
  if (win && firstToday) emit('sysfeed', { text: '每日挑战完成 ✓ 连胜 ' + d.streak + ' 天（最佳 ' + d.best + '）' });
  else if (win) emit('sysfeed', { text: '每日挑战今日已打卡，连胜 ' + d.streak + ' 天' });
  else emit('sysfeed', { text: '每日挑战失败，连胜中断 — 明天再来' });
  // 还原玩家此前的设置，避免每日参数泄漏到普通对局
  if (game._dailyBackup) {
    Object.assign(game.opts, game._dailyBackup);
    delete game._dailyBackup;
  }
  delete game.opts.daily;
  return firstToday && win;
}
