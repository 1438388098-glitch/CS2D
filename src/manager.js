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
