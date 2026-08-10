import {
  resetCareer, setStorage, setRng, nextSeason, migrateCareerState,
  fixtureMapFor, assignFixtureMaps, startCareerMatch, findPlayerFixture,
  nextMatchInfo, teamRecentForm, opponentStanding, matchImportance, seasonPace,
  cupPrizeInfo, cupMapForRound, cupPreview, transferWindowInfo, scoutReport, winChance, fixtureMatchRecord, relegationProjection
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
s.matchHistory.push({ seasonId: s.season.id, round: s.season.fixtures[0].round, isCup: false, oppId: s.season.fixtures[0].home === 'player' ? s.season.fixtures[0].away : s.season.fixtures[0].home, win: true, kills: 8, deaths: 3, dmg: 560, money: 1500, score: [13, 8], mapId: s.season.fixtures[0].mapId });
const playedRec = fixtureMatchRecord(s, s.season.fixtures[0]);
ok('fixture match record', playedRec && playedRec.kills === 8 && playedRec.score.join(':') === '13:8');
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

s = resetCareer();
s.team.league = '乙级';
s.season.standings.forEach((x, i) => {
  x.played = 12;
  x.pts = i < 7 ? 55 - i : 15;
});
const riskPlayer = s.season.standings.find((x) => x.teamId === 'player');
riskPlayer.pts = 20;
const risk = relegationProjection(s);
ok('relegation risk', risk && risk.rank === 7 && risk.pointsToSafety === 30 && risk.pointsToPromotion === 34 && risk.relegationRisk === true);
s.season.standings.forEach((x, i) => {
  x.pts = i === 1 ? 32 : i === 2 ? 31 : 27 - i;
});
riskPlayer.pts = 28;
const promo = relegationProjection(s);
ok('promotion projection', promo && promo.rank === 3 && promo.pointsToPromotion === 4 && promo.canPromote === true && promo.pointsToSafety === 0);

const prizes = cupPrizeInfo();
ok('cup prize info', prizes.perRound === 5000 && prizes.champion === 30000 && prizes.rounds.length === 3);
ok('cup round map', cupMapForRound('QF') === 'dust2' && cupMapForRound('SF') === 'canal' && cupMapForRound('F') === 'metro');
const preview = cupPreview({ season: { cup: { bracket: [{ round: 'F', a: 'player', b: 't1', score: null, played: false, winner: null }] } } })[0];
ok('cup preview schedule', preview && preview.map === 'metro' && preview.prize === 35000);

s = resetCareer();
const closedWin = transferWindowInfo(s);
ok('transfer countdown before', !closedWin.open && closedWin.opensIn === 4 && closedWin.text.includes('4'));
s.season.round = 6;
const openWin = transferWindowInfo(s);
ok('transfer countdown open', openWin.open && openWin.closesIn === 2 && openWin.text.includes('2'));

s = resetCareer();
const scoutInfo = nextMatchInfo(s);
const scout = scoutReport(s, scoutInfo.oppId);
ok('scout report fields', scout && scout.rank >= 1 && scout.rank <= 8 && scout.avgKills >= 5 && scout.homeMap && scout.bestMap === scout.homeMap);
s.matchHistory = [{ oppId: scout.oppId, kills: 10, deaths: 4 }];
const scoutWithData = scoutReport(s, scout.oppId);
ok('scout report averages', scoutWithData.avgKills === 10 && scoutWithData.avgDeaths === 4);

s = resetCareer();
s.player.attrs = { aim: 100, move: 100, react: 100, nade: 100 };
s.player.fatigue = 0;
s.team.morale = 100;
s.team.roster.forEach((p) => { p.rating = 100; });
const weakOpp = s.season.teams.find((x) => x.id !== 'player');
weakOpp.rating = 20;
ok('win chance clamps high', winChance(s, weakOpp.id, 'home') === 95);
weakOpp.rating = 200;
ok('win chance clamps low', winChance(s, weakOpp.id, 'home') === 5);

console.log('fx-career-schedule: all PASS');
