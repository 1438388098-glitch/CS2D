// HLTV rating 动态锚点计算
// 锚点逻辑: 锚 1.00 = 当前联赛所有 active roster 的 p.rating 中位数
// 跨联赛对比无意义, 所以按 league 分组计算

// LEAGUE_RULES 副本 (避免循环依赖: manager -> hltv-rating -> hltv-baseline)
const LEAGUE_RATING_RANGES = {
  甲级: [80, 92],
  乙级: [70, 85],
  丙级: [60, 74]
};

/**
 * 收集一个联赛所有 active roster 的选手 rating 列表
 * 玩家 roster + 该联赛所有 AI 队 roster
 * @param {object} state - manager state
 * @param {string} league - '甲级' | '乙级' | '丙级'
 * @returns {number[]} - 选手 rating 列表
 */
export function collectLeagueRatings(state, league) {
  const ratings = [];
  // 玩家队伍 (如果在同一联赛)
  if (state.team.league === league) {
    for (const p of state.team.roster || []) {
      if (typeof p.rating === 'number') ratings.push(p.rating);
    }
  }
  // AI 队
  for (const t of state.season.teams || []) {
    if (t.id === 'player') continue;
    if (t.league && t.league !== league) continue;
    // AI 队 rating 是队伍平均, 用作该队所有选手的近似值
    if (typeof t.rating === 'number') {
      // 一队 5 人, 把 t.rating 复制 5 次
      for (let i = 0; i < 5; i++) ratings.push(t.rating);
    }
  }
  return ratings;
}

/**
 * 计算一个联赛的 HLTV 锚点 (rating 中位数)
 * @param {object} state
 * @param {string} league
 * @returns {number} - baseline rating (中位数), 默认 70 (乙级中位)
 */
export function hltvBaseline(state, league) {
  const ratings = collectLeagueRatings(state, league);
  if (ratings.length === 0) {
    // fallback: 用 LEAGUE_RATING_RANGES 的中点
    const range = LEAGUE_RATING_RANGES[league] || LEAGUE_RATING_RANGES['乙级'];
    return (range[0] + range[1]) / 2;
  }
  // 中位数
  const sorted = ratings.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

/**
 * 把某个数值 (attr 0-99) 归一化到 1.00 锚点的 sub-rating
 * 1.00 = 锚点 baseline, 偏离按比例缩放
 * 公式: 1 + (value - baseline) / baseline * scale
 * @param {number} value - 原始数值
 * @param {number} baseline - 锚点值
 * @param {number} scale - 灵敏度 (默认 1.5, 越大越敏感)
 * @returns {number} - sub-rating (0.5 - 1.5 区间常见)
 */
export function normalizeToBaseline(value, baseline, scale = 1.5) {
  if (baseline <= 0) return 1.0;
  const raw = 1 + (value - baseline) / baseline * scale;
  return Math.max(0.5, Math.min(1.5, raw));
}

// ============== 动态分项锚点（阶段 2：接入 computePlayerHltv）==============
// 60 rating 选手的单场基准分项（与 hltv-rating 原硬编码锚一致）：
// 0.65 KPR / 0.65 DPR / 80 ADR / 60% KAST / 1.5 impact
export const BASE_ANCHORS = { kpr: 0.65, dpr: 0.65, adr: 80, kast: 0.6, impact: 1.5 };

// 把联赛中位 rating 换算成分项锚点：线性缩放（甲级中位 ~86 → KPR 锚 0.93）。
// KAST 是比例型指标不随水平缩放；其余按 median/60 线性放大。
export function anchorsForRating(medianRating) {
  const k = clampNum(Number(medianRating) || 60, 30, 120) / 60;
  return {
    kpr: BASE_ANCHORS.kpr * k,
    dpr: BASE_ANCHORS.dpr * k,
    adr: BASE_ANCHORS.adr * k,
    kast: BASE_ANCHORS.kast,
    impact: BASE_ANCHORS.impact * k
  };
}

// 联赛动态锚点：锚 1.00 = 该联赛中位水平的选手单场表现
export function leagueAnchors(state, league) {
  return anchorsForRating(hltvBaseline(state, league));
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
