import { resetManager, loadManager, setStorage, setRng, getState, SAVE_KEY, BACKUP_KEY, VERSION, ROLE_WEIGHTS, buildManagerRoster, deriveAttrs, ratingFromAttrs, playerPrice, newManagerCareer, buildNewSeason, nextFixture, simulateManagerMatch } from '../src/manager.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('manager: ' + name + ' FAIL');
  console.log('manager: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

const store = fakeStorage();
setStorage(store);
setRng(() => 0.5);

let s = resetManager();
ok('save persisted', store.map.has(SAVE_KEY));
ok('version', s.version === VERSION);
ok('initial bank', s.team.bank === 12000);
ok('roster empty', Array.isArray(s.team.roster) && s.team.roster.length === 0);
ok('league 乙级', s.team.league === '乙级');
ok('board trust 70', s.board.trust === 70);
ok('6 roles weighted', Object.keys(ROLE_WEIGHTS).length === 6);
const wSum = Object.values(ROLE_WEIGHTS['突破']).reduce((a, b) => a + b, 0);
ok('role weights sum to 1', Math.abs(wSum - 1) < 0.001);

store.map.set(SAVE_KEY, '{corrupt');
s = loadManager();
ok('corrupt save backed up', store.map.has(BACKUP_KEY));
ok('corrupt save rebuilt', s.version === VERSION && s.team.bank === 12000);

s = resetManager();
s.team.roster = buildManagerRoster('乙级');
ok('roster 5', s.team.roster.length === 5);
ok('roster roles distinct', new Set(s.team.roster.map((p) => p.role)).size >= 4);
ok('roster has attrs 10 dims', s.team.roster.every((p) => p.attrs && Object.keys(p.attrs).length === 10));
ok('roster rating in range', s.team.roster.every((p) => p.rating >= 60 && p.rating <= 93));
ok('derived attrs clamp', deriveAttrs({ aim: 30, movement: 30, clutch: 30, nade: 30 }).aim === 40);
const full99 = { aim: 99, react: 99, movement: 99, clutch: 99, nade: 99, gameIQ: 99, leadership: 99, composure: 99, aggression: 99, discipline: 99 };
ok('rating full 99', ratingFromAttrs('狙击', full99) === 99);
ok('rating snip aim heavy', ratingFromAttrs('狙击', { ...full99, aim: 99, react: 99 }) > ratingFromAttrs('狙击', { ...full99, aim: 50, react: 50 }));
ok('price capped', playerPrice({ rating: 99 }, '甲级') <= 30000);

s = newManagerCareer();
ok('career fixtures 56', s.season.fixtures.length === 56);
ok('career standings 8', s.season.standings.length === 8);
ok('career teams 8', s.season.teams.length === 8);
ok('player team present', s.season.teams.some((t) => t.id === 'player'));
ok('round robin home+away', s.season.fixtures.filter((f) => f.home === 'player').length === 7 && s.season.fixtures.filter((f) => f.away === 'player').length === 7);
ok('fixtures have map', s.season.fixtures.every((f) => f.mapId));
ok('nextFixture exists round1', nextFixture(s) && nextFixture(s).round === 1);

{
  const me = s.season.teams.find((t) => t.id === 'player');
  const opp = s.season.teams.find((t) => t.id !== 'player');
  const r = simulateManagerMatch(s, me, opp, { league: '乙级' });
  ok('sim rounds 5-9', r.rounds.length >= 5 && r.rounds.length <= 9);
  ok('sim score sums to rounds', r.score[0] + r.score[1] === r.rounds.length);
  ok('sim winner valid', r.winner === me.id || r.winner === opp.id);
  ok('sim mvp present', r.mvp && r.mvp.name);
  ok('sim players sorted', r.players[0] && r.players[0].kills >= r.players[r.players.length - 1].kills);
}

console.log('manager: all PASS');
