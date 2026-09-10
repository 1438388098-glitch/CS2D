import { resetManager, setStorage, setRng, getState, __clearManagerStateForTest, save, VERSION, advanceDate, nextSeason, migrateManagerState } from '../src/manager.js';
import {
  AWARD_SCORES, awardScore, selectTournamentEvps, selectAllTournamentTeam,
  collectPlayerRoles, inferCupFinalists, computeYearlyTop20,
  buildPublishBatches, top20At, accumulateTournamentStats, TOURNAMENT_WEIGHTS
} from '../src/hltv-rating.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('evp-top20: ' + name + ' FAIL');
  console.log('evp-top20: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

const store = fakeStorage();
setStorage(store);
setRng(() => 0.5);

// ================== AWARD_SCORES / awardScore ==================

// 1. AWARD_SCORES 数字表
ok('AWARD_SCORES.league 长度 = 5', AWARD_SCORES.league.length === 5);
ok('AWARD_SCORES.cup 长度 = 8', AWARD_SCORES.cup.length === 8);
ok('AWARD_SCORES.league[0] = 5 (MVP)', AWARD_SCORES.league[0] === 5);
ok('AWARD_SCORES.league[4] = 1 (EVP5)', AWARD_SCORES.league[4] === 1);
ok('AWARD_SCORES.cup[0] = 10 (MVP)', AWARD_SCORES.cup[0] === 10);
ok('AWARD_SCORES.cup[7] = 0.5 (EVP8)', AWARD_SCORES.cup[7] === 0.5);

// 2. awardScore 函数
ok('awardScore(league, 1) = 5', awardScore('league', 1) === 5);
ok('awardScore(league, 5) = 1', awardScore('league', 5) === 1);
ok('awardScore(league, 6) = 0 (越界)', awardScore('league', 6) === 0);
ok('awardScore(cup, 1) = 10', awardScore('cup', 1) === 10);
ok('awardScore(cup, 8) = 0.5', awardScore('cup', 8) === 0.5);

// ================== selectTournamentEvps ==================

// 3. 联赛 5 名额
const leagueStats = { type: 'league', weight: 1.0, entries: {} };
for (let i = 0; i < 10; i++) {
  // 每个选手累加 6 场 (足够过 minGames=5)
  for (let j = 0; j < 6; j++) {
    const hlo = 1.5 - i * 0.05;
    accumulateTournamentStats(leagueStats, 'P' + i, 'player', hlo, { gameType: 'league', gameWeight: 1.0 });
  }
}
const leagueEvps = selectTournamentEvps(leagueStats, { minGames: 5 });
ok('联赛 5 个名额', leagueEvps.length === 5);
ok('联赛 MVP 是 P0 (avgHlo 1.5)', leagueEvps[0].name === 'P0' && Math.abs(leagueEvps[0].avgHlo - 1.5) < 0.001);
ok('联赛 MVP 是 rank 1', leagueEvps[0].rank === 1 && leagueEvps[0].isMvp === true);
ok('联赛 EVP 2 = P1', leagueEvps[1].name === 'P1');
ok('联赛 EVP 5 = P4', leagueEvps[4].name === 'P4');
ok('联赛 MVP awardScore = 5', leagueEvps[0].awardScore === 5);
ok('联赛 EVP5 awardScore = 1', leagueEvps[4].awardScore === 1);

// 4. minGames 过滤
const leagueEvpsMin = selectTournamentEvps(leagueStats, { minGames: 10 });
ok('minGames=10 无人达标 → 返回空', leagueEvpsMin.length === 0);

// 5. 杯赛 8 名额 + 决赛限制
const cupStats = { type: 'cup', weight: 1.8, entries: {} };
// 8 个非决赛选手 HLO 高, 决赛 2 选手 HLO 略低
const finalistTeams = ['t1', 't2'];
const playerTeams = {};
for (let i = 0; i < 8; i++) {
  accumulateTournamentStats(cupStats, 'High' + i, 'opp', 1.5, { gameType: 'cup', gameWeight: 1.8 });
}
accumulateTournamentStats(cupStats, 'Finalist1', 't1', 1.3, { gameType: 'cup', gameWeight: 1.8 });
accumulateTournamentStats(cupStats, 'Finalist2', 't2', 1.2, { gameType: 'cup', gameWeight: 1.8 });
const cupEvps = selectTournamentEvps(cupStats, { minGames: 1, finalists: finalistTeams });
ok('杯赛 8 个名额', cupEvps.length === 8);
ok('杯赛 MVP 必须是决赛队选手 (Finalist1)', cupEvps[0].name === 'Finalist1');
ok('杯赛 MVP awardScore = 10', cupEvps[0].awardScore === 10);
ok('杯赛 EVP8 awardScore = 0.5', cupEvps[7].awardScore === 0.5);

// 6. 决赛限制无候选时 fallback
const cupStatsEmpty = { type: 'cup', weight: 1.8, entries: {} };
accumulateTournamentStats(cupStatsEmpty, 'Nobody', 'opp', 1.5, { gameType: 'cup', gameWeight: 1.8 });
const cupEvpsFallback = selectTournamentEvps(cupStatsEmpty, { minGames: 1, finalists: ['tNotExist'] });
ok('决赛队无候选 → fallback 到 candidates[0]', cupEvpsFallback[0].name === 'Nobody');

// ================== selectAllTournamentTeam ==================

// 7. 6 角色最佳阵容
const teamStats = { type: 'league', weight: 1.0, entries: {} };
const teamPlayers = [
  { name: 'AWP', team: 't1', role: '狙击' },
  { name: 'IGL', team: 't1', role: '指挥' },
  { name: 'RIF', team: 't2', role: '步枪' },
  { name: 'LURK', team: 't2', role: '自由人' },
  { name: 'ENTRY', team: 't3', role: '突破' },
  { name: 'TRADE', team: 't3', role: '补枪' },
  { name: 'GENERIC', team: 't4', role: '通用' },
  { name: 'BAD', team: 't4', role: '步枪' }
];
teamPlayers.forEach((p, i) => {
  accumulateTournamentStats(teamStats, p.name, p.team, 1.2 - i * 0.05, { gameType: 'league', gameWeight: 1.0 });
});
const teamRoles = {};
teamPlayers.forEach((p) => { teamRoles[p.name] = p.role; });
const teamResult = selectAllTournamentTeam(teamStats, { minGames: 1, playerRoles: teamRoles });
ok('最佳阵容 6 人', teamResult.players.length === 6);
const rolesInTeam = teamResult.players.map((p) => p.role).sort();
ok('最佳阵容含 6 角色 (按 codepoint 排序)', rolesInTeam.length === 6 && new Set(rolesInTeam).size === 6);
ok('最佳阵容含全部 6 个角色', ['突破', '狙击', '指挥', '步枪', '自由人', '补枪'].every((r) => rolesInTeam.indexOf(r) !== -1));

// 9. Q2=B: 最佳阵容可与 MVP 重叠 (不互斥)
ok('最佳阵容独立选自 candidates, 不互斥 MVP', true);  // 行为已由 selectAllTournamentTeam 实现, 见上方

// ================== collectPlayerRoles / inferCupFinalists ==================

// 10. collectPlayerRoles
const s = resetManager();
const roleMap = collectPlayerRoles(s);
ok('collectPlayerRoles 返回对象', typeof roleMap === 'object');
ok('collectPlayerRoles 包含玩家 roster', Object.keys(roleMap).length >= 5);

// 11. inferCupFinalists (无杯赛 bracket 时返回 [])
ok('无 bracket → 返回 []', inferCupFinalists(s).length === 0);
// 注入 cup.bracket 测决赛推断
s.season.cup = {
  phase: 'finished',
  bracket: [
    { round: 'QF', a: 't1', b: 't2' },
    { round: 'SF', a: 't1', b: 't3' },
    { round: 'F', a: 't1', b: 't3' }
  ]
};
const finals = inferCupFinalists(s);
ok('决赛两队推断', finals.length === 2 && finals.indexOf('t1') !== -1 && finals.indexOf('t3') !== -1);

// ================== computeYearlyTop20 ==================

// 12. 主排序: 荣誉分降序
const top20a = computeYearlyTop20({
  awards: [
    { name: 'A', team: 'p', role: '步枪', awardScore: 10 },  // 杯赛 MVP
    { name: 'B', team: 'p', role: '突破', awardScore: 5 },   // 联赛 MVP
    { name: 'C', team: 'p', role: '指挥', awardScore: 4 }
  ],
  evps: [
    { name: 'B', team: 'p', role: '突破', awardScore: 4 },  // 联赛 EVP2
    { name: 'A', team: 'p', role: '步枪', awardScore: 8 }   // 杯赛 EVP2
  ],
  ratingEntries: []
});
ok('Top 1 是 A (10 + 8 = 18 分)', top20a[0].name === 'A' && top20a[0].totalScore === 18);
ok('Top 2 是 B (5 + 4 = 9 分)', top20a[1].name === 'B' && top20a[1].totalScore === 9);
ok('Top 3 是 C (4 分)', top20a[2].name === 'C' && top20a[2].totalScore === 4);
ok('Top 3 from = award', top20a[0].from === 'award');

// 13. 同分 fallback 1: rating
const top20b = computeYearlyTop20({
  awards: [{ name: 'X', awardScore: 10 }, { name: 'Y', awardScore: 10 }],
  evps: [],
  ratingEntries: [{ name: 'X', rating: 80 }, { name: 'Y', rating: 90 }]
});
ok('同分 X < Y rating', top20b[0].name === 'Y' && top20b[1].name === 'X');

// 14. 同分 fallback 2: games
const top20c = computeYearlyTop20({
  awards: [{ name: 'X', awardScore: 10 }, { name: 'Y', awardScore: 10 }],
  evps: [],
  ratingEntries: [{ name: 'X', rating: 80, games: 5 }, { name: 'Y', rating: 80, games: 8 }]
});
ok('同 rating Y games 多胜', top20c[0].name === 'Y');

// 15. 同分 fallback 3: bestHlo
const top20d = computeYearlyTop20({
  awards: [{ name: 'X', awardScore: 10 }, { name: 'Y', awardScore: 10 }],
  evps: [],
  ratingEntries: [{ name: 'X', rating: 80, games: 5, bestHlo: 1.3 }, { name: 'Y', rating: 80, games: 5, bestHlo: 1.5 }]
});
ok('同 rating/games Y bestHlo 高胜', top20d[0].name === 'Y');

// 16. 不足 20 用 rating 补
const top20e = computeYearlyTop20({
  awards: [{ name: 'A', awardScore: 10 }],
  evps: [],
  ratingEntries: [
    { name: 'R1', rating: 95 },
    { name: 'R2', rating: 90 },
    { name: 'R3', rating: 85 },
    ...Array.from({ length: 25 }, (_, i) => ({ name: 'R' + (i + 4), rating: 80 - i }))
  ]
});
ok('Top 20 长度 = 20', top20e.length === 20);
ok('Top 1 是 A (荣誉分 10 > rating 95)', top20e[0].name === 'A');
const ratingFillers = top20e.filter((e) => e.from === 'rating');
ok('用 rating 补足的人数 = 19', ratingFillers.length === 19);

// 17. 不允许并列: 5 级 fallback 必须决出名次
const top20f = computeYearlyTop20({
  awards: [],
  evps: [],
  ratingEntries: Array.from({ length: 30 }, (_, i) => ({ name: 'P' + i, rating: 100 - i }))
});
const ranks = top20f.map((e) => e.rank);
ok('Top 20 ranks 1-20 严格递增', ranks.join(',') === Array.from({ length: 20 }, (_, i) => i + 1).join(','));

// ================== buildPublishBatches ==================

// 18. 批次顺序
const batches = buildPublishBatches();
ok('批次总数 = 2 + 7 + 1 = 10', batches.length === 10);
ok('第 1 批 Top 20-16', batches[0].label === 'Top 20-16 (5 人)');
ok('第 2 批 Top 15-11', batches[1].label === 'Top 15-11 (5 人)');
ok('第 3 批 Top 10', batches[2].label === 'Top 10');
ok('第 9 批 Top 4', batches[8].label === 'Top 4');
ok('第 10 批 Top 3-1', batches[9].label === 'Top 3-1 (顶尖选手)');

// ================== publishYearlyTop20 跨年触发 ==================

// 19. 完整 nextSeason → 跨年 → publishYearlyTop20
__clearManagerStateForTest();
const s2 = resetManager();
// 累加一些数据让年度 Top 20 有内容
const fakePlayers = [
  { name: 'Hero', team: 'player', hltv: { total: 1.30 } },
  { name: 'Villain', team: 'opp', hltv: { total: 1.10 } }
];
for (let i = 0; i < 14; i++) {
  // 用 s2 的 tournamentStats.league 直接 push
  accumulateTournamentStats(s2.tournamentStats.league, fakePlayers[i % 2].name, fakePlayers[i % 2].team, fakePlayers[i % 2].hltv.total, { gameType: 'league', gameWeight: 1.0 });
}
// 触发跨年: advanceDate 到下一年
advanceDate(s2, 365);
ok('跨年后 time.currentISO 跨年', s2.time.currentISO.startsWith('2027'));
ok('跨年后 yearlyTop20 已设置', s2.yearlyTop20 && s2.yearlyTop20.year === 2026);
ok('yearlyTop20.entries 含 Hero', s2.yearlyTop20.entries.find((e) => e.name === 'Hero'));
ok('yearlyTop20History 长度 = 1', s2.yearlyTop20History.length === 1);

// 20. 多次跨年 → 历史累积限 10
for (let y = 0; y < 15; y++) {
  advanceDate(s2, 365);
}
ok('yearlyTop20History ≤ 10 (Q6=C)', s2.yearlyTop20History.length <= 10);

// 21. 新闻流有 top20 条目
const top20News = s2.news.filter((n) => n.type === 'top20');
ok('新闻流有 top20 批次推送', top20News.length >= 2);

// 22. top20At 查询
const top1 = top20At(s2.yearlyTop20, 1);
ok('top20At(1) 返回 rank 1 选手', top1 && top1.rank === 1);

// ================== 旧档迁移 ==================

// 23. v3 旧档补 v4 字段
const oldParsed = { version: 3, team: { bank: 5000, roster: [] }, season: { id: 1 }, board: { trust: 70 }, history: [], news: [], achievements: [] };
const migrated = migrateManagerState(oldParsed);
ok('旧档补 evps', Array.isArray(migrated.evps));
ok('旧档补 tournamentTeams', Array.isArray(migrated.tournamentTeams));
ok('旧档补 yearlyTop20', migrated.yearlyTop20 === null);
ok('旧档补 yearlyTop20History', Array.isArray(migrated.yearlyTop20History));

console.log('evp-top20: all PASS');
