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
