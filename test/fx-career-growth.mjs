import {
  resetCareer, setStorage, setRng, getState, settlePlayerMatch, train, sellPlayer, buyPlayer, candidates,
  nextSeason, save, loadCareer, __clearStateForTest,
  sponsorIncome, formBonus, fatiguePenalty, careerMorale, restPlayer, seasonGoals, goalProgress,
  achievementDefs, achievements, careerRecords, migrateCareerState
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
s.team.bank = 5000;
train('aim', 'basic');
ok('train ledger', Array.isArray(s.team.ledger) && s.team.ledger.some((x) => x.type === 'expense' && x.label && x.label.includes('训练')) && s.team.bank === 4500);

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
