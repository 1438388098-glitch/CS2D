import { resetManager, setStorage, setRng, getState, __clearManagerStateForTest, save, VERSION, accumulateMatchStats, awardSeasonEnd, resetTournamentStats, migrateManagerState, advanceDate, nextSeason, seasonReport } from '../src/manager.js';
import { accumulateTournamentStats, selectTournamentMvp, updateYearlyRating, yearlyTop as yearlyTopPure, TOURNAMENT_WEIGHTS } from '../src/hltv-rating.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('tournament: ' + name + ' FAIL');
  console.log('tournament: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

const store = fakeStorage();
setStorage(store);
setRng(() => 0.5);

// ================== hltv-rating.js 纯函数测试 ==================

// 1. TOURNAMENT_WEIGHTS 系数
ok('TOURNAMENT_WEIGHTS.league = 1.0', TOURNAMENT_WEIGHTS.league === 1.0);
ok('TOURNAMENT_WEIGHTS.cup = 1.8', TOURNAMENT_WEIGHTS.cup === 1.8);

// 2. accumulateTournamentStats 累加
const stats = { type: 'league', weight: 1.0, entries: {} };
accumulateTournamentStats(stats, 'Kursy', 'player', 1.20, { gameType: 'league', gameWeight: 1.0 });
accumulateTournamentStats(stats, 'Kursy', 'player', 1.10, { gameType: 'league', gameWeight: 1.0 });
accumulateTournamentStats(stats, 'gr1ks', 'player', 0.95, { gameType: 'league', gameWeight: 1.0 });
ok('累加 Kursy.hltvSum = 2.30', Math.abs(stats.entries['Kursy'].hltvSum - 2.30) < 0.001);
ok('累加 Kursy.games = 2', stats.entries['Kursy'].games === 2);
ok('累加 Kursy.bestHlo = 1.20', Math.abs(stats.entries['Kursy'].bestHlo - 1.20) < 0.001);
ok('累加 gr1ks 独立', stats.entries['gr1ks'].games === 1);

// 3. selectTournamentMvp 选最高 avg
const mvp = selectTournamentMvp(stats, 2);
ok('MVP 是 Kursy (avg 1.15)', mvp && mvp.name === 'Kursy' && Math.abs(mvp.avgHlo - 1.15) < 0.001);
ok('MVP 含 awardPoints', typeof mvp.awardPoints === 'number');
ok('MVP awardPoints = 1.0 × (1.15-1.0) × 10 = 1.5', Math.abs(mvp.awardPoints - 1.5) < 0.001);
ok('MVP 含 weight = 1.0', mvp.weight === 1.0);

// 4. minGames 过滤
const noMvp = selectTournamentMvp(stats, 5);
ok('minGames=5 时不返回 (无达标选手)', noMvp === null);

// 5. 杯赛系数 (weight 1.8)
const cupStats = { type: 'cup', weight: 1.8, entries: {} };
accumulateTournamentStats(cupStats, 'Kursy', 'player', 1.15, { gameType: 'cup', gameWeight: 1.8 });
const cupMvp = selectTournamentMvp(cupStats, 1);
ok('杯赛 MVP weight = 1.8', cupMvp.weight === 1.8);
ok('杯赛 awardPoints = 1.8 × 0.15 × 10 = 2.7', Math.abs(cupMvp.awardPoints - 2.7) < 0.001);

// 6. updateYearlyRating 累加
const yr = { year: 2026, entries: [] };
updateYearlyRating(yr, { name: 'A', team: 'player', hltv: 1.2, gameType: 'league' });
updateYearlyRating(yr, { name: 'A', team: 'player', hltv: 1.1, gameType: 'cup' });
updateYearlyRating(yr, { name: 'B', team: 'opp', hltv: 1.4, gameType: 'league' });
ok('A 累加 2 场', yr.entries.find((e) => e.name === 'A').games === 2);
ok('A 加权分 = 1.2×1.0 + 1.1×1.8 = 3.18', Math.abs(yr.entries.find((e) => e.name === 'A').weightedScore - 3.18) < 0.001);
ok('B 加权分 = 1.4×1.0 = 1.4', Math.abs(yr.entries.find((e) => e.name === 'B').weightedScore - 1.4) < 0.001);
ok('排序 A 在 B 前', yearlyTopPure(yr, 5)[0].name === 'A');

// 7. yearlyTop 返回 Top N
const top3 = yearlyTopPure(yr, 3);
ok('yearlyTop 返回 2 条 (只有 A 和 B)', top3.length === 2);

// ================== manager.js 集成测试 ==================

let s = resetManager();
ok('tournamentStats 字段存在', s.tournamentStats && s.tournamentStats.league && s.tournamentStats.cup);
ok('awards 字段是数组', Array.isArray(s.awards));
ok('yearlyRating.year = 2026', s.yearlyRating.year === 2026);

// 8. accumulateMatchStats 集成
const fakePlayers = [
  { name: 'Kursy', team: 'player', hltv: { total: 1.25 } },
  { name: 'gr1ks', team: 'player', hltv: { total: 1.05 } },
  { name: 'Opp1', team: 'opp', hltv: { total: 0.85 } },
  { name: 'Opp2', team: 'opp', hltv: { total: 0.95 } }
];
accumulateMatchStats(s, { playersWithHltv: fakePlayers, gameType: 'league' });
ok('accumulateMatchStats 联赛: Kursy 累加', s.tournamentStats.league.entries['Kursy'] && s.tournamentStats.league.entries['Kursy'].games === 1);
ok('accumulateMatchStats 联赛: Opp1 也累加', s.tournamentStats.league.entries['Opp1'] && s.tournamentStats.league.entries['Opp1'].games === 1);
ok('accumulateMatchStats 年度: Kursy 累加', s.yearlyRating.entries.find((e) => e.name === 'Kursy') && s.yearlyRating.entries.find((e) => e.name === 'Kursy').games === 1);

// 9. 默认 gameType 由 cup 状态决定
s.season.cup.phase = 'active';
accumulateMatchStats(s, { playersWithHltv: fakePlayers });
ok('杯赛阶段默认 gameType = cup', s.tournamentStats.cup.entries['Kursy'] && s.tournamentStats.cup.entries['Kursy'].games === 1);
s.season.cup.phase = 'idle';

// 10. 模拟完整赛季: 联赛 14 场 + 杯赛若干场
__clearManagerStateForTest();
s = resetManager();
// 联赛 14 场全员 HLO 累加 (minGames 5 能拿到)
for (let i = 0; i < 14; i++) {
  accumulateMatchStats(s, { playersWithHltv: fakePlayers, gameType: 'league' });
}
ok('联赛 14 场后 Kursy.games = 14', s.tournamentStats.league.entries['Kursy'].games === 14);
ok('联赛 avgHlo 累加正确', Math.abs((s.tournamentStats.league.entries['Kursy'].hltvSum / 14) - 1.25) < 0.001);

// 11. awardSeasonEnd 颁奖 (联赛 MVP) - 先清空避免重复
s.awards.length = 0;
s.evps = [];
s.tournamentTeams = [];
awardSeasonEnd(s, seasonReport(s));
ok('联赛 MVP 已颁发', s.awards.length >= 1 && s.awards[0].name === 'Kursy');
ok('awards[0] 含 seasonId', s.awards[0].seasonId === 1);
ok('awards[0] 含 type league', s.awards[0].type === 'league');
ok('awards[0] 含 awardScore', typeof s.awards[0].awardScore === 'number');

// 12. 杯赛 EVP: 累加 + 颁奖
s.season.cup = { phase: 'finished', bracket: [{ round: 'F', a: 't1', b: 't2' }], champion: 't1' };
const cupPlayers = [
  { name: 'Hero', team: 'player', hltv: { total: 1.30 } },
  { name: 'Villain', team: 'opp', hltv: { total: 1.10 } }
];
for (let i = 0; i < 4; i++) {
  accumulateMatchStats(s, { playersWithHltv: cupPlayers, gameType: 'cup' });
}
s.awards.length = 0;
s.evps = [];
s.tournamentTeams = [];
awardSeasonEnd(s, seasonReport(s));
ok('杯赛 MVP 在 awards (Hero 是 player 队, 不在决赛 t1/t2, 应 fallback)', s.awards.find((a) => a.type === 'cup'));
ok('杯赛 EVP 在 evps', s.evps.length >= 1);

// 13. 联赛 MVP minGames 阈值: 不达 5 场不颁
resetTournamentStats(s);
for (let i = 0; i < 3; i++) {
  accumulateMatchStats(s, { playersWithHltv: fakePlayers, gameType: 'league' });
}
s.awards.length = 0;
s.evps = [];
s.tournamentTeams = [];
awardSeasonEnd(s, seasonReport(s));
ok('联赛 3 场 < minGames 5, 不颁 MVP', s.awards.length === 0);

// 14. resetTournamentStats 后清零
resetTournamentStats(s);
ok('reset 后 league.entries 空', Object.keys(s.tournamentStats.league.entries).length === 0);
ok('reset 后 cup.entries 空', Object.keys(s.tournamentStats.cup.entries).length === 0);

// 15. 跨年清零: 触发 maybeRotateYear
__clearManagerStateForTest();
s = resetManager();
// 累加几条
accumulateMatchStats(s, { playersWithHltv: fakePlayers, gameType: 'league' });
ok('年初 yearlyRating.entries 不空', s.yearlyRating.entries.length > 0);
// advanceDate 到下一年
advanceDate(s, 365);  // 跨年
ok('跨年后 yearlyRating.year = 2027', s.yearlyRating.year === 2027);
ok('跨年后 yearlyRating.entries 清零', s.yearlyRating.entries.length === 0);
ok('上年榜单归档', Array.isArray(s.yearlyHistory) && s.yearlyHistory.length === 1 && s.yearlyHistory[0].year === 2026);

// 16. 旧档迁移: v1 缺 tournamentStats / awards / yearlyRating
const oldParsed = { version: 1, team: { bank: 5000, roster: [] }, season: { id: 1 }, board: { trust: 70 }, history: [], news: [], achievements: [] };
const migrated = migrateManagerState(oldParsed);
ok('旧档补 tournamentStats.league', migrated.tournamentStats.league && migrated.tournamentStats.league.weight === 1.0);
ok('旧档补 tournamentStats.cup', migrated.tournamentStats.cup && migrated.tournamentStats.cup.weight === 1.8);
ok('旧档补 awards 数组', Array.isArray(migrated.awards));
ok('旧档补 yearlyRating', migrated.yearlyRating && migrated.yearlyRating.year === 2026);

// 17. nextSeason 集成: 颁奖 + 重置 + 跨年
__clearManagerStateForTest();
s = resetManager();
// 14 场联赛让 MVP 可颁
for (let i = 0; i < 14; i++) {
  accumulateMatchStats(s, { playersWithHltv: fakePlayers, gameType: 'league' });
}
// 直接调 nextSeason
const nextS = nextSeason();
ok('nextSeason 后 awards.length >= 1', s.awards.length >= 1);
ok('nextSeason 后 tournamentStats 清空', Object.keys(s.tournamentStats.league.entries).length === 0);
ok('nextSeason 后 time.currentISO 跨年', s.time.currentISO.startsWith('2027'));

// 18. awards 中含 awardScore
const leagueAward = s.awards.find((a) => a.type === 'league');
ok('league award 有 awardScore', leagueAward && typeof leagueAward.awardScore === 'number');

// 19. 空 players 数组不挂
accumulateMatchStats(s, {});
ok('空 players 不抛错', true);
accumulateMatchStats(s, { playersWithHltv: [] });
ok('空数组不挂', true);

console.log('tournament: all PASS');
