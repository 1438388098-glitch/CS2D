// HLTV Round2 测试：Top20 即时发布 / 荣誉按年过滤 / awardSeasonEnd 空引用防御 / yearlyHistory 声明。
// 契约：
//   nextSeason —— 跳年结算时立即发布上年 Top20（不再延迟到新赛季首场比赛的 advanceDate）；
//                 yearlyRating 年份切到新年；日期跳到下一年 01-05。
//   publishYearlyTop20（经 nextSeason/maybeRotateYear 触发）—— awards/evps 按颁奖日期年份过滤，
//                 往年荣誉不再计入本年荣誉分。
//   awardSeasonEnd —— evpList 为空而最佳阵容非空（防御路径）不再抛空引用；
//                     完全无候选时 result 槽位保持 null。
//   migrateManagerState/baseManager —— yearlyHistory 恒为数组。
import assert from 'node:assert/strict';
import {
  resetManager, setStorage, setRng, getState, __clearManagerStateForTest,
  nextSeason, migrateManagerState, awardSeasonEnd
} from '../src/manager.js';
import { accumulateTournamentStats } from '../src/hltv-rating.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('hltv-award-timing: ' + name + ' FAIL');
  console.log('hltv-award-timing: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => k && map.delete(k), map };
}

setStorage(fakeStorage());
setRng(() => 0.5);

// ---- 1. nextSeason 立即发布 Top20 ----
{
  __clearManagerStateForTest();
  const s = resetManager();
  s.time.currentISO = '2026-03-01';
  accumulateTournamentStats(s.tournamentStats.league, 'Hero', 'player', 1.3, { gameType: 'league', gameWeight: 1.0 });
  accumulateTournamentStats(s.tournamentStats.league, 'Hero', 'player', 1.2, { gameType: 'league', gameWeight: 1.0 });
  accumulateTournamentStats(s.tournamentStats.league, 'Villain', 't3', 1.1, { gameType: 'league', gameWeight: 1.0 });

  const s2 = nextSeason();
  ok('日期跳到下一年 01-05', s2.time.currentISO.startsWith('2027-01-05'));
  ok('Top20 在结算时立即发布', s2.yearlyTop20 && s2.yearlyTop20.year === 2026);
  ok('Top20 含 Hero', !!(s2.yearlyTop20 && s2.yearlyTop20.entries.find((e) => e.name === 'Hero')));
  ok('yearlyRating 切到新年', s2.yearlyRating.year === 2027 && s2.yearlyRating.entries.length === 0);
  ok('赛事统计已重置', Object.keys(s2.tournamentStats.league.entries).length === 0);
  ok('Top20 已入历史', s2.yearlyTop20History.some((h) => h.year === 2026));
}

// ---- 2. 荣誉按年过滤（E3）----
{
  __clearManagerStateForTest();
  const s = resetManager();
  // 2025 年的旧荣誉 + 2026 年的新荣誉
  s.awards.push({ seasonId: 1, type: 'league', name: 'OldStar', team: 't1', avgHlo: 1.4, awardScore: 5, date: '2025-06-01' });
  s.awards.push({ seasonId: 2, type: 'league', name: 'NewStar', team: 'player', avgHlo: 1.2, awardScore: 5, date: '2026-06-01' });
  s.time.currentISO = '2026-12-20';
  const s2 = nextSeason();
  const top = s2.yearlyTop20;
  ok('Top20 已发布（2026）', top && top.year === 2026);
  const newStar = top.entries.find((e) => e.name === 'NewStar');
  const oldStar = top.entries.find((e) => e.name === 'OldStar');
  ok('2026 荣誉计入 NewStar 荣誉分', !!newStar && newStar.totalScore === 5);
  ok('2025 荣誉不进入 2026 榜单（OldStar 缺席或零荣誉分）', !oldStar || oldStar.totalScore === 0);
}

// ---- 3. awardSeasonEnd 空引用防御（D）----
{
  __clearManagerStateForTest();
  const s = resetManager();
  // entries 存在但全部低于 minGames：evpList 空、最佳阵容空 → 不抛错，槽位保持 null
  s.tournamentStats.league.entries = { A: { name: 'A', team: 't1', hltvSum: 6, games: 1, bestHlo: 1.5, weightedScore: 6 } };
  s.tournamentStats.cup.entries = { B: { name: 'B', team: 't2', hltvSum: 4, games: 1, bestHlo: 1.4, weightedScore: 7.2 } };
  s.season.cup.bracket = [{ round: 'F', a: 't2', b: 't3', played: true }];
  let res = null;
  assert.doesNotThrow(() => { res = awardSeasonEnd(s, {}); }, 'no-crash with below-minGames entries');
  ok('evpList 空时槽位 null', res.league === null && res.cup === null);
  ok('未产生 awards/evps', s.awards.length === 0 && s.evps.length === 0);

  // 组合路径：minGames 下全员不可达（evpList 与最佳阵容同时为空）→ 不抛错且槽位保持 null
  // （两侧筛选用同一候选池同一 minGames，防御分支按当前调用形态不可达——与审查结论一致，仅防未来改动）
  s.tournamentStats.cup.entries = { C: { name: 'C', team: 't2', hltvSum: 5, games: 2, bestHlo: 1.6, weightedScore: 9 } };
  let res2 = null;
  assert.doesNotThrow(() => { res2 = awardSeasonEnd({ ...s, tournamentStats: { league: s.tournamentStats.league, cup: { type: 'cup', weight: 1.8, entries: { C: { name: 'C', team: 't2', hltvSum: 5, games: 2, bestHlo: 1.6, weightedScore: 9 } } } } }, {}); }, 'no-crash when both pools below minGames');
  ok('双池均低于 minGames 时槽位 null', res2.cup === null && res2.league === null);

  // 正常路径：杯赛决赛两队限制 + MVP/最佳阵容同时产出
  const cupEntries = {
    FinalA: { name: 'FinalA', team: 't2', hltvSum: 6, games: 3, bestHlo: 1.5, weightedScore: 10.8 },
    FinalB: { name: 'FinalB', team: 't3', hltvSum: 5, games: 3, bestHlo: 1.4, weightedScore: 9 },
    Outsider: { name: 'Outsider', team: 't9', hltvSum: 9, games: 3, bestHlo: 1.9, weightedScore: 16.2 }
  };
  const sCup = { ...s, season: { ...s.season, cup: { phase: 'done', bracket: [{ round: 'F', a: 't2', b: 't3', played: true }] } }, tournamentStats: { league: s.tournamentStats.league, cup: { type: 'cup', weight: 1.8, entries: JSON.parse(JSON.stringify(cupEntries)) } } };
  sCup.season.teams = [{ id: 't2', roster: [{ name: 'FinalA', role: '突破' }] }, { id: 't3', roster: [{ name: 'FinalB', role: '狙击' }] }, { id: 't9', roster: [{ name: 'Outsider', role: '步枪' }] }];
  const res3 = awardSeasonEnd(sCup, {});
  ok('决赛队外的高分选手不拿杯赛 MVP', !!(res3.cup && res3.cup.mvp && res3.cup.mvp.name !== 'Outsider'));
  ok('最佳阵容产出且含决赛队选手', !!(res3.cup.team && res3.cup.team.players.some((p) => p.name === 'FinalA' || p.name === 'FinalB')));
}

// ---- 4. yearlyHistory 声明（E5）----
{
  __clearManagerStateForTest();
  const s = resetManager();
  ok('baseManager 声明 yearlyHistory', Array.isArray(s.yearlyHistory));
  const migrated = migrateManagerState({ team: {}, season: {} });
  ok('migrate 补齐 yearlyHistory', Array.isArray(migrated.yearlyHistory));
}

console.log('hltv-award-timing: all PASS');
