import {
  resetCareer, setStorage, setRng, nextSeason, migrateCareerState,
  fixtureMapFor, assignFixtureMaps, startCareerMatch, findPlayerFixture,
  nextMatchInfo, teamRecentForm, opponentStanding, matchImportance, seasonPace
} from '../src/career.js';
import { createGame, startMatch } from '../src/game.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('fx-career-schedule: ' + name + ' FAIL');
  console.log('fx-career-schedule: ' + name + ' PASS');
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
ok('fixtures carry map', s.season.fixtures.every((f) => f.mapId));
ok('fixture map matches home', s.season.fixtures.every((f) => {
  const home = s.season.teams.find((t) => t.id === f.home);
  return home && f.mapId === home.homeMap;
}));

const f0 = findPlayerFixture(s);
const map0 = fixtureMapFor(s, f0);
const game = createGame({ mode: 'career' });
game.ui = null;
const opp = f0.home === 'player' ? f0.away : f0.home;
const venue = f0.home === 'player' ? 'home' : 'away';
startCareerMatch(game, opp, venue, false);
ok('live start uses fixture map', game.opts.mapId === map0);
ok('pending map persisted', s.pendingMatch && s.pendingMatch.mapId === map0);

s = resetCareer();
nextSeason();
ok('next season fixtures carry map', s.season.fixtures.every((f) => f.mapId));

const legacy = migrateCareerState({
  version: 2,
  player: {},
  team: {},
  season: {
    teams: [
      { id: 'a', homeMap: 'dust2' },
      { id: 'b', homeMap: 'canal' }
    ],
    fixtures: [
      { round: 1, home: 'a', away: 'b', played: false }
    ],
    cup: null
  },
  history: [],
  news: []
});
ok('legacy migration fills map', legacy.season.fixtures[0].mapId === 'dust2');

const partial = { season: { fixtures: [{ round: 1, home: 'a', away: 'b' }] } };
assignFixtureMaps(partial);
ok('assign without teams safe', partial.season.fixtures[0].mapId == null);

const info = nextMatchInfo(s);
ok('next match info fields', info && info.oppId && info.oppName && info.rank >= 1 && info.rank <= 8 && typeof info.form === 'string');
ok('next match info map', info && info.mapId === fixtureMapFor(s, findPlayerFixture(s)));
ok('opponent standing deterministic', opponentStanding(s, 'player') >= 1 && opponentStanding(s, 'player') <= 8);

s.season.fixtures[0].played = true;
s.season.fixtures[0].winner = s.season.fixtures[0].home;
const formHome = teamRecentForm(s, s.season.fixtures[0].home);
ok('recent form reads fixtures', formHome === 'W');

s = resetCareer();
s.season.round = 12;
const lateF = findPlayerFixture(s);
s.season.standings.forEach((x, i) => { x.pts = 30 - i * 2; });
ok('title match importance', matchImportance(s, lateF) === '争冠战');
ok('info carries importance', nextMatchInfo(s).importance === '争冠战');

s = resetCareer();
const playerStanding = s.season.standings.find((x) => x.teamId === 'player');
playerStanding.played = 6;
playerStanding.pts = 12;
const pace = seasonPace(s);
ok('season pace projects points', pace.played === 6 && pace.remaining === 8 && pace.projected === 28);
ok('season pace rank', pace.currentRank === 1 && pace.projectedRank === 1);

console.log('fx-career-schedule: all PASS');
