import {
  resetCareer, setStorage, setRng, teamProfile, buildCareerTeams, leagueRules
} from '../src/career.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('fx-career-team: ' + name + ' FAIL');
  console.log('fx-career-team: ' + name + ' PASS');
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
setRng(() => 0.42);

const s = resetCareer();
const player = teamProfile(s, 'player');
ok('player profile fields', player && player.lineup.length === 5 && player.corePlayer && player.style && player.tactics && player.mapPrefs.includes(player.homeMap));
ok('player profile includes roster', player.lineup.some((p) => p.name === 'donk') && player.lineup.some((p) => p.name === 'sh1ro'));

const opp = teamProfile(s, 't1');
ok('opponent profile fields', opp && opp.lineup.length === 5 && opp.corePlayer && opp.style && opp.tactics && opp.league === '乙级' && opp.mapPrefs.includes(opp.homeMap));
ok('opponent status fields', typeof opp.recentForm === 'string' && opp.recentForm.length > 0 && opp.morale >= 20 && opp.morale <= 100 && opp.status);

const roster = [
  { name: 'A', role: '补枪', rating: 70 },
  { name: 'B', role: '指挥', rating: 68 },
  { name: 'C', role: '自由人', rating: 72 },
  { name: 'D', role: '狙击', rating: 74 }
];
const top = buildCareerTeams('甲级', 90, roster, 'P');
const low = buildCareerTeams('丙级', 65, roster, 'P');
const topAvg = top.filter((t) => t.id !== 'player').reduce((a, t) => a + t.rating, 0) / 7;
const lowAvg = low.filter((t) => t.id !== 'player').reduce((a, t) => a + t.rating, 0) / 7;
ok('league rating separation', topAvg > lowAvg);
ok('league youth separation', low.filter((t) => t.id !== 'player' && t.youthCount >= 4).length === 7 && top.filter((t) => t.id !== 'player').every((t) => t.youthCount === 0));
ok('league style separation', top.some((t) => t.style === '纪律防守') && low.some((t) => t.style === '青训冲劲'));
ok('league rules drive profile', leagueRules('甲级').youthBias < leagueRules('丙级').youthBias && leagueRules('甲级').tacticalBias > leagueRules('丙级').tacticalBias);

console.log('fx-career-team: all PASS');
