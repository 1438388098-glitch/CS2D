// 排位段位系统（candidate-587）：经典对局结算 RR，段位与晋级可视化。
// 经典爆破此前只有胜负没有持久竞技分；RR 由胜负主导向 + 击杀/死亡微调，段位纯函数可单测。
const KEY = 'cs2d_ranked_v1';

export const TIERS = [
  { name: '青铜', min: 0, color: '#b07a3c' },
  { name: '白银', min: 800, color: '#b9c2cd' },
  { name: '黄金', min: 1200, color: '#ffd34d' },
  { name: '铂金', min: 1600, color: '#7fd9c4' },
  { name: '钻石', min: 2000, color: '#5ab0ff' },
  { name: '星辰', min: 2400, color: '#c39dff' },
  { name: '巅峰', min: 2800, color: '#ff6b4d' }
];
export const RR_MAX = 3000;

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}

export function loadRanked() {
  const s = store();
  let d = { rr: 800, played: 0, w: 0 };
  if (s) {
    try {
      const raw = s.getItem(KEY);
      if (raw) d = Object.assign(d, JSON.parse(raw));
    } catch (e) { /* 坏档重建 */ }
  }
  d.rr = Math.max(0, Math.min(RR_MAX, Number(d.rr) || 0));
  return d;
}

function saveRanked(d) {
  const s = store();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 配额满忽略 */ }
}

export function tierOf(rr) {
  let t = TIERS[0];
  for (const x of TIERS) if (rr >= x.min) t = x;
  return t;
}

// 纯函数：结算 RR 增量（可单测）。胜：+18 基础 + 表现加成（KD>1 至 +7）；负：-22 基础 + 表现减免（KD>1 至 +8）
export function rrDelta(win, kills, deaths, bonus) {
  const kd = deaths > 0 ? kills / deaths : kills;
  const b = Number(bonus) || 0;
  if (win) return Math.round(18 + b + Math.min(7, Math.max(0, (kd - 1) * 8)));
  return Math.round(-22 + b + Math.min(8, Math.max(0, (kd - 1) * 8)));
}

// finishMatch 调用（经典模式限定）：结算并返回 {delta, rr, tier, promoted}
export function settleRanked(game, win, bonus) {
  if (!game || game.mode || !game.player) return null;
  const d = loadRanked();
  const before = tierOf(d.rr);
  const delta = rrDelta(win, game.player.kills || 0, game.player.deaths || 0, bonus);
  d.rr = Math.max(0, Math.min(RR_MAX, d.rr + delta));
  d.played = (d.played || 0) + 1;
  if (win) d.w = (d.w || 0) + 1;
  saveRanked(d);
  const after = tierOf(d.rr);
  return { delta, rr: d.rr, tier: after.name, color: after.color, promoted: after.min > before.min, demoted: after.min < before.min };
}

export function rankedSummary() {
  const d = loadRanked();
  const t = tierOf(d.rr);
  return { rr: d.rr, tier: t.name, color: t.color, played: d.played || 0, w: d.w || 0 };
}
