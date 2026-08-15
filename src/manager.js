import { MAJOR_TEAMS } from './modes.js';

export const SAVE_KEY = 'cs2d_manager';
export const BACKUP_KEY = 'cs2d_manager_backup';
export const VERSION = 1;

export const ROLES = ['突破', '狙击', '指挥', '步枪', '自由人', '补枪'];
export const ROLE_ARCHE = { 突破: 'breacher', 狙击: 'sniper', 指挥: 'support', 步枪: 'rifler', 自由人: 'lurk', 补枪: 'rifler' };

export const ROLE_WEIGHTS = {
  突破: { aim: 0.30, react: 0.25, movement: 0.14, clutch: 0.06, nade: 0.05, gameIQ: 0.05, leadership: 0.02, composure: 0.05, aggression: 0.06, discipline: 0.02 },
  狙击: { aim: 0.35, react: 0.25, movement: 0.08, clutch: 0.08, nade: 0.03, gameIQ: 0.06, leadership: 0.03, composure: 0.08, aggression: 0.02, discipline: 0.02 },
  指挥: { aim: 0.08, react: 0.08, movement: 0.06, clutch: 0.08, nade: 0.10, gameIQ: 0.25, leadership: 0.30, composure: 0.07, aggression: 0.03, discipline: 0.05 },
  步枪: { aim: 0.25, react: 0.18, movement: 0.18, clutch: 0.08, nade: 0.06, gameIQ: 0.06, leadership: 0.02, composure: 0.06, aggression: 0.05, discipline: 0.06 },
  自由人: { aim: 0.12, react: 0.12, movement: 0.12, clutch: 0.32, nade: 0.06, gameIQ: 0.22, leadership: 0.02, composure: 0.06, aggression: 0.02, discipline: 0.04 },
  补枪: { aim: 0.28, react: 0.14, movement: 0.10, clutch: 0.08, nade: 0.08, gameIQ: 0.22, leadership: 0.02, composure: 0.04, aggression: 0.03, discipline: 0.06 }
};

export const LEAGUE_RULES = {
  甲级: { ratingRange: [80, 92], sponsor: 5000, ticketBase: 1200, matchWin: 2200, matchLose: 500, prizeScale: 1.45, costScale: 1.35, priceCap: 30000, refundScale: 0.55, budgetBase: 28000, cupRoundPrize: 6500, cupFinalPrize: 42000 },
  乙级: { ratingRange: [70, 85], sponsor: 3200, ticketBase: 800, matchWin: 1500, matchLose: 300, prizeScale: 1, costScale: 1, priceCap: 20000, refundScale: 0.5, budgetBase: 20000, cupRoundPrize: 5000, cupFinalPrize: 30000 },
  丙级: { ratingRange: [60, 74], sponsor: 2000, ticketBase: 500, matchWin: 1000, matchLose: 200, prizeScale: 0.72, costScale: 0.72, priceCap: 16000, refundScale: 0.45, budgetBase: 15000, cupRoundPrize: 3500, cupFinalPrize: 18000 }
};

let storage = null;
try { if (typeof globalThis !== 'undefined' && globalThis.localStorage) storage = globalThis.localStorage; } catch (e) { storage = null; }
let rng = Math.random;
let state = null;

export function setRng(fn) { rng = fn || Math.random; }
export function setStorage(s) { storage = s; }
export function isStorageAvailable() { return !!storage; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function randInt(a, b) { return a + Math.floor(rng() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

function blankRoster() { return []; }

function baseManager() {
  return {
    version: VERSION,
    manager: { name: '神秘经理', reputation: 50, skill: { biz: 40, scout: 40, coach: 40, negotiate: 40 }, seasonStats: { played: 0, w: 0, l: 0, prizeEarned: 0 } },
    team: {
      name: 'Team Spirit', league: '乙级', bank: 12000,
      roster: [], coach: { name: '暂无', level: 1, focus: '均衡' },
      facilities: { academy: 0, medical: 0, scouting: 0, analytics: 0 },
      trainingLeft: 2, transfersLeft: 2, transferWindow: false,
      pool: null, ledger: [], trainingLog: [], transferLog: [], eventLog: [],
      morale: 65, chemistry: 60, stressSum: 0,
      sponsor: 3200, fans: 2000, ticketBase: 800
    },
    season: { id: 1, round: 1, totalRounds: 14, teams: [], fixtures: [], standings: [], cup: { phase: 'idle', bracket: [] }, matchHistory: [] },
    board: { goal: { rank: 6, cup: 1, reward: 10000 }, trust: 70, fired: false },
    history: [], news: [], achievements: [], records: { bestSeasonRank: 99, totalPrize: 0, cupChampions: 0, bestWinStreak: 0 }
  };
}

export function migrateManagerState(parsed) {
  if (!parsed || typeof parsed !== 'object') return baseManager();
  const b = baseManager();
  parsed.version = VERSION;
  parsed.manager = Object.assign(b.manager, parsed.manager || {});
  parsed.team = Object.assign(b.team, parsed.team || {});
  parsed.team.facilities = Object.assign(b.team.facilities, parsed.team.facilities || {});
  parsed.team.roster = Array.isArray(parsed.team.roster) ? parsed.team.roster : [];
  parsed.team.ledger = Array.isArray(parsed.team.ledger) ? parsed.team.ledger : [];
  parsed.season = Object.assign(b.season, parsed.season || {});
  parsed.season.teams = Array.isArray(parsed.season.teams) ? parsed.season.teams : [];
  parsed.season.fixtures = Array.isArray(parsed.season.fixtures) ? parsed.season.fixtures : [];
  parsed.season.standings = Array.isArray(parsed.season.standings) ? parsed.season.standings : [];
  parsed.season.cup = Object.assign({ phase: 'idle', bracket: [] }, parsed.season.cup || {});
  parsed.board = Object.assign(b.board, parsed.board || {});
  parsed.history = Array.isArray(parsed.history) ? parsed.history : [];
  parsed.news = Array.isArray(parsed.news) ? parsed.news : [];
  parsed.achievements = Array.isArray(parsed.achievements) ? parsed.achievements : [];
  return parsed;
}

function read(key) {
  if (!storage) return null;
  try { return storage.getItem(key); } catch (e) { return null; }
}
function write(key, val) {
  if (!storage) return;
  try { storage.setItem(key, val); } catch (e) { /* quota */ }
}

export function save() {
  if (!state) return;
  write(SAVE_KEY, JSON.stringify(state));
}

export function resetManager() {
  state = migrateManagerState(baseManager());
  save();
  return state;
}

export function loadManager() {
  const raw = read(SAVE_KEY);
  if (!raw) return resetManager();
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version === VERSION) { state = migrateManagerState(parsed); return state; }
    write(BACKUP_KEY, raw);
    return resetManager();
  } catch (e) {
    write(BACKUP_KEY, raw);
    return resetManager();
  }
}

export function getState() { return state || loadManager(); }
export function __clearManagerStateForTest() { state = null; }

export const ATTRS = ['aim', 'react', 'movement', 'clutch', 'nade', 'gameIQ', 'leadership', 'composure', 'aggression', 'discipline'];
export const TRAIT_WEIGHTS = ROLE_WEIGHTS;

export function deriveAttrs(base) {
  const aim = base.aim || 75, movement = base.movement || 75, clutch = base.clutch || 75, nade = base.nade || 75;
  return {
    aim: clamp(aim, 40, 99),
    react: clamp(Math.round((aim + movement) / 2), 40, 99),
    movement: clamp(movement, 40, 99),
    clutch: clamp(clutch, 40, 99),
    nade: clamp(nade, 40, 99),
    gameIQ: clamp(Math.round((nade + clutch) / 2), 40, 99),
    leadership: 70,
    composure: clamp(clutch, 40, 99),
    aggression: clamp(Math.round((aim + movement) / 2), 40, 99),
    discipline: clamp(nade, 40, 99)
  };
}

export function ratingFromAttrs(role, attrs) {
  const w = ROLE_WEIGHTS[role] || ROLE_WEIGHTS['步枪'];
  let sum = 0;
  for (const k of ATTRS) sum += (attrs[k] || 50) * (w[k] || 0);
  return clamp(Math.round(sum), 40, 99);
}

export function teamIdFromName(name) {
  for (const t of MAJOR_TEAMS) {
    if (t.players.some((p) => p.name === name)) return t.id;
  }
  return null;
}

let uidCounter = 0;
function newPlayerId() { return 'm' + (++uidCounter); }

export function makePlayerFromMajor(p) {
  const attrs = deriveAttrs(p);
  const role = p.role && ROLE_WEIGHTS[p.role] ? p.role : '步枪';
  return {
    id: newPlayerId(),
    name: p.name,
    role,
    teamOfOrigin: teamIdFromName(p.name),
    age: randInt(18, 27),
    attrs,
    rating: ratingFromAttrs(role, attrs),
    potential: clamp(ratingFromAttrs(role, attrs) + randInt(3, 10), 40, 99),
    personality: pick(['hyperAggressive', 'disciplined', 'clutchGod', 'mercurial', 'leader', 'quiet', 'confident', 'fragile']),
    morale: randInt(55, 85),
    fatigue: randInt(0, 25),
    stress: randInt(0, 25),
    chemistry: {},
    contractYears: randInt(2, 4),
    renewalCost: 0,
    price: 0,
    form: [],
    stats: { kills: 0, deaths: 0, mvp: 0, games: 0, firstKills: 0, clutchWins: 0, adr: 0, rating: 0 }
  };
}

export function playerPrice(p, league) {
  const rules = LEAGUE_RULES[league] || LEAGUE_RULES['乙级'];
  return Math.min(Math.round(p.rating * 300 * rules.costScale), rules.priceCap);
}

export function buildManagerRoster(league) {
  const rules = LEAGUE_RULES[league] || LEAGUE_RULES['乙级'];
  const [lo, hi] = rules.ratingRange;
  const all = [];
  for (const team of MAJOR_TEAMS) for (const p of team.players) all.push(p);
  const needRoles = ['突破', '狙击', '指挥', '自由人', '补枪'];
  const chosen = [];
  for (const role of needRoles) {
    const cands = all.filter((p) => p.role === role || (role === '补枪' && p.role === '步枪'));
    const picked = cands[Math.floor(rng() * cands.length)];
    if (picked) chosen.push(picked);
  }
  if (chosen.length < 5) {
    for (const p of all) { if (chosen.length >= 5) break; if (!chosen.includes(p)) chosen.push(p); }
  }
  const roster = chosen.slice(0, 5).map((p) => {
    const pl = makePlayerFromMajor(p);
    pl.price = playerPrice(pl, league);
    pl.renewalCost = Math.round(pl.price * 0.12);
    pl.form = ['W', 'W', 'L'];
    return pl;
  });
  const avg = Math.round(roster.reduce((a, p) => a + p.rating, 0) / Math.max(1, roster.length));
  const target = randInt(lo, hi);
  const offset = clamp(target - avg, -6, 6);
  for (const p of roster) {
    p.rating = clamp(p.rating + offset, lo, hi + 8);
    p.price = playerPrice(p, league);
  }
  return roster;
}

export const MAP_IDS = ['dust2', 'metro', 'forge', 'atrium', 'arctic'];

function roundRobin(ids) {
  const n = ids.length;
  const rounds = [];
  const rest = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const line = [ids[0], ...rest];
    const pairs = [];
    for (let i = 0; i < n / 2; i++) pairs.push([line[i], line[n - 1 - i]]);
    rounds.push(pairs);
    rest.unshift(rest.pop());
  }
  const second = rounds.map((pairs) => pairs.map(([a, b]) => [b, a]));
  return [...rounds, ...second];
}

function makeFixtures(teamIds) {
  const fixtures = [];
  roundRobin(teamIds).forEach((pairs, ri) => {
    for (const [home, away] of pairs) fixtures.push({ round: ri + 1, home, away, score: null, played: false, winner: null });
  });
  return fixtures;
}

function makeStandings(teams) {
  return teams.map((t) => ({ teamId: t.id, played: 0, w: 0, d: 0, l: 0, pts: 0 }));
}

function makeCup(standings) {
  const table = [...standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
  const ids = table.map((x) => x.teamId);
  const qf = [[ids[0], ids[7]], [ids[3], ids[4]], [ids[2], ids[5]], [ids[1], ids[6]]];
  const bracket = qf.map(([a, b]) => ({ round: 'QF', a, b, score: null, played: false, winner: null }));
  bracket.push({ round: 'SF', a: null, b: null, score: null, played: false, winner: null });
  bracket.push({ round: 'SF', a: null, b: null, score: null, played: false, winner: null });
  bracket.push({ round: 'F', a: null, b: null, score: null, played: false, winner: null });
  return { phase: 'active', bracket };
}

export function teamProfile(s, teamId) {
  const t = s.season.teams.find((x) => x.id === teamId);
  if (!t) return null;
  return { id: t.id, name: t.name, tag: t.tag, rating: t.rating, style: t.style, homeMap: t.homeMap, form: t.form || [], morale: t.morale };
}

export function buildManagerTeams(league, playerRoster) {
  const rules = LEAGUE_RULES[league] || LEAGUE_RULES['乙级'];
  const [lo, hi] = rules.ratingRange;
  const playerRating = Math.round(playerRoster.reduce((a, p) => a + p.rating, 0) / Math.max(1, playerRoster.length));
  const teams = [{
    id: 'player', name: '我的战队', tag: 'MINE', rating: playerRating,
    homeMap: pick(MAP_IDS), style: '全能均衡', form: [], morale: 60, roster: playerRoster
  }];
  const pool = MAJOR_TEAMS.slice();
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(rng() * pool.length);
    const src = pool.splice(idx, 1)[0];
    const rating = randInt(lo, hi);
    const oppRoster = src.players.slice(0, 5).map((p) => {
      const pl = makePlayerFromMajor(p);
      pl.price = playerPrice(pl, league);
      return pl;
    });
    teams.push({
      id: 't' + (i + 1), name: src.name, tag: src.tag, rating, style: src.style,
      homeMap: pick(MAP_IDS), form: [], morale: randInt(50, 70), roster: oppRoster,
      aggression: randInt(40, 70), tactics: '默认'
    });
  }
  return teams;
}

function refreshCup(s) {
  const b = s.season.cup.bracket;
  if (b[4] && !b[4].played && b[0].played && b[1].played) { b[4].a = b[0].winner; b[4].b = b[1].winner; }
  if (b[5] && !b[5].played && b[2].played && b[3].played) { b[5].a = b[2].winner; b[5].b = b[3].winner; }
  if (b[6] && !b[6].played && b[4].played && b[5].played) { b[6].a = b[4].winner; b[6].b = b[5].winner; }
  if (b[6].played) { s.season.cup.phase = 'finished'; s.season.cup.champion = b[6].winner; }
}

export function assignFixtureMaps(s) {
  for (const f of s.season.fixtures) {
    const home = s.season.teams.find((t) => t.id === f.home);
    f.mapId = home ? home.homeMap : 'dust2';
  }
}

export function buildNewSeason(s) {
  s.season.round = 1;
  s.season.teams = buildManagerTeams(s.team.league, s.team.roster);
  const ids = s.season.teams.map((t) => t.id);
  s.season.fixtures = makeFixtures(ids);
  s.season.standings = makeStandings(s.season.teams);
  s.season.cup = { phase: 'idle', bracket: [] };
  assignFixtureMaps(s);
  return s;
}

export function nextFixture(s) {
  return s.season.fixtures.find((f) => !f.played && (f.home === 'player' || f.away === 'player')) || null;
}

export function newManagerCareer() {
  state = migrateManagerState(baseManager());
  state.team.roster = buildManagerRoster(state.team.league);
  buildNewSeason(state);
  save();
  return state;
}

export function initManagerIfNeeded() {
  const raw = read(SAVE_KEY);
  if (raw) return loadManager();
  return newManagerCareer();
}

export function teamPower(s, teamId, attack) {
  const t = s.season.teams.find((x) => x.id === teamId);
  if (!t) return 60;
  const base = Number(t.rating) || 60;
  const formScore = (t.form || []).reduce((a, f) => a + (f === 'W' ? 1 : -1), 0);
  const morale = (t.morale != null ? t.morale : 50) - 50;
  const homeBonus = teamId === 'player' ? 2 : 0;
  const fatigue = 0;
  return clamp(base * 0.65 + (formScore * 0.4) + morale * 0.12 + homeBonus - fatigue, 35, 112);
}

function simDuelWin(aRating, dRating, aPower, dPower) {
  return clamp(0.5 + (aRating - dRating) * 0.006 + (aPower - dPower) * 0.01, 0.12, 0.92);
}

function simulateManagerRound(index, home, away, s, stats) {
  const need = 5;
  const attacker = index % 2 === 0 ? home : away;
  const defender = attacker === home ? away : home;
  const aPower = teamPower(s, attacker.id, 'attack');
  const dPower = teamPower(s, defender.id, 'defense');
  const events = [];
  if (rng() < 0.4) events.push({ t: 'utility', side: attacker.id, text: attacker.name + ' 使用道具控制入口' });
  const entry = (attacker.roster || [])[Math.floor(rng() * Math.max(1, (attacker.roster || []).length))] || { name: attacker.name, rating: attacker.rating, role: '步枪' };
  const anchor = (defender.roster || []).find((p) => p.role === '指挥') || (defender.roster || [])[0] || { name: defender.name, rating: defender.rating, role: '步枪' };
  const entryWin = rng() < simDuelWin(entry.rating, anchor.rating, aPower, dPower);
  const duelWinner = entryWin ? attacker : defender;
  const winnerPlayer = entryWin ? entry : anchor;
  const loserPlayer = entryWin ? anchor : entry;
  if (!stats[winnerPlayer.name]) stats[winnerPlayer.name] = { name: winnerPlayer.name, role: winnerPlayer.role, team: duelWinner.id, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 };
  if (!stats[loserPlayer.name]) stats[loserPlayer.name] = { name: loserPlayer.name, role: loserPlayer.role, team: (entryWin ? defender : attacker).id, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 };
  stats[winnerPlayer.name].kills++;
  stats[loserPlayer.name].deaths++;
  events.push({ t: 'duel', side: duelWinner.id, text: winnerPlayer.name + ' 对位击败 ' + loserPlayer.name });
  const siteControl = rng() < clamp(0.5 + (aPower - dPower) * 0.01 + (entryWin ? 0.12 : 0), 0.22, 0.92);
  let winner;
  if (!siteControl) {
    winner = rng() < clamp(0.5 + (aPower - dPower) * 0.01 - 0.12, 0.18, 0.88) ? attacker : defender;
    events.push({ t: 'elimination', side: winner.id, text: winner.name + ' 在残局中清空点位' });
  } else {
    const planter = (attacker.roster || [])[Math.floor(rng() * Math.max(1, (attacker.roster || []).length))];
    if (planter) { stats[planter.name] = stats[planter.name] || { name: planter.name, role: planter.role, team: attacker.id, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 }; stats[planter.name].plants++; }
    events.push({ t: 'plant', side: attacker.id, text: (planter ? planter.name : attacker.name) + ' 安放 C4' });
    const retake = rng() < clamp(0.42 + (dPower - aPower) * 0.012, 0.18, 0.88);
    if (!retake) {
      winner = attacker;
      events.push({ t: 'post_plant', side: attacker.id, text: attacker.name + ' 守住点位' });
    } else {
      const defuser = (defender.roster || [])[Math.floor(rng() * Math.max(1, (defender.roster || []).length))];
      const defused = rng() < clamp(0.5 + (dPower - aPower) * 0.01, 0.15, 0.92);
      if (defused) {
        if (defuser) { stats[defuser.name] = stats[defuser.name] || { name: defuser.name, role: defuser.role, team: defender.id, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 }; stats[defuser.name].defuses++; }
        winner = defender;
        events.push({ t: 'defuse', side: defender.id, text: (defuser ? defuser.name : defender.name) + ' 拆掉 C4' });
      } else {
        const clutchPlayer = (attacker.roster || []).find((p) => p.role === '自由人') || entry;
        if (stats[clutchPlayer.name]) { stats[clutchPlayer.name].kills++; stats[clutchPlayer.name].clutches++; }
        if (defuser && stats[defuser.name]) stats[defuser.name].deaths++;
        winner = attacker;
        events.push({ t: 'clutch', side: attacker.id, text: clutchPlayer.name + ' 完成残局' });
      }
    }
  }
  events.push({ t: 'round_end', side: winner.id, round: index + 1, text: winner.name + ' 赢下第 ' + (index + 1) + ' 回合' });
  return { round: index + 1, attacker: attacker.id, defender: defender.id, winner: winner.id, events };
}

export function simulateManagerMatch(s, home, away, opts = {}) {
  const stats = {};
  const rounds = [];
  let homeScore = 0, awayScore = 0;
  const maxRounds = 9;
  for (let i = 0; i < maxRounds && homeScore < 5 && awayScore < 5; i++) {
    const r = simulateManagerRound(i, home, away, s, stats);
    rounds.push(r);
    if (r.winner === home.id) homeScore++; else awayScore++;
  }
  const players = Object.values(stats).map((p) => ({ ...p })).sort((a, b) => b.kills - a.kills || b.dmg - a.dmg);
  const mvp = players.slice().sort((a, b) => (b.kills * 2 + b.dmg / 100 + b.plants + b.defuses + b.clutches * 2) - (a.kills * 2 + a.dmg / 100 + a.plants + a.defuses + a.clutches * 2))[0] || null;
  const winner = homeScore >= awayScore ? home.id : away.id;
  return { mapId: opts.mapId || home.homeMap || 'dust2', homeId: home.id, awayId: away.id, score: [homeScore, awayScore], winner, rounds, timeline: rounds.flatMap((r) => r.events.map((e) => ({ ...e, round: r.round }))), players, mvp, totalKills: players.reduce((a, p) => a + p.kills, 0) };
}

export function scoutingNoise(s) {
  return Math.max(2, 5 - (s.team.facilities.scouting || 0));
}

export function makeManagerCandidates(s) {
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const [lo, hi] = rules.ratingRange;
  const all = [];
  for (const team of MAJOR_TEAMS) for (const p of team.players) all.push(p);
  const pool = [];
  const used = new Set(s.team.roster.map((p) => p.name));
  for (const role of ROLES) {
    const cands = all.filter((p) => !used.has(p.name) && (p.role === role || (role === '补枪' && p.role === '步枪')));
    for (let i = 0; i < 2; i++) {
      if (!cands.length) break;
      const idx = Math.floor(rng() * cands.length);
      const src = cands.splice(idx, 1)[0];
      const rating = clamp(randInt(lo - 6, hi + 7), 45, 97);
      const pl = makePlayerFromMajor(src);
      pl.rating = rating;
      pl.potential = clamp(rating + randInt(3, 12), 40, 99);
      pl.price = playerPrice(pl, s.team.league);
      pl.contractYears = 3;
      pl.renewalCost = Math.round(pl.price * 0.12);
      pl.teamOfOrigin = teamIdFromName(src.name);
      pool.push(pl);
    }
  }
  return pool;
}

export function candidates(s) {
  if (!s.team.pool) s.team.pool = makeManagerCandidates(s);
  return s.team.pool;
}

export function scoutedView(p, noise) {
  const v = { ...p, rating: Math.round(p.rating + (rng() * 2 - 1) * noise), potentialStars: Math.round(clamp(p.potential / 20, 1, 5)) };
  return v;
}

export function filterCandidates(pool, filters = {}) {
  return pool.filter((c) =>
    (!filters.role || c.role === filters.role) &&
    (!filters.minRating || c.rating >= filters.minRating) &&
    (!filters.maxPrice || c.price <= filters.maxPrice)
  ).sort((a, b) => (filters.sort === 'price' ? a.price - b.price : filters.sort === 'potential' ? b.potential - a.potential : b.rating - a.rating));
}

export function transferWindowOpen(s) { return s.season.round >= 5 && s.season.round <= 8; }

function addLedger(s, type, amount, label) {
  s.team.ledger.push({ t: Date.now(), seasonId: s.season.id, round: s.season.round, type, amount, label });
  if (s.team.ledger.length > 300) s.team.ledger.splice(0, s.team.ledger.length - 300);
}
function pushNews(s, type, text) {
  s.news.unshift({ t: Date.now(), type, text });
  if (s.news.length > 30) s.news.length = 30;
}
function refreshTeamRating(s) {
  const avg = Math.round(s.team.roster.reduce((a, p) => a + p.rating, 0) / Math.max(1, s.team.roster.length));
  const t = s.season.teams.find((x) => x.id === 'player');
  if (t) t.rating = avg;
  return avg;
}

export function buyPlayer(s, candId) {
  const p = (s.team.pool || []).find((c) => c.id === candId);
  if (!p) return { ok: false, msg: '候选不存在' };
  if (!transferWindowOpen(s)) return { ok: false, msg: '转会窗未开放' };
  if (s.team.transfersLeft <= 0) return { ok: false, msg: '转会次数已用完' };
  if (s.team.bank < p.price) return { ok: false, msg: '资金不足' };
  const sameRole = s.team.roster.find((x) => x.role === p.role);
  const refund = sameRole ? Math.floor(sameRole.price * (LEAGUE_RULES[s.team.league].refundScale || 0.5)) : 0;
  if (sameRole) {
    s.team.roster = s.team.roster.map((x) => (x.id === sameRole.id ? { ...p, id: sameRole.id, form: sameRole.form } : x));
  } else {
    s.team.roster.push({ ...p });
  }
  s.team.bank -= p.price;
  s.team.bank += refund;
  s.team.transfersLeft--;
  s.team.pool = s.team.pool.filter((c) => c.id !== candId);
  s.team.morale = clamp(s.team.morale + 2, 20, 100);
  addLedger(s, 'expense', -p.price, '买入：' + p.name);
  if (refund) addLedger(s, 'income', refund, '卖出：' + sameRole.name);
  pushNews(s, 'info', '签下 ' + p.name + '（' + p.role + '，' + p.rating + ' 评）');
  refreshTeamRating(s);
  save();
  return { ok: true, refund };
}

export function sellPlayer(s, id) {
  const p = s.team.roster.find((x) => x.id === id);
  if (!p) return { ok: false, msg: '选手不存在' };
  if (!transferWindowOpen(s)) return { ok: false, msg: '转会窗未开放' };
  if (s.team.transfersLeft <= 0) return { ok: false, msg: '转会次数已用完' };
  if (s.team.roster.length <= 5) return { ok: false, msg: '阵容不能少于 5 人' };
  const refund = Math.floor(p.price * (LEAGUE_RULES[s.team.league].refundScale || 0.5));
  s.team.roster = s.team.roster.filter((x) => x.id !== id);
  s.team.bank += refund;
  s.team.transfersLeft--;
  s.team.morale = clamp(s.team.morale - 2, 20, 100);
  addLedger(s, 'income', refund, '卖出：' + p.name);
  pushNews(s, 'info', '出售 ' + p.name + '，回款 ' + refund);
  refreshTeamRating(s);
  save();
  return { ok: true, refund };
}

export function sellPreview(s, id) {
  const p = s.team.roster.find((x) => x.id === id);
  if (!p) return null;
  const restAvg = s.team.roster.filter((x) => x.id !== id).reduce((a, x) => a + x.rating, 0) / Math.max(1, s.team.roster.length - 1);
  return { refund: Math.floor(p.price * (LEAGUE_RULES[s.team.league].refundScale || 0.5)), ratingImpact: refreshTeamRating(s) - Math.round(restAvg), roleGap: !s.team.roster.some((x) => x.id !== id && x.role === p.role) };
}

export function renewPlayer(s, id) {
  const p = s.team.roster.find((x) => x.id === id);
  if (!p) return { ok: false, msg: '选手不存在' };
  if (p.contractYears > 1) return { ok: false, msg: '合同未到期' };
  if (s.team.bank < p.renewalCost) return { ok: false, msg: '资金不足' };
  s.team.bank -= p.renewalCost;
  p.contractYears = 3;
  p.renewalCost = Math.round(p.price * 0.12);
  s.team.morale = clamp(s.team.morale + 1, 20, 100);
  addLedger(s, 'expense', -p.renewalCost, '续约：' + p.name);
  pushNews(s, 'info', p.name + ' 续约 3 年');
  save();
  return { ok: true };
}
