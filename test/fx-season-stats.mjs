import {
  resetCareer, setStorage, setRng, getState, settlePlayerMatch, nextSeason,
  save, loadCareer, __clearStateForTest,
  seasonStats, seasonSeries, seasonStreaks, careerSummary
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

ok('seasonStats deterministic', JSON.stringify(seasonStats(h, 1)) === JSON.stringify(seasonStats(h, 1)));
ok('seasonSeries deterministic', JSON.stringify(seasonSeries(h, 1)) === JSON.stringify(seasonSeries(h, 1)));

let s = resetCareer();
for (let i = 0; i < 3; i++) {
  const r = settlePlayerMatch(i % 2 === 0, 6, 4);
  ok('integrate settle', r.ok);
}
const s1 = getState();
ok('matchHistory recorded', Array.isArray(s1.matchHistory) && s1.matchHistory.length === 3);
ok('matchHistory fields', s1.matchHistory.every((m) => m.seasonId === 1 && typeof m.win === 'boolean' && m.kills === 6 && m.deaths === 4 && m.money === (m.win ? 1500 : 300) && m.dmg === 420 && (m.venue === 'home' || m.venue === 'away')));
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
