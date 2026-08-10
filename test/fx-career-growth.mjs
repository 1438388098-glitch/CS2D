import {
  resetCareer, setStorage, setRng, getState, settlePlayerMatch, train, sellPlayer, buyPlayer, candidates, filterCandidates,
  nextSeason, save, loadCareer, __clearStateForTest, candidateProfile,
  sponsorIncome, sponsorPreview, formBonus, fatiguePenalty, careerMorale, restPlayer, seasonGoals, goalProgress, trainingPreview, trainingSuggestion, rotationAdvice, rosterContribution,
  achievementDefs, achievements, careerRecords, migrateCareerState, matchReadiness
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

s = resetCareer();
const candProfile = candidateProfile({ id: 'x', rating: 60, price: 1000, role: '突破' });
ok('candidate profile', candProfile && candProfile.potential >= 60 && candProfile.growth === candProfile.potential - 60 && typeof candProfile.youth === 'boolean');
ok('candidate pool potential', candidates().every((c) => c.potential > 0 && typeof c.youth === 'boolean'));

s = resetCareer();
s.season.round = 5;
s.team.bank = 20000;
const cand = candidates()[0];
buyPlayer(cand.id);
ok('buy ledger and morale', s.team.bank > 0 && s.team.ledger.some((x) => x.label.includes('买入')) && s.team.morale === 67);
const sell = s.team.roster[0];
sellPlayer(sell.id);
ok('sell ledger and morale', s.team.ledger.some((x) => x.label.includes('卖出')) && s.team.morale === 65);

s = resetCareer();
const first = settlePlayerMatch(true, 8, 2);
ok('first settle', first.ok && s.player.form.length === 1 && s.player.fatigue === 6 && s.team.morale === 69 && s.team.ledger.some((x) => x.type === 'income'));
ok('form bonus positive', formBonus(s) >= 2);
ok('fatigue penalty', Math.abs(fatiguePenalty(s) - 6 / 400) < 1e-9);
ok('career morale clamp', careerMorale(s) === 69);
ok('first win achievement', achievements(s).some((a) => a.id === 'first_win'));
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
