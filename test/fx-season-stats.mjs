import {
  resetCareer, setStorage, setRng, getState, settlePlayerMatch, nextSeason,
  save, loadCareer, __clearStateForTest,
  seasonStats, seasonSeries, seasonStreaks, careerSummary, matchDetail, seasonTimeline, headToHead, importantMatches, seasonTrends, favoriteMatches
} from '../src/career.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('fx-season-stats: ' + name + ' FAIL');
  console.log('fx-season-stats: ' + name + ' PASS');
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

let st = seasonStats([], 1);
ok('empty history zeros', st.matches === 0 && st.wins === 0 && st.losses === 0 && st.winRate === 0 && st.kd === 0 && st.totalMoney === 0 && st.avgDmg === 0);

const h = [
  { seasonId: 1, win: false, kills: 8, deaths: 12, dmg: 560, money: 300, mvp: false },
  { seasonId: 1, win: true, kills: 20, deaths: 10, dmg: 1400, money: 1500, mvp: true },
  { seasonId: 1, win: true, kills: 15, deaths: 0, dmg: 1050, money: 1700, mvp: false },
  { seasonId: 2, win: true, kills: 12, deaths: 9, dmg: 840, money: 1500, mvp: true },
  { seasonId: 2, win: false, kills: 4, deaths: 5, dmg: 280, money: 300, mvp: false }
];

st = seasonStats(h, 1);
ok('season1 counts', st.matches === 3 && st.wins === 2 && st.losses === 1);
ok('season1 winRate', st.winRate === 67);
ok('season1 kd', st.kd === Math.round(43 / 22 * 100) / 100);
ok('season1 money', st.totalMoney === 3500);
ok('season1 avgDmg', st.avgDmg === Math.round(3010 / 3));
ok('season1 extra', st.kills === 43 && st.deaths === 22 && st.totalDmg === 3010 && st.mvp === 1);

st = seasonStats(h, 2);
ok('season2 isolated', st.matches === 2 && st.wins === 1 && st.losses === 1 && st.totalMoney === 1800);

st = seasonStats(h, null);
ok('null season aggregates all', st.matches === 5 && st.wins === 3 && st.losses === 2);

st = seasonStats(h, (m) => m.win);
ok('predicate filter', st.matches === 3 && st.wins === 3 && st.losses === 0);

st = seasonStats([{ seasonId: 9, win: true, kills: 5, deaths: 0, dmg: 350, money: 1500 }], 9);
ok('zero deaths kd falls back to kills', st.kd === 5);

let ser = seasonSeries(h, 1);
ok('series order', ser.length === 3 && ser[0].win === false && ser[1].win === true && ser[2].win === true && ser[2].deaths === 0);
ok('series fields', ser[1].dmg === 1400 && ser[1].money === 1500 && ser[1].isCup === false && ser[1].kills === 20);

let sk = seasonStreaks(ser);
ok('season1 streak current 2', sk.current === 2);
ok('season1 streak longest 2', sk.longest === 2);
ser = seasonSeries(h, 2);
sk = seasonStreaks(ser);
ok('season2 streak current 0', sk.current === 0);
ok('season2 streak longest 1', sk.longest === 1);
ok('empty streak', seasonStreaks([]).current === 0 && seasonStreaks([]).longest === 0);

const ov = careerSummary(h);
ok('summary seasons', ov.seasons === 2 && ov.matches === 5 && ov.wins === 3 && ov.losses === 2);
ok('summary totals', ov.totalMoney === 5300 && ov.totalDmg === 4130 && ov.kills === 59 && ov.deaths === 36);
ok('summary kd', ov.kd === Math.round(59 / 36 * 100) / 100);
ok('summary avgDmg', ov.avgDmg === Math.round(4130 / 5));
ok('summary empty', careerSummary([]).seasons === 0 && careerSummary([]).matches === 0);

const detailWin = matchDetail({ win: true, kills: 20, deaths: 10, dmg: 1400, money: 1500, mvp: true, score: [16, 8], mapId: 'dust2', importance: '关键战' });
ok('matchDetail win', detailWin.kd === 2 && detailWin.scoreText === '16:8' && detailWin.impact === 'MVP' && detailWin.mapId === 'dust2');
const detailLose = matchDetail({ win: false, kills: 8, deaths: 12, dmg: 560, money: 300, mvp: false, score: null });
ok('matchDetail lose', detailLose.kd === Math.round(8 / 12 * 100) / 100 && detailLose.scoreText === '未记录' && detailLose.impact === '失利');
ok('matchDetail empty', matchDetail(null) === null);

const tl = seasonTimeline(h, 1);
ok('seasonTimeline rows', tl.length === 3 && tl[0].label === '第 1 轮' && tl[2].win === true && tl[2].kills === 15);
ok('seasonTimeline cups', seasonTimeline([{ seasonId: 1, isCup: true, win: true, kills: 5, deaths: 2, dmg: 350, money: 5000, score: [13, 5] }], 1)[0].label === '杯赛');

const h2h = headToHead(h, 'alpha');
ok('headToHead empty', h2h.matches === 0 && h2h.winRate === 0);
const h2hA = headToHead([
  { oppId: 'a', win: true, kills: 10, deaths: 4, dmg: 700, money: 1500 },
  { oppId: 'a', win: false, kills: 5, deaths: 8, dmg: 350, money: 300 },
  { oppId: 'b', win: true, kills: 9, deaths: 3, dmg: 630, money: 1500 }
], 'a');
ok('headToHead aggregate', h2hA.matches === 2 && h2hA.wins === 1 && h2hA.losses === 1 && h2hA.winRate === 50 && h2hA.kd === Math.round(15 / 12 * 100) / 100 && h2hA.last.length === 2);

const imp = importantMatches([
  { importance: '普通战', win: true, kills: 3, deaths: 4, dmg: 210, money: 1500 },
  { importance: '关键战', win: false, kills: 9, deaths: 8, dmg: 630, money: 300 },
  { importance: '杯赛', win: true, kills: 12, deaths: 6, dmg: 840, money: 5000 }
], 5);
ok('importantMatches filters', imp.length === 2 && imp[0].importance === '杯赛' && imp[1].importance === '关键战');
ok('importantMatches limit', importantMatches([{ importance: '关键战', win: true, kills: 1, deaths: 1, dmg: 70, money: 1500 }, { importance: '争冠战', win: true, kills: 2, deaths: 1, dmg: 140, money: 1500 }], 1).length === 1);

const fav = favoriteMatches([
  { win: true, kills: 8, deaths: 4, dmg: 560, money: 1500, mvp: true },
  { win: true, kills: 16, deaths: 5, dmg: 1120, money: 1500, mvp: false },
  { win: false, kills: 6, deaths: 8, dmg: 420, money: 300, mvp: false }
]);
ok('favoriteMatches criteria', fav.length === 2 && fav[0].kills === 16 && fav[1].mvp === true);
ok('matchDetail highlight fallback', matchDetail({ win: true, kills: 15, deaths: 5, dmg: 1050, money: 1500 }).highlight === true);

const trends = seasonTrends(h);
ok('seasonTrends seasons', trends.length === 2 && trends[0].seasonId === 1 && trends[1].seasonId === 2);
ok('seasonTrends fields', trends[0].matches === 3 && trends[0].winRate === 67 && trends[0].totalMoney === 3500 && trends[1].avgDmg === 560);

ok('seasonStats deterministic', JSON.stringify(seasonStats(h, 1)) === JSON.stringify(seasonStats(h, 1)));
ok('seasonSeries deterministic', JSON.stringify(seasonSeries(h, 1)) === JSON.stringify(seasonSeries(h, 1)));

let s = resetCareer();
for (let i = 0; i < 3; i++) {
  const r = settlePlayerMatch(i % 2 === 0, 6, 4);
  ok('integrate settle', r.ok);
}
const s1 = getState();
ok('matchHistory recorded', Array.isArray(s1.matchHistory) && s1.matchHistory.length === 3);
ok('matchHistory fields', s1.matchHistory.every((m) => m.seasonId === 1 && typeof m.win === 'boolean' && m.kills === 6 && m.deaths === 4 && m.money === (m.win ? 1500 : 300) && m.dmg === 420 && (m.venue === 'home' || m.venue === 'away') && m.mapId && m.oppRating > 0 && m.playerRating > 0 && m.importance));
const st1 = seasonStats(s1.matchHistory, 1);
ok('integrate seasonStats', st1.matches === 3 && st1.wins === 2 && st1.losses === 1 && st1.kills === 18 && st1.deaths === 12 && st1.totalMoney === 3300 && st1.avgDmg === 420);
ok('integrate kd', st1.kd === Math.round(18 / 12 * 100) / 100);

nextSeason();
let s2 = getState();
ok('matchHistory persists across seasons', s2.matchHistory.length === 3);
const r2 = settlePlayerMatch(true, 5, 3);
ok('season2 settle', r2.ok);
const st2 = seasonStats(s2.matchHistory, 2);
ok('season2 stats isolated', st2.matches === 1 && st2.wins === 1 && st2.kills === 5 && st2.totalMoney === 1500 && st2.avgDmg === 350);
const all = careerSummary(s2.matchHistory);
ok('summary two seasons', all.seasons === 2 && all.matches === 4 && all.kills === 23 && all.deaths === 15);

s = resetCareer();
s.matchHistory = undefined;
save();
__clearStateForTest();
const reloaded = loadCareer();
ok('legacy save backfills matchHistory', Array.isArray(reloaded.matchHistory) && reloaded.matchHistory.length === 0);

console.log('fx-season-stats: all PASS');
