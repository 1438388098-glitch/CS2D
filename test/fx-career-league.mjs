import {
  resetCareer, setStorage, setRng, sponsorIncome, homeTicketIncome,
  seasonGoals, leagueRules, leagueInfo
} from '../src/career.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('fx-career-league: ' + name + ' FAIL');
  console.log('fx-career-league: ' + name + ' PASS');
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

const infos = leagueInfo();
ok('league info has three tiers', infos.length === 3 && infos.every((x) => x.identity && x.competition));
const top = leagueRules('甲级');
const mid = leagueRules('乙级');
const low = leagueRules('丙级');
ok('league rules distinct', top.sponsor > mid.sponsor && mid.sponsor > low.sponsor);
ok('league financial spread', top.ticketBase > mid.ticketBase && mid.ticketBase > low.ticketBase && top.matchWin > mid.matchWin && mid.matchWin > low.matchWin);
ok('league prize scale', top.prizeScale > mid.prizeScale && mid.prizeScale > low.prizeScale);
ok('league goal distinct', top.goal.reward > mid.goal.reward && mid.goal.reward > low.goal.reward && new Set([top.goal.rank, mid.goal.rank, low.goal.rank]).size === 3);
ok('league identity distinct', top.competition !== mid.competition && mid.competition !== low.competition);

let s = resetCareer();
const baseSponsor = sponsorIncome(s);
s.team.league = '甲级';
const topSponsor = sponsorIncome(s);
s.team.league = '丙级';
const lowSponsor = sponsorIncome(s);
ok('sponsor uses league rules', topSponsor > baseSponsor && baseSponsor > lowSponsor);

s = resetCareer();
s.team.league = '甲级';
const topHomeWin = homeTicketIncome(s, true);
s.team.league = '丙级';
const lowHomeWin = homeTicketIncome(s, true);
ok('ticket uses league rules', topHomeWin > lowHomeWin);

s = resetCareer();
const goalsMid = seasonGoals(s);
s.team.league = '甲级';
const goalsTop = seasonGoals(s);
s.team.league = '丙级';
const goalsLow = seasonGoals(s);
ok('season goals use league rules', new Set([goalsTop.rankGoal, goalsMid.rankGoal, goalsLow.rankGoal]).size === 3 && goalsTop.reward > goalsMid.reward && goalsMid.reward > goalsLow.reward);

console.log('fx-career-league: all PASS');
