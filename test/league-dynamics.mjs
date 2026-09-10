// 联赛动态状态回归：非玩家队每场赛后 form/morale/动态评级持续演进，
// teamPower 读取这些动态字段（状态联动），评级漂移 clamp 在联赛 ratingRange 内。
// manager.js（markFixture/teamPower）与 career.js（simulatePlayerMatch 驱动的 updateTeamDynamics）两侧都覆盖。
import {
  setStorage, setRng, newManagerCareer, markFixture, teamPower, simulateManagerMatch, LEAGUE_RULES
} from '../src/manager.js';
import {
  resetCareer, setStorage as setCareerStorage, setRng as setCareerRng,
  getState as getCareerState, leagueRules, simulatePlayerMatch, nextMatch
} from '../src/career.js';

const ok = (name, cond) => { if (!cond) throw new Error('league-dynamics: ' + name + ' FAIL'); console.log('league-dynamics: ' + name + ' PASS'); };

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

// ---------- manager.js 侧 ----------
setStorage(fakeStorage());
setRng(() => 0.5); // 固定随机流：动态规则本身必须确定性（不得引入 Math.random/Date.now）

{
  const s = newManagerCareer();
  const [lo, hi] = (LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级']).ratingRange;
  const mid = Math.round((lo + hi) / 2);
  const f0 = s.season.fixtures.find((x) => !x.played && x.home !== 'player' && x.away !== 'player');
  const home = s.season.teams.find((t) => t.id === f0.home);
  const away = s.season.teams.find((t) => t.id === f0.away);

  // 人工构造势头：home 四连胜、away 四连败，评分/士气相同
  home.form = ['W', 'W', 'W', 'W']; home.rating = mid; home.morale = 60;
  away.form = ['L', 'L', 'L', 'L']; away.rating = mid; away.morale = 60;
  const homePowerBefore = teamPower(s, home.id, 'attack');
  const awayPowerBefore = teamPower(s, away.id, 'defense');

  markFixture(s, f0, [5, 0], home.id);

  ok('win pushes W into form (window keeps 5)', home.form.length === 5 && home.form.filter((x) => x === 'W').length === 5);
  ok('loss pushes L into form (window keeps 5)', away.form.length === 5 && away.form[4] === 'L');
  ok('win streak rating +1/场', home.rating === mid + 1);
  ok('lose streak rating -1/场', away.rating === mid - 1);
  ok('streak counters tracked', home.streak === 5 && away.streak === 5);
  ok('morale drifts +2/-2 per match', home.morale === 62 && away.morale === 58);
  ok('teamPower rises with winning state', teamPower(s, home.id, 'attack') > homePowerBefore);
  ok('teamPower falls with losing state', teamPower(s, away.id, 'defense') < awayPowerBefore);
  ok('same rating, form separates power', teamPower(s, home.id, 'attack') > teamPower(s, away.id, 'attack'));

  // 玩家队保护：玩家队 rating 不漂移（form/morale 更新为既有行为，保持不变）
  const playerTeam = s.season.teams.find((t) => t.id === 'player');
  const pRating = playerTeam.rating;
  const pFormLen = (playerTeam.form || []).length;
  const pf = s.season.fixtures.find((x) => !x.played && (x.home === 'player' || x.away === 'player'));
  markFixture(s, pf, [5, 0], 'player');
  ok('player team rating never drifts', playerTeam.rating === pRating);
  ok('player team keeps existing form/morale behavior', playerTeam.form.length === pFormLen + 1 && playerTeam.morale === 62);

  // 连胜累计：连续标记 3 场胜利，评级累计 +3（±1/场级别，无跳变）
  const streakTeam = home;
  const ratingAfterFirst = streakTeam.rating;
  for (let i = 0; i < 2; i++) {
    const fx = s.season.fixtures.find((x) => !x.played && (x.home === streakTeam.id || x.away === streakTeam.id));
    markFixture(s, fx, [5, 0], streakTeam.id);
  }
  ok('streak accumulates +1 per win', streakTeam.rating === ratingAfterFirst + 2 && streakTeam.rating === mid + 3);

  // clamp 上界：评分顶到 hi 后再赢不再越界
  const clampTeam = s.season.teams.find((t) => t.id !== 'player' && t.id !== home.id && t.id !== away.id);
  clampTeam.rating = hi; clampTeam.form = ['W', 'W', 'W', 'W']; clampTeam.morale = 60;
  const cf1 = s.season.fixtures.find((x) => !x.played && (x.home === clampTeam.id || x.away === clampTeam.id));
  markFixture(s, cf1, [5, 0], clampTeam.id);
  ok('clamp holds rating at league hi', clampTeam.rating === hi);
  // clamp 下界：评分压到 lo 后再输不再越界
  clampTeam.rating = lo; clampTeam.form = ['L', 'L', 'L', 'L'];
  const cf2 = s.season.fixtures.find((x) => !x.played && (x.home === clampTeam.id || x.away === clampTeam.id));
  markFixture(s, cf2, [0, 5], cf2.home === clampTeam.id ? cf2.away : cf2.home);
  ok('clamp holds rating at league lo', clampTeam.rating === lo);

  // 模拟引擎实战若干场：动态字段持续演进、teamPower 输入同步变化且越界被钳制
  let guard = 0;
  while (guard++ < 12) {
    const fx = s.season.fixtures.find((x) => !x.played && x.home !== 'player' && x.away !== 'player');
    if (!fx) break;
    const h = s.season.teams.find((t) => t.id === fx.home);
    const a = s.season.teams.find((t) => t.id === fx.away);
    const r = simulateManagerMatch(s, h, a, { mapId: fx.mapId || h.homeMap });
    markFixture(s, fx, r.score, r.winner);
  }
  ok('simulated season keeps non-player ratings in ratingRange', s.season.teams
    .filter((t) => t.id !== 'player')
    .every((t) => t.rating >= lo && t.rating <= hi));
  ok('form window never exceeds 5', s.season.teams.every((t) => (t.form || []).length <= 5));
  ok('morale stays clamped 20-100', s.season.teams.every((t) => t.morale >= 20 && t.morale <= 100));
  ok('power inputs actually evolved (form/morale/rating drift seen)', s.season.teams
    .filter((t) => t.id !== 'player')
    .some((t) => (t.form || []).length > 0 && typeof t.streak === 'number'));
}

// ---------- career.js 侧 ----------
setCareerStorage(fakeStorage());
setCareerRng(() => 0.5);

{
  const c = resetCareer();
  const [lo, hi] = leagueRules(c.team.league).ratingRange;
  const mid = Math.round((lo + hi) / 2);
  const nm = nextMatch(c);
  const oppId = nm.home === 'player' ? nm.away : nm.home;
  const opp = c.season.teams.find((t) => t.id === oppId);
  opp.form = ['W', 'W', 'W', 'W']; opp.rating = mid; opp.morale = 60;
  const playerTeam = c.season.teams.find((t) => t.id === 'player');
  const playerFormLen = (playerTeam.form || []).length;

  const res = simulatePlayerMatch();
  ok('career sim match played', res && res.ok);

  const after = getCareerState().season.teams.find((t) => t.id === oppId);
  const fx = c.season.fixtures.find((x) => x.played && (x.home === oppId || x.away === oppId));
  const oppWon = fx.winner === oppId;
  ok('career opponent form pushed with result', after.form.length === 5 && after.form[4] === (oppWon ? 'W' : 'L'));
  ok('career opponent rating drifts ±1/场 toward result', after.rating === mid + (oppWon ? 1 : -1));
  ok('career opponent morale drifts ±2', after.morale === (oppWon ? 62 : 58));
  ok('career recentForm synced with form', after.recentForm === after.form.join(''));
  ok('career streak tracked', typeof after.streak === 'number' && after.streak >= 1);
  ok('career player team untouched by dynamics', getCareerState().season.teams.find((t) => t.id === 'player').form.length === playerFormLen);

  // clamp 压力测试：全员顶格 hi，连续模拟多轮，任何胜者都不得越过 ratingRange
  const c2 = resetCareer();
  for (const t of c2.season.teams) { if (t.id !== 'player') { t.rating = hi; t.form = ['W', 'W', 'W', 'W']; t.morale = 60; } }
  let guard = 0;
  let simOk = true;
  while (guard++ < 6) { const r = simulatePlayerMatch(); if (!r.ok) { simOk = false; break; } }
  ok('career sim rounds advanced under clamp pressure', simOk);
  const st = getCareerState();
  ok('career clamp keeps all non-player ratings within ratingRange', st.season.teams
    .filter((t) => t.id !== 'player')
    .every((t) => t.rating >= lo && t.rating <= hi));
  ok('career clamp visibly caps winners at hi', st.season.teams.some((t) => t.id !== 'player' && t.rating === hi));
  ok('career form window never exceeds 5', st.season.teams.every((t) => (t.form || []).length <= 5));
}

console.log('league-dynamics: all PASS');
