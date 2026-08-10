import {
  loadCareer, resetCareer, setStorage, setRng, getState, train, sellPlayer, buyPlayer, candidates,
  nextSeason, seasonReport, abandonPendingMatch, settlePlayerMatch, simulatePlayerMatch, careerEndMatch, startCareerMatch, save, __clearStateForTest, findPlayerFixture, findCupMatch, cupMap, nextMatch, trainTeammate, careerMapPool
} from '../src/career.js';
import { effectiveSpread } from '../src/ballistic.js';
import { startReload } from '../src/combat.js';
import { WEAPONS, ROUND } from '../src/config.js';
import { installStubs, registerDomIds } from './stubdom.js';
import { createGame, startMatch } from '../src/game.js';
import { initCareerUi, openCareer, __renderTabForTest } from '../src/career-ui.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('career: ' + name + ' FAIL');
  console.log('career: ' + name + ' PASS');
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

const store = fakeStorage();
setStorage(store);
setRng(() => 0.5);

let s = resetCareer();
ok('save persisted', store.map.has('cs2d_career'));
ok('initial bank', s.team.bank === 12000);
ok('initial attrs', s.player.attrs.aim === 50 && s.player.attrs.move === 50 && s.player.attrs.react === 50 && s.player.attrs.nade === 40);
ok('roster 4', s.team.roster.length === 4);
ok('fixtures 56', s.season.fixtures.length === 56);
ok('standings 8', s.season.standings.length === 8);
ok('career map pool expanded', careerMapPool().includes('duel-pit') && careerMapPool().includes('duel-alley') && careerMapPool().includes('duel-forge'));
ok('league 乙级', s.team.league === '乙级');
ok('real player team', s.player.name === 'donk' && s.team.name === 'Team Spirit');
ok('real roster names', s.team.roster.every((p) => ['sh1ro', 'chopper', 'magixx', 'zont1x'].includes(p.name)));
ok('real opponent teams', s.season.teams.filter((x) => x.id !== 'player').every((x) => ['NAVI', 'G2', 'FAZE', 'VIT', 'MOUZ', 'AST', 'TL', 'VP', 'EF', 'FUR', 'PAIN', 'COL'].includes(x.tag)));

s = resetCareer();
{
  // 联赛对手推断必须来自 fixture 的 home/away（勿误读成杯赛的 a/b，否则 oppId 变 undefined）
  const nm = nextMatch(s);
  const oppId = s.season.cup.phase === 'active' ? (nm.a === 'player' ? nm.b : nm.a) : (nm.home === 'player' ? nm.away : nm.home);
  const pf = findPlayerFixture(s);
  const expectOpp = pf.home === 'player' ? pf.away : pf.home;
  ok('nextMatch league opp defined', typeof oppId === 'string' && oppId === expectOpp && s.season.teams.some((t) => t.id === oppId));
}

s = resetCareer();
s.team.bank = 5000;
let r = train('aim', 'basic');
ok('train basic', r.ok && s.player.attrs.aim === 52 && s.team.bank === 4500 && s.team.trainingLeft === 1);
r = train('aim', 'basic');
ok('train twice', r.ok && s.player.attrs.aim === 54 && s.team.trainingLeft === 0);
r = train('aim', 'basic');
ok('train limit', !r.ok);

s = resetCareer();
s.team.bank = 5000;
s.player.attrs.aim = 100;
r = train('aim', 'basic');
ok('train full attr blocked', !r.ok && s.team.bank === 5000 && s.team.trainingLeft === 2);

s = resetCareer();
s.team.bank = 5000;
const mate = s.team.roster[0];
const mateBefore = mate.rating;
r = trainTeammate(mate.id, 'basic');
ok('train teammate', r.ok && mate.rating === mateBefore + 2 && s.team.trainingLeft === 1);
r = trainTeammate('nonexistent', 'basic');
ok('train teammate missing blocked', !r.ok);

s = resetCareer();
{
  const future = s.season.fixtures.find((f) => f.round === 2 && (f.home === 'player' || f.away === 'player'));
  const opp = future.home === 'player' ? future.away : future.home;
  const bad = startCareerMatch({ opts: {} }, opp, 'home', false);
  ok('career blocks future fixture', bad && bad.ok === false);
}
s.season.round = 5;
const rosterFilterHtml = __renderTabForTest('roster');
ok('career transfer filters render', rosterFilterHtml.includes('data-filter="role"') && rosterFilterHtml.includes('data-filter="min-rating"') && rosterFilterHtml.includes('data-filter="max-price"'));

const pool = candidates();
ok('candidate pool 8', pool.length === 8);
ok('candidate pool persisted', store.map.get('cs2d_career').includes('c1'));
{
  const pair = {};
  for (let i = 0; i < 8; i++) pair[['rain', 'broky', 'frozen', 'ropz'][i]] = i < 4;
  const known = { rain: 'FaZe Clan', broky: 'FaZe Clan', frozen: 'FaZe Clan', ropz: 'FaZe Clan', NAF: 'Team Liquid', Twistzz: 'Team Liquid', torzsi: 'MOUZ', Spinx: 'Team Vitality' };
  ok('candidate name-team matched', pool.every((c) => !known[c.name] || known[c.name] === c.team));
}
s.team.bank = 20000;
const cand = pool[0];
r = buyPlayer(cand.id);
ok('buy ok', r.ok);
ok('candidate removed after buy', !candidates().some((c) => c.id === cand.id));
ok('buy replaced role', s.team.roster.some((p) => p.name === cand.name && p.role === cand.role));
const sold = s.team.roster[0];
const bankBefore = s.team.bank;
r = sellPlayer(sold.id);
ok('sell ok', r.ok && s.team.roster.length === 3 && s.team.bank > bankBefore);

s = resetCareer();
let guard = 0;
while (s.season.cup.phase === 'idle' && guard++ < 20) {
  r = settlePlayerMatch(guard % 2 === 0, 5, 3);
  ok('sim league step', r.ok);
}
ok('cup active after league', s.season.cup.phase === 'active');
guard = 0;
while (s.season.cup.phase === 'active' && guard++ < 10) {
  const nm = findCupMatch(s);
  const expectMap = nm && nm.round === 'QF' ? 'dust2' : (nm && nm.round === 'SF' ? 'canal' : 'metro');
  ok('cup map ' + (nm ? nm.round : 'none'), cupMap(s) === expectMap);
  r = settlePlayerMatch(guard % 2 === 0, 4, 2);
  ok('sim cup step', r.ok);
}
ok('cup finished', s.season.cup.phase === 'finished');
const simFixtures = s.season.fixtures.filter((f) => f.played && f.home !== 'player' && f.away !== 'player');
ok('non-player league uses engine', simFixtures.length > 0 && simFixtures.every((f) => f.simRounds === f.score[0] + f.score[1] && f.simRounds >= 5 && f.simRounds <= 9));
const simCup = s.season.cup.bracket.filter((m) => m.played && m.a !== 'player' && m.b !== 'player');
ok('non-player cup uses engine', simCup.length > 0 && simCup.every((m) => m.simRounds === m.score[0] + m.score[1] && m.simRounds >= 5 && m.simRounds <= 9));
ok('standings complete', s.season.standings.every((x) => x.played === 14));
ok('fixtures complete', s.season.fixtures.every((f) => f.played));

const report = seasonReport();
ok('season report', report.rank >= 1 && report.rank <= 8 && report.prize > 0);
nextSeason();
ok('next season reset', s.season.id === 2 && s.season.round === 1 && s.team.transfersLeft === 2);

s = resetCareer();
s.team.league = '丙级';
for (let i = 0; i < 8; i++) {
  const row = s.season.standings[i];
  row.played = 14;
  row.pts = row.teamId === 'player' ? 42 : 42 - i;
  row.w = row.teamId === 'player' ? 14 : 14 - i;
}
s.season.cup.phase = 'finished';
nextSeason();
ok('promotion to 乙级', s.team.league === '乙级');

s = resetCareer();
s.team.bank = 7777;
save();
__clearStateForTest();
const loaded = loadCareer();
ok('save load roundtrip', loaded.team.bank === 7777);
store.map.set('cs2d_career', '{bad json');
__clearStateForTest();
const rebuilt = loadCareer();
ok('corrupt rebuild', rebuilt.team.bank === 12000);
ok('corrupt backup', store.map.has('cs2d_career_backup'));
store.map.set('cs2d_career', JSON.stringify({ version: 1, player: {}, team: {}, season: {}, history: [], news: [] }));
__clearStateForTest();
const migrated = loadCareer();
ok('old save rebuilt with real info', migrated.player.name === 'donk' && migrated.team.name === 'Team Spirit' && store.map.has('cs2d_career_backup'));

s = resetCareer();
s.pendingMatch = { oppId: 't1', venue: 'home', isCup: false };
const bank0 = s.team.bank;
const xp0 = s.player.xp;
const played0 = s.player.seasonStats.played;
r = abandonPendingMatch();
ok('abandon ok', r.ok);
ok('abandon no reward', s.team.bank === bank0 && s.player.xp === xp0 && s.player.seasonStats.played === played0 + 1 && s.player.seasonStats.l === 1);
s = resetCareer();
const awayFixture = s.season.fixtures.find((f) => f.away === 'player');
s.season.round = awayFixture.round;
s.pendingMatch = { oppId: awayFixture.home, venue: 'away', isCup: false };
abandonPendingMatch();
const awayAbandon = s.season.fixtures.find((f) => f.round === awayFixture.round && f.played && (f.home === 'player' || f.away === 'player'));
ok('away abandon score order', awayAbandon && awayAbandon.score[0] === ROUND.MATCH_WIN && awayAbandon.score[1] === 0 && awayAbandon.winner !== 'player');

s = resetCareer();
r = simulatePlayerMatch();
ok('simulate match ok', r.ok && typeof r.win === 'boolean' && Array.isArray(r.rounds) && r.rounds.length >= 5);

s = resetCareer();
{
  const pf = findPlayerFixture(s);
  const fv = pf.home === 'player' ? 'home' : 'away';
  s.pendingMatch = { oppId: pf.home === 'player' ? pf.away : pf.home, venue: fv, isCup: false };
}
const live = createGame({ mode: 'career' });
live.ui = null;
live.seed = 20260803;
startMatch(live);
ok('career live start', !!live.careerMatch && live.entities.length === 9 && live.state === 'BUY' && live.player.spreadMult > 0);
const realNames = ['b1t', 'iM', 'jL', 'Aleksib', 'w0nderful', 'm0NESY', 'huNter-', 'Snax', 'malbsMd', 'heavyGod', 'karrigan', 'rain', 'broky', 'frozen', 'ropz', 'ZywOo', 'flameZ', 'apEX', 'mezii', 'Spinx', 'torzsi', 'Brollan', 'Jimpphat', 'xertioN', 'siuhy', 'dev1ce', 'stavn', 'jabbi', 'cadian', 'Staehr', 'NAF', 'Twistzz', 'ultimate', 'jks', 'YEKINDAR', 'Jame', 'electroNic', 'fame', 'n0rb3r7', 'FL1T', 'XANTARES', 'woxic', 'MAJ3R', 'calyx', 'Wicadia', 'FalleN', 'KSCERATO', 'yuurih', 'skullz', 'drop', 'biguzera', 'kauez', 'nqz', 'snow', 'lux', 'EliGE', 'JT', 'floppy', 'hallzerk', 'Grim'];
ok('career live foe names', live.entities.filter((e) => e.bot && e.team !== 't').every((e) => realNames.includes(e.name)));
live.player.team = s.pendingMatch.venue === 'home' ? 't' : 'ct';
live.score[live.player.team === 't' ? 'T' : 'CT'] = ROUND.MATCH_WIN;
const endRes = careerEndMatch(live);
ok('career live end', endRes.ok && live.careerMatch.settled && s.player.seasonStats.played === 1 && s.team.bank > 12000);
const endAgain = careerEndMatch(live);
ok('career double settle blocked', !endAgain.ok && s.player.seasonStats.played === 1);

s = resetCareer();
{
  const pf = findPlayerFixture(s);
  const fv = pf.home === 'player' ? 'home' : 'away';
  s.pendingMatch = { oppId: pf.home === 'player' ? pf.away : pf.home, venue: fv, isCup: false };
}
const live2 = createGame({ mode: 'career' });
live2.ui = null;
live2.seed = 4242;
startMatch(live2);
simulatePlayerMatch();
const lateRes = careerEndMatch(live2);
ok('career late settle after simulate blocked', !lateRes.ok && s.player.seasonStats.played === 1);

const fakeW = { spread: 2, ballistic: { first: 1, perShot: 0, max: 1, move: { stand: 1, walk: 1, run: 1, crouch: 1 } } };
const fakeEnt = { shotStreak: 0, spreadMult: 0.5, crouched: false, walking: false, vx: 0, vy: 0 };
ok('spread hook', Math.abs(effectiveSpread(fakeW, fakeEnt) - 1) < 1e-9);
const reloader = { dead: false, reloading: false, reloadMult: 0.5, team: 't', slot: 'primary', weapons: { primary: 'ak', secondary: null, nades: {} }, ammoMap: { ak: 0 }, reserveMap: { ak: 90 }, x: 0, y: 0 };
startReload(reloader, null);
ok('reload hook', Math.abs(reloader.reloadT - (WEAPONS.ak.reload / 1000) * 0.5) < 1e-9);

s = resetCareer();
for (let season = 0; season < 3; season++) {
  let guard = 0;
  while (s.season.cup.phase === 'idle' && guard++ < 20) {
    const step = simulatePlayerMatch();
    ok('multi season league', step.ok);
  }
  guard = 0;
  while (s.season.cup.phase === 'active' && guard++ < 10) {
    const step = simulatePlayerMatch();
    ok('multi season cup', step.ok);
  }
  ok('multi season complete', s.season.cup.phase === 'finished');
  nextSeason();
}
ok('multi season history', s.history.length === 3 && s.team.bank > 12000);

s = resetCareer();
s.season.cup.phase = 'finished';
s.season.cupResult = 3;
s.season.cupPrizeEarned = 15000;
s.history.push({ seasonId: 1, league: '乙级', rank: 1, cupRound: 3, prize: 45000 });
const settleHtml = __renderTabForTest('settlement');
ok('settlement renders history', settleHtml.includes('赛季结算') && settleHtml.includes('历史记录') && settleHtml.includes('赛季个人表现') && settleHtml.includes('赛季财务总结') && settleHtml.includes('累计收入'));

installStubs();
registerDomIds('careerPanel');
const fakeGame = { opts: { mode: 'career' }, ui: { showToast: () => {}, showMenu: () => {}, hideEnd: () => {}, hideMenu: () => {} } };
initCareerUi(document, fakeGame);
openCareer();
const panelHtml = document.getElementById('careerPanel').innerHTML;
ok('career ui renders', panelHtml.includes('生涯模式') && panelHtml.includes('赛季结算'));
const dashHtml = __renderTabForTest('dash');
ok('career readiness renders', dashHtml.includes('赛前状态') && dashHtml.includes('最终评级') && dashHtml.includes('对手评级') && dashHtml.includes('career-team-chip'));
const alertState = getState();
alertState.player.recordAlertLog = [{ matchSeq: 99, seasonId: alertState.season.id, round: 1, type: 'bestKills', label: '单场最高击杀', oldValue: 7, newValue: 9 }];
save();
const alertHtml = __renderTabForTest('dash');
ok('career record alert renders', alertHtml.includes('本场纪录刷新') && alertHtml.includes('单场最高击杀') && alertHtml.includes('7 → 9'));
for (const key of ['dash', 'schedule', 'training', 'roster', 'standings', 'cup', 'finance', 'stats']) {
  const html = __renderTabForTest(key);
  ok('career tab renders ' + key, html && html.length > 0);
}
const statsTabHtml = __renderTabForTest('stats');
ok('career awards renders', statsTabHtml.includes('赛季个人奖项'));
ok('career record detail renders', statsTabHtml.includes('生涯纪录详情') && statsTabHtml.includes('达成赛季') && statsTabHtml.includes('历史最佳'));
const cupTabHtml = __renderTabForTest('cup');
ok('career trophy case renders', cupTabHtml.includes('奖杯陈列'));
const trainingHtml = __renderTabForTest('training');
ok('career training radar renders', trainingHtml.includes('career-radar') && trainingHtml.includes('综合能力'));
const financeHtml = __renderTabForTest('finance');
ok('career finance renders', financeHtml.includes('财务概览') && financeHtml.includes('资金流水') && financeHtml.includes('赞助目标') && financeHtml.includes('财务风险提示') && financeHtml.includes('建议模式'));
const standingsHtml = __renderTabForTest('standings');
ok('career standings form column', standingsHtml.includes('近5') && standingsHtml.includes('预测最终') && standingsHtml.includes('升降级预测') && standingsHtml.includes('联赛规则') && standingsHtml.includes('career-team-sub'));
const schedState = getState();
const schedFi = schedState.season.fixtures.find((f) => f.home === 'player' || f.away === 'player');
schedFi.played = true;
schedFi.score = [13, 8];
schedFi.winner = 'player';
schedState.matchHistory.push({
  seasonId: schedState.season.id,
  round: schedFi.round,
  isCup: false,
  oppId: schedFi.home === 'player' ? schedFi.away : schedFi.home,
  oppName: '测试对手',
  win: true,
  kills: 9,
  deaths: 4,
  dmg: 630,
  money: 1500,
  score: [13, 8],
  mapId: schedFi.mapId,
  importance: '关键战'
});
save();
const scheduleHtml = __renderTabForTest('schedule');
ok('career schedule calendar', scheduleHtml.includes('主场') && scheduleHtml.includes('future') && scheduleHtml.includes('地图') && scheduleHtml.includes('data-act="fixture-detail"') && scheduleHtml.includes('战队档案') && scheduleHtml.includes('career-team-chip'));

console.log('career: all PASS');
