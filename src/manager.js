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
