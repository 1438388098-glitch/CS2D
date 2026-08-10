import {
  resetCareer, setStorage, setRng, getState, settlePlayerMatch, train, trainTeammate, sellPlayer, sellPreview, buyPlayer, candidates, filterCandidates,
  nextSeason, save, loadCareer, __clearStateForTest, candidateProfile,
  sponsorIncome, sponsorPreview, sponsorSeasonPreview, homeTicketIncome, ticketPreview, cashflowForecast, seasonBudget, financialRisk, financeTrend, seasonFinancialSummary, remainingPrizePreview, transferProfit, facilityStatus, upgradeFacility, formBonus, fatiguePenalty, careerMorale, restPlayer, seasonGoals, goalProgress, trainingPreview, trainingSuggestion, rotationAdvice, trainingHistory, rosterStatus, transferBudget, contractStatus, renewPlayer, rosterContribution, positionBalance,
  achievementDefs, achievements, achievementProgress, careerRecords, migrateCareerState, matchReadiness
} from '../src/career.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('fx-career-growth: ' + name + ' FAIL');
  console.log('fx-career-growth: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map
  };
}

setStorage(fakeStorage());
setRng(() => 0.5);

let s = resetCareer();
ok('new career fields', s.version === 3 && Array.isArray(s.team.ledger) && s.team.morale === 65 && Array.isArray(s.player.form) && s.player.fatigue === 0 && Array.isArray(s.player.achievements) && s.player.records && typeof s.player.records === 'object');
ok('achievement defs', achievementDefs().length >= 6 && achievementDefs()[0].id === 'first_win');
const achProgressStart = achievementProgress(s);
ok('achievement progress start', achProgressStart.total >= 6 && achProgressStart.unlockedCount === 0 && achProgressStart.lockedCount === achProgressStart.total && achProgressStart.pct === 0 && achProgressStart.next && achProgressStart.next.id === 'first_win');

const baseSponsor = sponsorIncome(s);
ok('sponsor positive', baseSponsor > 0);
const playerTeam = s.season.teams.find((t) => t.id === 'player');
const sponsorLow = sponsorIncome({ team: { ...s.team, league: '丙级', morale: 20 }, season: { teams: [{ ...playerTeam, rating: 55 }] } });
const sponsorHigh = sponsorIncome({ team: { ...s.team, league: '甲级', morale: 100 }, season: { teams: [{ ...playerTeam, rating: 95 }] } });
ok('sponsor scales', sponsorHigh > baseSponsor && baseSponsor > sponsorLow);

s = resetCareer();
const sp = sponsorPreview(s);
ok('sponsor preview', sp && sp.current === sponsorIncome(s) && sp.targets.length === 5 && sp.progress >= 0 && sp.remaining >= 0 && sp.seasonProjection >= 0);
s.team.morale = 100;
const playerTeamForSponsor = s.season.teams.find((t) => t.id === 'player');
playerTeamForSponsor.rating = 95;
const spHigh = sponsorPreview(s);
ok('sponsor next tier', spHigh.current > sp.current && (!spHigh.next || spHigh.next.income > spHigh.current));

s = resetCareer();
const sponsorSeason = sponsorSeasonPreview(s);
ok('sponsor season preview', sponsorSeason && sponsorSeason.rows.length === 3 && sponsorSeason.currentLeague === '乙级' && sponsorSeason.likelyLeague && sponsorSeason.currentIncome > 0 && sponsorSeason.delta !== null && sponsorSeason.risk.length > 0);

s = resetCareer();
const ticket = ticketPreview(s);
ok('ticket preview', ticket && ticket.homeWin > ticket.homeLoss && ticket.awayWin === 0 && ticket.seasonEarned === 0 && homeTicketIncome(s, true) > 0);

s = resetCareer();
const cash = cashflowForecast(s);
ok('cashflow forecast', cash && cash.bank === 12000 && cash.remainingLeagueMatches >= 13 && cash.expectedPrize >= 0 && cash.expectedSponsor > 0 && cash.projectedBank > cash.bank && cash.safe === true);

s = resetCareer();
const budgetCtrl = seasonBudget(s);
ok('season budget', budgetCtrl && budgetCtrl.budget > 20000 && budgetCtrl.spent === 0 && budgetCtrl.spendable === budgetCtrl.budget && budgetCtrl.spentPct === 0 && budgetCtrl.warnings.length === 0);
s.team.bank = 3000;
const tightBudget = seasonBudget(s);
ok('season budget warnings', tightBudget.warnings.length >= 1 && tightBudget.warnings.some((w) => w.includes('5000')));

s = resetCareer();
const riskSafe = financialRisk(s);
ok('financial risk safe', riskSafe && riskSafe.score < 50 && riskSafe.level === '安全' && riskSafe.mode === '可投入' && riskSafe.advice.length > 0);
s.team.bank = 1000;
const playerStanding = s.season.standings.find((x) => x.teamId === 'player');
playerStanding.played = Number(s.season.totalRounds) - 1;
const riskTight = financialRisk(s);
ok('financial risk tight', riskTight.score > riskSafe.score && riskTight.level !== '安全' && riskTight.advice.some((a) => a.includes('5000') || a.includes('安全垫') || a.includes('低资金')));

s = resetCareer();
s.team.bank = 5000;
train('aim', 'basic');
const trend = financeTrend(s);
ok('finance trend', trend && trend.rows.length === 1 && trend.rows[0].round === 1 && trend.rows[0].expense === 500 && trend.totalExpense === 500 && trend.totalNet === -500);

s = resetCareer();
s.team.bank = 10000;
train('aim', 'basic');
s.team.ledger.push({ seasonId: s.season.id, type: 'income', amount: 1500, label: '比赛奖金' });
const finSummary = seasonFinancialSummary(s);
ok('season financial summary', finSummary.totalIncome === 1500 && finSummary.totalExpense === 500 && finSummary.net === 1000 && finSummary.bank === 9500 && finSummary.incomeSources[0].label === '比赛奖金' && finSummary.expenseSources[0].label === '训练投入');

s = resetCareer();
const prize = remainingPrizePreview(s);
ok('remaining prize preview', prize && prize.currentRankPrize >= 0 && prize.matchExpected > 0 && prize.expectedCup >= 0 && prize.maxCup >= 0 && prize.total >= prize.matchExpected);

s = resetCareer();
s.team.bank = 5000;
train('aim', 'basic');
ok('train ledger', Array.isArray(s.team.ledger) && s.team.ledger.some((x) => x.type === 'expense' && x.label && x.label.includes('训练')) && s.team.bank === 4500);
ok('train fatigue applied', s.player.fatigue === 3);

s = resetCareer();
s.team.bank = 5000;
const preview = trainingPreview(s, 'aim', 'basic');
ok('training preview fields', preview && preview.before === 50 && preview.after === 52 && preview.cost === 500 && preview.fatigueGain === 3 && preview.affordable === true && preview.blocked === false);
ok('training preview invalids', trainingPreview(s, 'nope', 'basic') === null && trainingPreview(s, 'aim', 'nope') === null);
s.player.attrs.aim = 99;
const cappedPreview = trainingPreview(s, 'aim', 'elite');
ok('training preview caps', cappedPreview.after === 100 && cappedPreview.gained === 1 && cappedPreview.fatigueGain === 10);

s = resetCareer();
const suggestion = trainingSuggestion(s);
ok('training suggestion', suggestion && suggestion.suggestion && suggestion.suggestion.attr === 'nade' && suggestion.suggestion.tierKey === 'elite' && suggestion.options.length >= 1 && suggestion.trainingLeft === 2);

s = resetCareer();
s.team.bank = 5000;
train('aim', 'basic');
s.team.bank = 5000;
const mateForHistory = s.team.roster[0];
trainTeammate(mateForHistory.id, 'basic');
const history = trainingHistory(s);
ok('training history', history && history.totalCount === 2 && history.playerCount === 1 && history.teammateCount === 1 && history.recent.length === 2 && history.logs.some((x) => x.target === mateForHistory.name));

s = resetCareer();
const rosterState = rosterStatus(s);
ok('roster status table', rosterState && rosterState.rows.length === 5 && rosterState.rows[0].type === '玩家' && rosterState.rows[0].morale === 65 && rosterState.rows.slice(1).every((r) => r.rating > 0 && r.fatigue === 0 && r.morale === 65));

s = resetCareer();
s.team.bank = 100000;
const facilities = facilityStatus(s);
ok('facility status', facilities.length === 3 && facilities.every((f) => f.level === 0 && f.nextCost > 0 && f.affordable === true));
const academyUpgrade = upgradeFacility('academy');
ok('facility upgrade', academyUpgrade.ok && s.team.facilities.academy === 1 && s.team.bank < 100000 && s.team.ledger.some((x) => x.label.includes('设施投资')));
const boostedPreview = trainingPreview(s, 'aim', 'basic');
ok('facility training bonus', boostedPreview && boostedPreview.gained === 3);

s = resetCareer();
const rotation = rotationAdvice(s);
ok('rotation advice train', rotation && !rotation.shouldRest && rotation.advice === '正常训练' && rotation.reason.length > 0);
s.player.fatigue = 90;
const rotationRest = rotationAdvice(s);
ok('rotation advice rest', rotationRest.shouldRest && rotationRest.advice === '必须休息');

s = resetCareer();
const ready = matchReadiness(s);
ok('match readiness base', ready && ready.rawAvg === 48 && ready.effectiveAvg === 48 && ready.base > 0 && ready.final > 0 && ready.netAdjust === ready.final - ready.base && ready.next && ready.next.oppRating > 0 && ready.next.winChance >= 5);
s.player.fatigue = 100;
const tired = matchReadiness(s);
ok('match readiness fatigue', tired.effectiveAvg < ready.rawAvg && tired.fatiguePct === 25 && tired.netAdjust === tired.final - tired.base);

s = resetCareer();
let rc = rosterContribution(s);
ok('roster contribution fields', rc && rc.rating > 0 && rc.members.length === 4 && rc.player.contribution > 0 && rc.members.every((m) => m.sharePct >= 0));
s.team.roster.forEach((p, i) => { p.rating = [100, 80, 60, 60][i]; });
rc = rosterContribution(s);
ok('roster contribution split', rc.rosterAvg === 75 && rc.members[0].delta === 25 && rc.members[3].delta === -15 && rc.members[0].sharePct > rc.members[3].sharePct && rc.player.contribution >= 9);

s = resetCareer();
const balance = positionBalance(s);
ok('position balance fields', balance && balance.rows.length === 4 && balance.rows.every((r) => r.count === 1 && r.avg > 0) && balance.recommendation && balance.reason.length > 0);
s.team.roster = s.team.roster.filter((p) => p.role !== '指挥');
const missingBalance = positionBalance(s);
ok('position balance missing', missingBalance.missingRoles.includes('指挥') && missingBalance.recommendation.role === '指挥' && missingBalance.reason.includes('指挥'));

const filterPool = [
  { id: 'a', role: '突破', rating: 82, price: 9000 },
  { id: 'b', role: '补枪', rating: 70, price: 4000 },
  { id: 'c', role: '指挥', rating: 91, price: 18000 },
  { id: 'd', role: '自由人', rating: 76, price: 12000 }
];
ok('candidate filter role', filterCandidates(filterPool, { role: '突破' }).shown === 1);
ok('candidate filter rating', filterCandidates(filterPool, { minRating: 80 }).shown === 2);
ok('candidate filter price', filterCandidates(filterPool, { maxPrice: 10000 }).shown === 2);
ok('candidate filter combined', filterCandidates(filterPool, { role: '指挥', minRating: 90, maxPrice: 20000 }).shown === 1);
ok('candidate filter empty', filterCandidates(filterPool, { role: '指挥', minRating: 99 }).shown === 0);
const sortPool = [
  { id: 'a', role: '突破', rating: 60, price: 9000, potential: 95 },
  { id: 'b', role: '补枪', rating: 70, price: 4000, potential: 65 },
  { id: 'c', role: '指挥', rating: 91, price: 18000, potential: 80 }
];
ok('candidate sort rating', filterCandidates(sortPool, { sortBy: 'rating', sortDir: 'desc' }).list.map((x) => x.id).join(',') === 'c,b,a');
ok('candidate sort price', filterCandidates(sortPool, { sortBy: 'price', sortDir: 'asc' }).list[0].id === 'b');
ok('candidate sort potential', filterCandidates(sortPool, { sortBy: 'potential', sortDir: 'desc' }).list[0].id === 'a');

s = resetCareer();
const candProfile = candidateProfile({ id: 'x', rating: 60, price: 1000, role: '突破' });
ok('candidate profile', candProfile && candProfile.potential >= 60 && candProfile.growth === candProfile.potential - 60 && typeof candProfile.youth === 'boolean');
ok('candidate pool potential', candidates().every((c) => c.potential > 0 && typeof c.youth === 'boolean'));

s = resetCareer();
s.season.round = 5;
s.team.bank = 20000;
const budget = transferBudget(s);
ok('transfer budget', budget && budget.total > 0 && budget.affordable >= 0 && budget.maxAffordableRating >= 0 && budget.afterBestBuy >= 0 && budget.best && budget.best.price <= s.team.bank);
const cand = candidates()[0];
buyPlayer(cand.id);
ok('buy ledger and morale', s.team.bank > 0 && s.team.ledger.some((x) => x.label.includes('买入')) && s.team.morale === 67);
const soldPlayer = s.team.roster.find((x) => x.name === cand.name);
const sell = soldPlayer || s.team.roster[0];
s.team.transfersLeft = 1;
const sellPreviewRow = sellPreview(s, sell.id);
const bankBeforeSell = s.team.bank;
const sellRes = sellPlayer(sell.id);
ok('sell preview', sellPreviewRow && sellPreviewRow.refund > 0 && sellPreviewRow.ratingImpact < 0 && sellRes.refund === sellPreviewRow.refund && s.team.bank === bankBeforeSell + sellPreviewRow.refund);
ok('sell ledger and morale', s.team.ledger.some((x) => x.label.includes('卖出')) && s.team.morale === 65);
const profit = transferProfit(s);
ok('transfer profit tracker', profit && profit.buysCount >= 1 && profit.sellsCount >= 1 && profit.totalBuyCost > 0 && profit.totalRefund > 0 && profit.realized < 0);

s = resetCareer();
const contractRows = contractStatus(s);
ok('contract status', contractRows.length === 4 && contractRows.every((x) => x.yearsLeft >= 1 && x.renewalCost > 0));
const contractPlayer = s.team.roster[0];
contractPlayer.contractYears = 1;
contractPlayer.renewalCost = 600;
const bankBeforeRenew = s.team.bank;
const renewRes = renewPlayer(contractPlayer.id);
ok('renew player', renewRes.ok && contractPlayer.contractYears === 3 && s.team.bank === bankBeforeRenew - 600 && s.team.ledger.some((x) => x.label.includes('续约')));

s = resetCareer();
const first = settlePlayerMatch(true, 8, 2);
ok('first settle', first.ok && s.player.form.length === 1 && s.player.fatigue === 6 && s.team.morale === 69 && s.team.ledger.some((x) => x.type === 'income'));
ok('form bonus positive', formBonus(s) >= 2);
ok('fatigue penalty', Math.abs(fatiguePenalty(s) - 6 / 400) < 1e-9);
ok('career morale clamp', careerMorale(s) === 69);
ok('first win achievement', achievements(s).some((a) => a.id === 'first_win'));
const achProgressAfterWin = achievementProgress(s);
ok('achievement progress after win', achProgressAfterWin.unlockedCount === 1 && achProgressAfterWin.pct > 0 && achProgressAfterWin.next && achProgressAfterWin.next.id !== 'first_win');
ok('records best kills', careerRecords(s).bestKills === 8 && careerRecords(s).longestWinStreak === 1 && careerRecords(s).totalPrize > 0);

const rest = restPlayer();
ok('rest player', rest.ok && s.player.fatigue === 0 && s.team.rested === true);
ok('rest once', !restPlayer().ok);

s = resetCareer();
for (let i = 0; i < 5; i++) settlePlayerMatch(true, 6, 2);
ok('five win streak record', careerRecords(s).longestWinStreak === 5 && achievements(s).some((a) => a.id === 'streak5'));

s = resetCareer();
s.player.records = { totalPrize: 99000 };
s.player.achievements = [];
settlePlayerMatch(true, 5, 1);
ok('rich achievement', achievements(s).some((a) => a.id === 'rich100k') && careerRecords(s).totalPrize >= 100000);

s = resetCareer();
s.season.cup = {
  phase: 'active',
  bracket: [
    { round: 'QF', a: 't1', b: 't2', score: [13, 9], played: true, winner: 't1' },
    { round: 'QF', a: 't3', b: 't4', score: [13, 9], played: true, winner: 't3' },
    { round: 'QF', a: 't5', b: 't6', score: [13, 9], played: true, winner: 't5' },
    { round: 'QF', a: 't7', b: 't8', score: [13, 9], played: true, winner: 't7' },
    { round: 'SF', a: 't1', b: 't3', score: [13, 9], played: true, winner: 't1' },
    { round: 'SF', a: 't5', b: 't7', score: [13, 9], played: true, winner: 't5' },
    { round: 'F', a: 'player', b: 't1', score: null, played: false, winner: null }
  ]
};
s.pendingMatch = { oppId: 't1', venue: 'home', isCup: true };
settlePlayerMatch(true, 6, 3, { mvp: true });
ok('cup champion record', careerRecords(s).cupChampions === 1 && achievements(s).some((a) => a.id === 'cup_champion'));

s = resetCareer();
let goals = seasonGoals(s);
ok('goal unresolved', goals.currentCupRound === -1 && goals.achieved === false);
s.season.cup.phase = 'finished';
s.season.cupResult = 1;
for (let i = 0; i < s.season.standings.length; i++) {
  s.season.standings[i].pts = s.season.standings[i].teamId === 'player' ? 40 : 40 - i;
  s.season.standings[i].w = s.season.standings[i].teamId === 'player' ? 14 : 14 - i;
}
goals = seasonGoals(s);
ok('goal achieved', goals.achieved === true && goals.currentRank === 1 && goals.reward === 10000);

s = resetCareer();
let gp = goalProgress(s);
ok('goal progress unresolved', gp.rankProgress >= 0 && gp.cupProgress === 0 && gp.rankPointsGap >= 0 && gp.projectedPoints === null);
for (let i = 0; i < s.season.standings.length; i++) {
  s.season.standings[i].pts = s.season.standings[i].teamId === 'player' ? 40 : 40 - i;
  s.season.standings[i].w = s.season.standings[i].teamId === 'player' ? 14 : 14 - i;
  s.season.standings[i].played = 14;
}
s.season.cup.phase = 'finished';
s.season.cupResult = 3;
gp = goalProgress(s);
ok('goal progress achieved', gp.rankProgress === 100 && gp.cupProgress === 100 && gp.rankPointsGap === 0 && gp.projectedRank === 1);

s = resetCareer();
for (let i = 0; i < s.season.standings.length; i++) {
  s.season.standings[i].pts = s.season.standings[i].teamId === 'player' ? 40 : 40 - i;
  s.season.standings[i].w = s.season.standings[i].teamId === 'player' ? 14 : 14 - i;
}
s.season.cup.phase = 'finished';
s.season.cupResult = 3;
const report = nextSeason();
ok('goal reward ledger', getState().team.ledger.some((x) => x.label === '赛季目标奖励'));
ok('season record rank', careerRecords(getState()).bestSeasonRank === report.rank);

s = resetCareer();
s.version = 2;
delete s.player.form;
delete s.player.fatigue;
delete s.player.achievements;
delete s.player.records;
delete s.team.ledger;
delete s.team.morale;
delete s.team.rested;
s.season.cup = null;
save();
__clearStateForTest();
const loaded = loadCareer();
ok('v2 migrate', loaded.version === 3 && Array.isArray(loaded.player.form) && Array.isArray(loaded.team.ledger) && loaded.team.morale === 65 && Array.isArray(loaded.player.achievements));

const migrated = migrateCareerState({ version: 2, player: {}, team: {}, season: { cup: null }, history: [], news: [] });
ok('migrate helper', migrated.version === 3 && Array.isArray(migrated.player.form) && migrated.player.fatigue === 0 && Array.isArray(migrated.team.ledger) && migrated.season.cup && migrated.season.cup.phase === 'idle');

console.log('fx-career-growth: all PASS');
