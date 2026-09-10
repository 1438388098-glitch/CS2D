// HLTV Rating 2.0 风格评分 (自制实现, 锚定 HLTV 方向不复制精确公式)
// 5 分项: Kill (0.25) / Survival (0.20) / KAST (0.15) / Impact (0.20) / Damage (0.20)
// 输入: 单场 playerStats + playerAttrs + 单场回合数 + 锚点 baseline

import { normalizeToBaseline, hltvBaseline } from './hltv-baseline.js';

/**
 * 从 rounds 数组反推该选手的 roundsWon 和 roundsSurvived
 * 简化模型: 队伍赢了回合 -> 该选手 roundsWon++; 没赢 -> roundsSurvived++ (按 1vX 模型存活者)
 * @param {object} playerStats - 单场 stats 对象 {name, team, kills, ...}
 * @param {Array} rounds - 回合数组 [{round, winner, ...}, ...]
 * @returns {{roundsWon: number, roundsSurvived: number}}
 */
export function deriveRoundParticipation(playerStats, rounds) {
  let roundsWon = 0;
  let roundsSurvived = 0;
  for (const r of rounds || []) {
    if (r.winner === playerStats.team) {
      roundsWon++;
    } else {
      roundsSurvived++;
    }
  }
  return { roundsWon, roundsSurvived };
}

/**
 * 计算一个分项 sub-rating
 * 通用实现: 拿一个 raw 值 (kills/round, adr, kast% 等), 用 baseline 归一化
 * baseline 概念: "该联赛平均水平的选手在单场应该有这个 raw 值"
 * @param {number} raw - 原始比率
 * @param {number} baseline - 该联赛对应的 raw 期望值 (60 attr 对应 baseline)
 * @param {number} scale - 灵敏度
 */
function subRating(raw, baseline, scale = 1.5) {
  return normalizeToBaseline(raw, baseline, scale);
}

/**
 * 完整计算一名选手单场 HLTV rating
 * @param {object} playerStats - 单场 stats {name, team, kills, deaths, dmg, plants, defuses, clutches, roundsWon, roundsSurvived}
 * @param {object} playerAttrs - 选手 attrs {aim, react, movement, ...}
 * @param {object} ctx - {rounds, baseline, league}
 * @returns {{total: number, kill: number, survival: number, kast: number, impact: number, damage: number}}
 */
export function computePlayerHltv(playerStats, playerAttrs, ctx) {
  const R = (ctx.rounds && ctx.rounds.length) || 5;

  // 5 个分项的 raw 值 (按 HLTV 定义)
  const kpr = playerStats.kills / R;          // kills per round
  const dpr = playerStats.deaths / R;         // deaths per round
  const adr = playerStats.dmg / R;            // damage per round
  const kastPct = ((playerStats.roundsWon || 0) + (playerStats.roundsSurvived || 0)) / R;  // 0-1
  // Impact: 残局权重高, 击杀权重中
  const impactRaw = playerStats.clutches * 2 + playerStats.kills * 0.3;

  // baseline 锚: 该联赛平均 rating 对应的 raw 值
  // 60 attr 选手单场预期: 0.65 KPR, 0.65 DPR, 80 ADR, 60% KAST, 1.5 impact
  // baseline 由 ctx.baseline 传入 (阶段 1 临时用 60, 阶段 2 用动态)
  const baseline = ctx.baseline || 60;
  const baseKPR = 0.65;
  const baseDPR = 0.65;
  const baseADR = 80;
  const baseKAST = 0.60;
  const baseImpact = 1.5;

  // 5 分项 sub-rating (各以 1.00 为锚)
  const kill = subRating(kpr, baseKPR, 4.0);           // KPR 0.5 -> 0.5, 1.0 -> 1.6
  const survival = subRating(baseDPR * 2 - dpr, baseDPR, 3.0);  // 存活率 = 1 - DPR, 翻转
  const kast = subRating(kastPct, baseKAST, 3.0);
  const impact = subRating(impactRaw, baseImpact, 2.0);
  const damage = subRating(adr, baseADR, 2.0);

  // 5 分项权重 (HLTV 风格: Kill+Surv+KAST 三项基底 60%, Impact+Damage 高位奖励 40%)
  const W_KILL = 0.25;
  const W_SURV = 0.20;
  const W_KAST = 0.15;
  const W_IMPACT = 0.20;
  const W_DAMAGE = 0.20;

  const total =
    kill * W_KILL +
    survival * W_SURV +
    kast * W_KAST +
    impact * W_IMPACT +
    damage * W_DAMAGE;

  return {
    total: Math.round(total * 100) / 100,
    kill: Math.round(kill * 100) / 100,
    survival: Math.round(survival * 100) / 100,
    kast: Math.round(kast * 100) / 100,
    impact: Math.round(impact * 100) / 100,
    damage: Math.round(damage * 100) / 100
  };
}

/**
 * 给一场比赛的所有 players 算 HLTV rating
 * @param {Array} players - simulateManagerMatch 输出的 players 数组 (含 roundsWon/roundsSurvived 已反推)
 * @param {object} state - manager state (用于取 attrs 和 baseline)
 * @param {Array} rounds - 回合数组
 * @returns {Array} - 每个 player 加 {hltv: {total, kill, ...}} 字段
 */
export function computeMatchHltv(players, state, rounds) {
  const baseline = hltvBaseline(state, state.team.league);
  const results = [];
  for (const ps of players) {
    // 找到该选手的 attrs
    let attrs = {};
    if (ps.team === 'player') {
      const p = (state.team.roster || []).find((r) => r.name === ps.name);
      attrs = (p && p.attrs) || {};
    } else {
      // AI 队选手: 用该队 average rating 生成的默认 attrs (简化)
      const t = (state.season.teams || []).find((x) => x.id === ps.team);
      attrs = {
        aim: t ? Math.round(t.rating * 0.95) : 70,
        react: t ? Math.round(t.rating * 0.95) : 70,
        movement: t ? Math.round(t.rating * 0.90) : 70,
        clutch: t ? Math.round(t.rating * 0.85) : 70,
        nade: 60, gameIQ: 60, leadership: 60,
        composure: 60, aggression: 60, discipline: 60
      };
    }
    const hltv = computePlayerHltv(ps, attrs, {
      rounds: rounds,
      baseline: baseline,
      league: state.team.league
    });
    results.push({ ...ps, hltv });
  }
  return results;
}

/**
 * 找一场比赛中 HLO rating 最高的 player (新的 MVP 判定)
 * @param {Array} playersWithHltv - computeMatchHltv 输出
 * @returns {object|null} - MVP 选手, 含 hltv 字段
 */
export function pickHltvMvp(playersWithHltv) {
  if (!playersWithHltv || playersWithHltv.length === 0) return null;
  return playersWithHltv.slice().sort((a, b) =>
    (b.hltv?.total || 0) - (a.hltv?.total || 0)
  )[0];
}

/**
 * 推进选手的 hltvHistory (环形缓冲)
 * @param {object} player - 选手对象
 * @param {number} singleRating - 单场 HLO rating
 * @param {number} ts - 时间戳 (默认 now)
 */
export function updateHltvRolling(player, singleRating, ts = Date.now()) {
  if (!player.hltvHistory) player.hltvHistory = [];
  player.hltvHistory.push({ t: ts, rating: singleRating });
  // 环形缓冲, 只保留最近 10 场
  if (player.hltvHistory.length > 10) {
    player.hltvHistory.splice(0, player.hltvHistory.length - 10);
  }
  // 滚动平均: 指数衰减, 最近更重 (权重 1.5, 1.2, 1.0, 0.8...)
  const history = player.hltvHistory;
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < history.length; i++) {
    const distFromLatest = history.length - 1 - i;
    const w = Math.max(0.3, 1.5 - distFromLatest * 0.15);
    weightedSum += history[i].rating * w;
    weightTotal += w;
  }
  player.hltvRating = Math.round((weightedSum / weightTotal) * 100) / 100;
}

// ============== 赛事级统计 + 年度榜单 ==============
// 赛事重要性系数: 联赛 1.0 (基数) / 杯赛 1.8 (单败赛, 容错低)
// 注: 系数只影响赛事 MVP 的含金量, 不影响 MVP 评选资格
export const TOURNAMENT_WEIGHTS = {
  league: 1.0,
  cup: 1.8
};

// 给一名选手累加一场比赛的赛事级统计
// ctx.gameType: 'league' | 'cup' | 'cup-QF' | 'cup-SF' | 'cup-F'
// ctx.gameWeight: 数字 (= TOURNAMENT_WEIGHTS[ctx.gameType] || 1.0)
export function accumulateTournamentStats(stats, playerName, teamId, hlo, ctx) {
  if (!stats) return;
  if (!stats.entries) stats.entries = {};
  let e = stats.entries[playerName];
  if (!e) {
    e = stats.entries[playerName] = { name: playerName, team: teamId, hltvSum: 0, games: 0, bestHlo: 0, bestGame: null, weightedScore: 0 };
  }
  e.team = teamId;
  e.hltvSum += hlo;
  e.games += 1;
  e.weightedScore += hlo * (ctx.gameWeight || 1.0);
  if (hlo > e.bestHlo) {
    e.bestHlo = hlo;
    e.bestGame = { hlo, gameType: ctx.gameType || 'league' };
  }
}

// 从赛事统计中选出赛事 MVP
// 规则: 至少打过 3 场比赛 (杯赛) 或 5 场 (联赛), 取 avgHlo 最高的
// 返回: { name, team, avgHlo, games, hltvSum, bestHlo, weight, awardPoints }
export function selectTournamentMvp(stats, minGames = 3) {
  if (!stats || !stats.entries) return null;
  const candidates = Object.values(stats.entries).filter((e) => e.games >= minGames);
  if (candidates.length === 0) return null;
  candidates.forEach((e) => { e.avgHlo = Math.round((e.hltvSum / e.games) * 100) / 100; });
  candidates.sort((a, b) => b.avgHlo - a.avgHlo || b.weightedScore - a.weightedScore);
  const top = candidates[0];
  const weight = stats.weight || TOURNAMENT_WEIGHTS[stats.type] || 1.0;
  // 含金量分: weight × (avgHlo - 1.0) × 10, avgHlo < 1.0 时按 0 算
  const awardPoints = Math.round(weight * Math.max(0, top.avgHlo - 1.0) * 10 * 100) / 100;
  return {
    name: top.name,
    team: top.team,
    avgHlo: top.avgHlo,
    games: top.games,
    hltvSum: Math.round(top.hltvSum * 100) / 100,
    bestHlo: top.bestHlo,
    weight,
    awardPoints,
    tournamentType: stats.type || 'league'
  };
}

// 更新年度榜单 (跨赛事累加, 同年所有比赛都进榜)
// entry: { name, team, hltv, gameType }
// 列表按 weightedScore 降序, 限制 Top 50
export function updateYearlyRating(yearly, entry) {
  if (!yearly) return;
  if (!yearly.entries) yearly.entries = [];
  const weight = TOURNAMENT_WEIGHTS[entry.gameType] || 1.0;
  let row = yearly.entries.find((e) => e.name === entry.name);
  if (!row) {
    row = { name: entry.name, team: entry.team, games: 0, hltvSum: 0, weightedScore: 0, bestHlo: 0, lastUpdated: null };
    yearly.entries.push(row);
  }
  row.team = entry.team;
  row.games += 1;
  row.hltvSum += entry.hltv;
  row.weightedScore += entry.hltv * weight;
  if (entry.hltv > row.bestHlo) row.bestHlo = entry.hltv;
  row.lastUpdated = Date.now();
  // 排序 + Top 50
  yearly.entries.sort((a, b) => b.weightedScore - a.weightedScore || b.hltvSum - a.hltvSum);
  if (yearly.entries.length > 50) yearly.entries.length = 50;
}

// 取年度榜单 Top N
export function yearlyTop(yearly, n = 5) {
  if (!yearly || !yearly.entries) return [];
  return yearly.entries.slice(0, n);
}

// ============== EVP / 最佳阵容 / 年度 Top 20 ==============
// EVP 量化分数字表 (整数优先, 顶级赛事 weight 1.8):
//   一般 (league, 5 名额): MVP=5, EVP2=4, EVP3=3, EVP4=2, EVP5=1
//   顶级 (cup,    8 名额): MVP=10, EVP2=8, EVP3=6, EVP4=4, EVP5=3, EVP6=2, EVP7=1, EVP8=0.5
export const AWARD_SCORES = {
  league: [5, 4, 3, 2, 1],
  cup: [10, 8, 6, 4, 3, 2, 1, 0.5]
};

// 算出某个赛事类型 rank N 的量化分. rank 从 1 开始.
export function awardScore(tournamentType, rank) {
  const arr = AWARD_SCORES[tournamentType] || [];
  if (rank < 1 || rank > arr.length) return 0;
  return arr[rank - 1];
}

// 选赛事 EVP 名单 (含 MVP = rank 1). Q1-final-B: 杯赛 MVP 只从决赛两队选手里选
// stats: tournamentStats.{league|cup}
// options:
//   - minGames: 最低场次 (联赛 5, 杯赛 3)
//   - finalists: ['t1','t3'] 杯赛决赛两队 teamId (仅 cup 生效, MVP 限制来源)
//   - playerTeams: { playerName: teamId } 用于查选手所属队伍
// 返回: [{ rank, name, team, avgHlo, games, hltvSum, awardScore, isMvp }, ...] 长度 = 配额数
export function selectTournamentEvps(stats, options = {}) {
  if (!stats || !stats.entries) return [];
  const type = stats.type || 'league';
  const totalSlots = (AWARD_SCORES[type] || []).length;
  const minGames = options.minGames != null ? options.minGames : (type === 'cup' ? 3 : 5);
  const finalists = options.finalists || [];
  const playerTeams = options.playerTeams || {};

  // 1. 候选池: 达到 minGames 的所有选手
  let candidates = Object.values(stats.entries)
    .filter((e) => e.games >= minGames)
    .map((e) => {
      e.avgHlo = Math.round((e.hltvSum / e.games) * 100) / 100;
      return e;
    })
    .sort((a, b) => b.avgHlo - a.avgHlo || b.weightedScore - a.weightedScore);

  if (candidates.length === 0) return [];

  // 2. 选出 MVP (rank 1)
  let mvp = candidates[0];

  // 3. Q1-final-B: 杯赛 MVP 限制 — 只从决赛两队选手里选
  if (type === 'cup' && finalists.length > 0) {
    const finalistCandidates = candidates.filter((c) => {
      // playerTeams 优先 (用于历史数据), 否则用 entry.team
      const team = playerTeams[c.name] || c.team;
      return finalists.indexOf(team) !== -1;
    });
    if (finalistCandidates.length > 0) {
      mvp = finalistCandidates[0];
    }
    // 决赛队没人达到 minGames → fallback 到 candidates[0] (历史可能没数据)
  }

  // 4. 选 EVP 2..totalSlots (不限队伍)
  const evpList = [Object.assign({}, mvp, { rank: 1, isMvp: true })];
  const usedNames = new Set([mvp.name]);
  let slot = 2;
  for (const c of candidates) {
    if (slot > totalSlots) break;
    if (usedNames.has(c.name)) continue;
    evpList.push(Object.assign({}, c, { rank: slot, isMvp: false }));
    usedNames.add(c.name);
    slot++;
  }

  // 5. 给每个 EVP 加 awardScore
  for (const e of evpList) {
    e.awardScore = awardScore(type, e.rank);
  }

  return evpList;
}

// 选赛事最佳阵容 (all-tournament team). Q2=B: 允许与 MVP 重叠
// stats: tournamentStats.{league|cup}
// roles: 角色列表 (默认 6 个)
// options.minGames: 最低场次
// 返回: { players: [{ name, team, role, avgHlo }] }  (顺序按 ROLES)
export function selectAllTournamentTeam(stats, options = {}) {
  if (!stats || !stats.entries) return { players: [] };
  const minGames = options.minGames != null ? options.minGames : 3;
  const candidates = Object.values(stats.entries)
    .filter((e) => e.games >= minGames)
    .map((e) => {
      e.avgHlo = Math.round((e.hltvSum / e.games) * 100) / 100;
      return e;
    })
    .sort((a, b) => b.avgHlo - a.avgHlo || b.weightedScore - a.weightedScore);

  // 给每个 candidate 查角色 — 优先从 playerRoles 传入, 否则降级按 entries 内嵌 role
  // (注: 当前 state 不存选手角色信息, 这里假设 opts.playerRoles 提供; 若没有则按 avgHlo 简单分配)
  const playerRoles = options.playerRoles || {};
  const players = [];
  const taken = new Set();

  // 6 角色优先
  const rolePriority = ['突破', '狙击', '指挥', '步枪', '自由人', '补枪'];
  for (const role of rolePriority) {
    const pick = candidates.find((c) => {
      if (taken.has(c.name)) return false;
      const r = playerRoles[c.name] || c.role;
      return r === role;
    });
    if (pick) {
      players.push({ name: pick.name, team: pick.team, role, avgHlo: pick.avgHlo });
      taken.add(pick.name);
    }
  }

  // 不够 6 人: 按 avgHlo 补位 (剩余名额给位置 '通用')
  for (const c of candidates) {
    if (players.length >= 6) break;
    if (taken.has(c.name)) continue;
    players.push({ name: c.name, team: c.team, role: '通用', avgHlo: c.avgHlo });
    taken.add(c.name);
  }

  return { players };
}

// 收集选手的 role 信息 (从玩家 roster + AI 队 roster)
// state: manager state
// 返回: { playerName: role }
export function collectPlayerRoles(state) {
  const map = {};
  for (const p of state.team.roster || []) {
    if (p && p.name && p.role) map[p.name] = p.role;
  }
  for (const t of state.season.teams || []) {
    for (const p of t.roster || []) {
      if (p && p.name && p.role) map[p.name] = p.role;
    }
  }
  return map;
}

// 从杯赛 bracket 推断决赛两队 teamId
// 返回 ['tX','tY'] 或 [] (无决赛数据)
export function inferCupFinalists(state) {
  const cup = state && state.season && state.season.cup;
  if (!cup || !cup.bracket) return [];
  const final = cup.bracket.find((m) => m.round === 'F');
  if (!final) return [];
  return [final.a, final.b].filter(Boolean);
}

// ============== 年度 Top 20 榜单 ==============
// 输入: 该年度所有 awards + evps + 全年所有选手的 rating 数据
// 规则 (Q3=A 同分 fallback):
//   1. 个人荣誉得分降序
//   2. 同分 → rating 降序
//   3. 再同 → games 降序
//   4. 再同 → bestHlo 降序
//   5. 再同 → impact 降序 (这里用 hltvHistory 里 impact 分项均值近似, 没数据用 0)
//   6. 再同 → damage 降序 (同上)
//   不允许并列
//
// 排名: 不足 20 → 用 rating 补足
// 返回: [{ rank: 1..20, name, team, role, totalScore, rating, bestHlo, games, from: 'award'|'rating' }]
export function computeYearlyTop20(opts) {
  const awards = opts.awards || [];           // [{ name, team, role, avgHlo, weight, awardScore }]
  const evps = opts.evps || [];               // 同上, rank 2..N
  const ratingEntries = opts.ratingEntries || [];  // [{ name, team, role, rating, bestHlo, games }]

  // 1. 合并所有个人荣誉 → 选手维度的总分
  const scoreByPlayer = new Map();  // name → { name, team, role, totalScore, ratings: [], bestHlo, games }
  const addToPlayer = (entry, score, source) => {
    if (!entry || !entry.name) return;
    let row = scoreByPlayer.get(entry.name);
    if (!row) {
      row = { name: entry.name, team: entry.team || '', role: entry.role || '通用', totalScore: 0, rating: 0, bestHlo: 0, games: 0, _impactSum: 0, _impactN: 0, _damageSum: 0, _damageN: 0, _sources: [] };
      scoreByPlayer.set(entry.name, row);
    }
    row.totalScore += (score || 0);
    row._sources.push(source);
  };
  for (const a of awards) addToPlayer(a, a.awardScore != null ? a.awardScore : awardScore(a.type || 'league', 1), 'mvp');
  for (const e of evps) addToPlayer(e, e.awardScore != null ? e.awardScore : awardScore(e.type || 'league', e.rank || 2), 'evp');

  // 2. 合并 rating 数据
  for (const r of ratingEntries) {
    let row = scoreByPlayer.get(r.name);
    if (!row) {
      row = { name: r.name, team: r.team || '', role: r.role || '通用', totalScore: 0, rating: 0, bestHlo: 0, games: 0, _impactSum: 0, _impactN: 0, _damageSum: 0, _damageN: 0, _sources: [] };
      scoreByPlayer.set(r.name, row);
    }
    if ((r.rating || 0) > row.rating) row.rating = r.rating;
    if ((r.bestHlo || 0) > row.bestHlo) row.bestHlo = r.bestHlo;
    row.games += (r.games || 0);
    row._impactSum += (r.impact || 0);
    row._impactN += (r.impact != null ? 1 : 0);
    row._damageSum += (r.damage || 0);
    row._damageN += (r.damage != null ? 1 : 0);
  }

  // 3. 准备排序: 先按 totalScore, 不足 20 补 rating 选手
  // 第一轮: 有 totalScore 的选手按 totalScore 降序
  const scoredPlayers = Array.from(scoreByPlayer.values()).filter((r) => r.totalScore > 0);
  // 第二轮: 用 rating 补 (从 ratingEntries 里取没在 scoredPlayers 里的, 或虽然在里面但要被补)
  // 简单做法: 把所有选手放一起, 主排序 totalScore, 次排序 rating 等
  const allCandidates = Array.from(scoreByPlayer.values());

  // 4. 主排序: Q3=A 5 级 fallback
  allCandidates.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.games !== a.games) return b.games - a.games;
    if (b.bestHlo !== a.bestHlo) return b.bestHlo - a.bestHlo;
    const aImpact = a._impactN ? a._impactSum / a._impactN : 0;
    const bImpact = b._impactN ? b._impactSum / b._impactN : 0;
    if (bImpact !== aImpact) return bImpact - aImpact;
    const aDamage = a._damageN ? a._damageSum / a._damageN : 0;
    const bDamage = b._damageN ? b._damageSum / b._damageN : 0;
    return bDamage - aDamage;
  });

  // 5. 取 Top 20
  const top = allCandidates.slice(0, 20).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    team: r.team,
    role: r.role,
    totalScore: r.totalScore,
    rating: r.rating,
    bestHlo: r.bestHlo,
    games: r.games,
    from: r.totalScore > 0 ? 'award' : 'rating'
  }));

  return top;
}

// 公布批次 (Q4=C 新闻流用)
// 返回: [['Top 20-16'], ['Top 15-11'], ['Top 10'], ['Top 9'], ..., ['Top 4'], ['Top 3','Top 2','Top 1']]
export function buildPublishBatches() {
  const batches = [];
  // 第 1 批: 20-16
  batches.push({ label: 'Top 20-16 (5 人)', ranks: [20, 19, 18, 17, 16] });
  // 第 2 批: 15-11
  batches.push({ label: 'Top 15-11 (5 人)', ranks: [15, 14, 13, 12, 11] });
  // 第 3 批: Top 10 → Top 4 逐个
  for (let r = 10; r >= 4; r--) {
    batches.push({ label: 'Top ' + r, ranks: [r] });
  }
  // 第 4 批: Top 3-1 一起
  batches.push({ label: 'Top 3-1 (顶尖选手)', ranks: [3, 2, 1] });
  return batches;
}

// 取某 rank 在 top20 里的项
export function top20At(top20, rank) {
  if (!top20 || !Array.isArray(top20.entries)) return null;
  return top20.entries.find((e) => e.rank === rank) || null;
}
