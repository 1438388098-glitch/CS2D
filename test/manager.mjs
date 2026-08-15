import { resetManager, loadManager, setStorage, setRng, getState, SAVE_KEY, BACKUP_KEY, VERSION, ROLE_WEIGHTS, buildManagerRoster, deriveAttrs, ratingFromAttrs, playerPrice, newManagerCareer, buildNewSeason, nextFixture, simulateManagerMatch, candidates, buyPlayer, sellPlayer, renewPlayer, transferWindowOpen, scoutingNoise, scoutedView, filterCandidates, trainPlayer, restPlayer, facilityStatus, upgradeFacility, trainingPreview, sponsorIncome, homeTicketIncome, cashflowForecast, seasonBudget, financialRisk, ledgerRecent, transferProfit, boardGoalFor, settleBoard, teamHealth, computeChemistry, sameTeamBonus, accumulateStress, pendingEvents, respondEvent, settlePlayerMatch, seasonReport, nextSeason } from '../src/manager.js';

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
ok('role weights sum to 1', Object.values(ROLE_WEIGHTS).every((w) => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 0.001));

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

{
  s.season.round = 6;
  ok('transfer window open', transferWindowOpen(s));
  const pool = candidates(s);
  ok('candidate pool 12', pool.length === 12);
  ok('candidate roles covered', new Set(pool.map((c) => c.role)).size >= 5);
  const cv = scoutedView(pool[0], 5);
  ok('scouted view has stars', cv.potentialStars >= 1 && cv.potentialStars <= 5);
  const filtered = filterCandidates(pool, { role: '狙击' });
  ok('filter by role', filtered.every((c) => c.role === '狙击'));
  s.team.bank = 99999;
  const c = pool.find((x) => x.role === '狙击') || pool[0];
  const buy = buyPlayer(s, c.id);
  ok('buy ok', buy.ok && s.team.roster.length >= 5);
  ok('bank decreased', s.team.bank < 99999);
  ok('transfersLeft--', s.team.transfersLeft === 1);
  s.season.round = 1;
  s.team.transfersLeft = 2;
  const sp = s.team.roster[0];
  const sell = sellPlayer(s, sp.id);
  ok('sell needs window', !sell.ok && sell.msg === '转会窗未开放');
  s.season.round = 6;
  s.team.transfersLeft = 2;
  s.team.roster.push({ ...pool[1], id: 'extra6', role: '补枪', price: 5000, contractYears: 3, renewalCost: 600 });
  const sell2 = sellPlayer(s, 'extra6');
  ok('sell 6th works', sell2.ok && s.team.roster.length === 5);
  const rp = s.team.roster[0];
  rp.contractYears = 1;
  s.team.bank = 50000;
  const rn = renewPlayer(s, rp.id);
  ok('renew ok', rn.ok && rp.contractYears === 3);
}

{
  const tp = s.team.roster[0];
  const prev = trainingPreview(s, tp, 'basic');
  ok('train preview cost', prev.cost > 0 && prev.gained >= 2);
  s.team.bank = 99999;
  const t1 = trainPlayer(s, tp.id, 'aim', 'basic');
  ok('train gained', t1.ok && t1.gained > 0 && tp.attrs.aim >= prev.gained);
  ok('train fatigue', tp.fatigue >= prev.fatigue);
  ok('trainingLeft--', s.team.trainingLeft === 1);
  const r1 = restPlayer(s, tp.id);
  ok('rest clears fatigue', r1.ok && tp.fatigue === 0);
  const fs = facilityStatus(s);
  ok('facility 4 kinds', fs.length === 4 && fs.every((f) => f.max === 3));
  s.team.bank = 99999;
  const up = upgradeFacility(s, 'scouting');
  ok('upgrade ok', up.ok && s.team.facilities.scouting === 1);
  ok('scouting reduces noise', scoutingNoise(s) === 4);
}

{
  s.team.morale = 65;
  const sp = sponsorIncome(s);
  ok('sponsor positive', sp > 0);
  const ti = homeTicketIncome(s, true);
  ok('ticket win > lose', ti > homeTicketIncome(s, false));
  const cf = cashflowForecast(s);
  ok('forecast projected', cf.projected > 0);
  const sb = seasonBudget(s);
  ok('budget base', sb.budget >= 15000);
  const fr = financialRisk(s);
  ok('risk level valid', ['安全', '谨慎', '紧张', '高风险'].includes(fr.level));
  s.team.bank = 100;
  ok('risk tense when broke', financialRisk(s).level === '紧张');
  s.team.bank = 100;
  s.season.round = 14;
  s.season.fixtures.forEach((f) => { if (f.round < 14 && (f.home === 'player' || f.away === 'player')) f.played = true; });
  ok('risk high late season broke', financialRisk(s).level === '高风险');
  s.team.bank = 20000;
  const cleanLedger = { ledger: [{ type: 'income', amount: 100, label: '卖出：x' }, { type: 'expense', amount: 50, label: '买入：y' }] };
  ok('transfer profit', transferProfit(cleanLedger).sellTotal === 100 && transferProfit(cleanLedger).buyTotal === 50);
  const stateLike = { team: { ledger: [{ amount: 100, label: 'a' }, { amount: 50, label: 'b' }] } };
  ok('ledger recent reversed', ledgerRecent(stateLike)[0].amount === 50);
}

{
  s = newManagerCareer();
  ok('board goal 乙级', boardGoalFor('乙级').rank === 2);
  s.board.trust = 70;
  settleBoard(s, 2, 1);
  ok('goal met trust up', s.board.trust === 85);
  ok('goal reward banked', s.team.bank > 12000);
  s.board.trust = 30;
  settleBoard(s, 8, 0);
  ok('goal fail trust down', s.board.trust === 15);
  ok('fired when trust low', s.board.fired === true);
  s = newManagerCareer();
  const h = teamHealth(s);
  ok('health has 5 keys', ['money', 'morale', 'fatigue', 'roster', 'stress'].every((k) => k in h));
  ok('health levels valid', ['green', 'yellow', 'red'].includes(h.money));
  ok('complete roster health green', h.roster === 'green');
  const ch = computeChemistry(s);
  ok('chemistry 30-95', ch >= 30 && ch <= 95);
  const bonus = sameTeamBonus(s);
  ok('same team bonus type', bonus === null || (bonus.react < 0 && bonus.spreadMult < 0));
  accumulateStress(s);
  ok('stress sum number', typeof s.team.stressSum === 'number');
  const pe = pendingEvents(s);
  ok('pending events array', Array.isArray(pe));
}

{
  s = newManagerCareer();
  let guard = 0;
  while (s.season.round <= s.season.totalRounds && guard++ < 200) {
    const f = nextFixture(s);
    if (!f) break;
    settlePlayerMatch(s, guard % 2 === 0, 15, 10);
  }
  ok('league reached cup', s.season.cup.phase === 'active' || s.season.cup.phase === 'finished');
  guard = 0;
  while (s.season.cup.phase === 'active' && guard++ < 30) {
    settlePlayerMatch(s, guard % 2 === 0, 15, 10);
  }
  ok('cup finished', s.season.cup.phase === 'finished');
  const rep = seasonReport(s);
  ok('report rank 1-8', rep.rank >= 1 && rep.rank <= 8);
  ok('report has league', ['甲级', '乙级', '丙级'].includes(rep.nextLeague));
  const prevId = s.season.id;
  s = nextSeason();
  ok('season advanced', s.season.id === prevId + 1);
  ok('new season teams', s.season.teams.length === 8);
  ok('new fixtures', s.season.fixtures.length === 56);
}

{
  s = newManagerCareer();
  const ids = s.season.teams.map((t) => t.id);
  const others = ids.filter((id) => id !== 'player').slice(0, 7);
  const qf = [
    { round: 'QF', a: others[0], b: others[5], score: null, played: false, winner: null },
    { round: 'QF', a: others[1], b: others[6], score: null, played: false, winner: null },
    { round: 'QF', a: others[2], b: 'player', score: null, played: false, winner: null },
    { round: 'QF', a: others[3], b: others[4], score: null, played: false, winner: null }
  ];
  qf.push({ round: 'SF', a: null, b: null, score: null, played: false, winner: null });
  qf.push({ round: 'SF', a: null, b: null, score: null, played: false, winner: null });
  qf.push({ round: 'F', a: null, b: null, score: null, played: false, winner: null });
  s.season.cup = { phase: 'active', bracket: qf };
  const inB = s.season.cup.bracket.find((m) => m.b === 'player');
  ok('player placed at b slot', !!inB);
  let guard2 = 0;
  while (s.season.cup.phase === 'active' && guard2++ < 30) {
    settlePlayerMatch(s, guard2 % 2 === 0, 15, 10);
  }
  ok('cup finished from b slot', s.season.cup.phase === 'finished');
}

console.log('manager: all PASS');
