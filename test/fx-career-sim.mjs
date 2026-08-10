import {
  resetCareer, setStorage, setRng, teamProfile, simulateCareerMatch
} from '../src/career.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('fx-career-sim: ' + name + ' FAIL');
  console.log('fx-career-sim: ' + name + ' PASS');
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
const home = teamProfile(s, 'player');
const away = teamProfile(s, 't1');
const result = simulateCareerMatch(home, away, { mapId: away.homeMap });
const totalDeaths = result.players.reduce((a, p) => a + p.deaths, 0);
ok('match winner decided', result.winner === home.id || result.winner === away.id);
ok('match score reaches five', (result.score[0] === 5 || result.score[1] === 5) && result.score[0] >= 0 && result.score[1] >= 0);
ok('rounds match score sum', result.rounds.length === result.score[0] + result.score[1]);
ok('round timeline structured', result.rounds.every((r) => r.events.length >= 4 && r.site && r.tactic) && result.timeline.length >= result.rounds.length * 4);
ok('sim event types', result.timeline.some((e) => e.t === 'opening') && result.timeline.some((e) => e.t === 'duel') && result.timeline.some((e) => e.t === 'site_control') && result.timeline.some((e) => e.t === 'round_end'));
ok('mvp and player stats', result.mvp && result.mvp.name && result.players.length > 0);
ok('kill death balance', result.totalKills === totalDeaths);
ok('league baked into result', result.league === '乙级' && result.mapId);

console.log('fx-career-sim: all PASS');
