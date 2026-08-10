import { ROUND } from './config.js';
import {registerMode, registerMap} from './registry.js';
import {setupMatchEntities, startRound, startMatch} from './game.js';
import {teamDiffParams, simScore} from './modes.js';
import {DUEL_MAPS} from './duel-maps.js';

const SAVE_KEY = 'cs2d_career';
const BACKUP_KEY = 'cs2d_career_backup';
const VERSION = 3;
const MAP_IDS = ['dust2', 'canal', 'metro', 'forge', 'duel-pit', 'duel-alley', 'duel-forge'];
for (const m of DUEL_MAPS) registerMap({ id: m.id, name: m.name, accent: m.accent, rows: m.rows, mode: 'career' });
const ROLES = ['突破', '补枪', '指挥', '自由人'];
const PLAYER_TEAM = { name: 'Team Spirit', tag: 'SPIRIT' };
const PLAYER_LINEUP = ['sh1ro', 'chopper', 'magixx', 'zont1x']; // 玩家扮演 donk
const CAND_NAMES = ['b1t', 'iM', 'jL', 'w0nderful', 'm0NESY', 'NiKo', 'ZywOo', 'flameZ', 'Spinx', 'torzsi', 'ropz', 'broky', 'rain', 'frozen', 'NAF', 'Twistzz', 'Jame', 'XANTARES', 'KSCERATO', 'FalleN', 'dev1ce', 'stavn', 'EliGE', 'TeSeS'];
const CAND_TEAMS = ['NAVI', 'NAVI', 'NAVI', 'NAVI', 'G2', 'G2', 'VIT', 'VIT', 'VIT', 'MOUZ', 'FAZE', 'FAZE', 'FAZE', 'FAZE', 'TL', 'TL', 'VP', 'EF', 'FUR', 'FUR', 'AST', 'AST', 'COL', 'HRC'];
const TEAM_NAMES = { SPIRIT: 'Team Spirit', NAVI: 'Natus Vincere', G2: 'G2 Esports', FAZE: 'FaZe Clan', VIT: 'Team Vitality', MOUZ: 'MOUZ', AST: 'Astralis', TL: 'Team Liquid', VP: 'Virtus.pro', EF: 'Eternal Fire', FUR: 'FURIA', PAIN: 'paiN Gaming', COL: 'Complexity', HRC: 'Heroic' };
function teamDisplay(tag) { return TEAM_NAMES[tag] || tag; }
const TEAM_ROSTERS = {
  SPIRIT: ['donk', 'sh1ro', 'chopper', 'magixx', 'zont1x'],
  NAVI: ['b1t', 'iM', 'jL', 'Aleksib', 'w0nderful'],
  G2: ['m0NESY', 'huNter-', 'Snax', 'malbsMd', 'heavyGod'],
  FAZE: ['karrigan', 'rain', 'broky', 'frozen', 'ropz'],
  VIT: ['ZywOo', 'flameZ', 'apEX', 'mezii', 'Spinx'],
  MOUZ: ['torzsi', 'Brollan', 'Jimpphat', 'xertioN', 'siuhy'],
  AST: ['dev1ce', 'stavn', 'jabbi', 'cadian', 'Staehr'],
  TL: ['NAF', 'Twistzz', 'ultimate', 'jks', 'YEKINDAR'],
  VP: ['Jame', 'electroNic', 'fame', 'n0rb3r7', 'FL1T'],
  EF: ['XANTARES', 'woxic', 'MAJ3R', 'calyx', 'Wicadia'],
  FUR: ['FalleN', 'KSCERATO', 'yuurih', 'skullz', 'drop'],
  PAIN: ['biguzera', 'kauez', 'nqz', 'snow', 'lux'],
  COL: ['EliGE', 'JT', 'floppy', 'hallzerk', 'Grim'],
  HRC: ['TeSeS', 'sjuush', 'kyxsan', 'NertZ', 'degster']
};
const TEAM_POOL = [
  { name: 'Natus Vincere', tag: 'NAVI' },
  { name: 'G2 Esports', tag: 'G2' },
  { name: 'FaZe Clan', tag: 'FAZE' },
  { name: 'Team Vitality', tag: 'VIT' },
  { name: 'MOUZ', tag: 'MOUZ' },
  { name: 'Astralis', tag: 'AST' },
  { name: 'Team Liquid', tag: 'TL' },
  { name: 'Virtus.pro', tag: 'VP' },
  { name: 'Eternal Fire', tag: 'EF' },
  { name: 'FURIA', tag: 'FUR' },
  { name: 'paiN Gaming', tag: 'PAIN' },
  { name: 'Complexity', tag: 'COL' }
];
const TRAIN_TIERS = [
  { key: 'basic', label: '基础', cost: 500, points: 2, fatigue: 3 },
  { key: 'pro', label: '进阶', cost: 1200, points: 6, fatigue: 6 },
  { key: 'elite', label: '精英', cost: 2500, points: 15, fatigue: 10 }
];
const PRIZE = { 1: 30000, 2: 20000, 3: 15000, 4: 8000, 5: 8000, 6: 8000, 7: 4000, 8: 4000 };
const LEAGUE_RATING = { '甲级': [80, 92], '乙级': [70, 85], '丙级': [60, 74] };
const TITLES = ['新兵', '列兵', '下士', '中士', '上尉', '少校', '上校', '准将', '少将', '中将', '上将', '传奇'];
const LEAGUE_SPONSOR = { '甲级': 5000, '乙级': 3200, '丙级': 2000 };
const SEASON_GOALS = {
  '甲级': { rank: 6, cup: 1, reward: 12000 },
  '乙级': { rank: 2, cup: 1, reward: 10000 },
  '丙级': { rank: 4, cup: 0, reward: 7000 }
};
const ACHIEVEMENTS = [
  { id: 'first_win', title: '首胜', desc: '赢得第一场生涯比赛' },
  { id: 'streak5', title: '五连胜', desc: '创造一次五连胜' },
  { id: 'promotion', title: '升级', desc: '带队升入更高级别联赛' },
  { id: 'cup_champion', title: '杯赛冠军', desc: '拿下淘汰赛冠军' },
  { id: 'rich100k', title: '百万俱乐部', desc: '累计赛季奖金达到 100000' },
  { id: 'veteran', title: '老将', desc: '玩家达到 10 级' }
];

let storage = null;
try { if (typeof globalThis !== 'undefined' && globalThis.localStorage) storage = globalThis.localStorage; } catch (e) { storage = null; }
let rng = Math.random;
let state = null;

export function setRng(fn) { rng = fn || Math.random; }
export function setStorage(s) { storage = s; }
export function isStorageAvailable() { return !!storage; }

function read(key) {
  try { return storage ? storage.getItem(key) : null; } catch (e) { return null; }
}
function write(key, val) {
  try { if (storage) { storage.setItem(key, val); return true; } } catch (e) {}
  return false;
}
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(a, b) { return a + Math.floor(rng() * (b - a + 1)); }
function pickUnique(arr, count) {
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < count && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}
function playerPrice(rating) { return Math.min(rating * 300, 20000); }
function teamAvgRating(roster) {
  if (!roster || !roster.length) return 65;
  return Math.round(roster.reduce((a, p) => a + p.rating, 0) / roster.length);
}
function effectiveRatingFor(roster, attrs) {
  const rosterAvg = teamAvgRating(roster);
  const attrsAvg = (attrs.aim + attrs.move + attrs.react + attrs.nade) / 4;
  return Math.round(rosterAvg * 0.8 + attrsAvg * 0.2);
}
function effectiveTeamRating(s) {
  return effectiveRatingFor(s.team.roster, effectiveAttrs(s)) + formBonus(s) + moraleModifier(s);
}
function refreshPlayerRating(s) {
  const t = s.season.teams.find((x) => x.id === 'player');
  if (t) t.rating = effectiveTeamRating(s);
}

export function rosterContribution(s) {
  const roster = Array.isArray(s.team && s.team.roster) ? s.team.roster : [];
  const attrs = s.player && s.player.attrs ? s.player.attrs : { aim: 0, move: 0, react: 0, nade: 0 };
  const rosterTotal = roster.reduce((a, p) => a + (p.rating || 0), 0);
  const rosterAvg = roster.length ? rosterTotal / roster.length : 0;
  const attrsAvg = (attrs.aim + attrs.move + attrs.react + attrs.nade) / 4;
  const base = Math.round(rosterAvg * 0.8 + attrsAvg * 0.2);
  const members = roster.map((p) => {
    const sharePct = rosterTotal ? Math.round(((p.rating || 0) / rosterTotal) * 100) : 0;
    return {
      ...p,
      delta: Math.round((p.rating || 0) - rosterAvg),
      sharePct,
      weightPct: roster.length ? Math.round(80 / roster.length) : 0
    };
  });
  const playerShare = base && attrsAvg ? Math.round((attrsAvg * 0.2 / base) * 100) : 0;
  return {
    rosterAvg: Math.round(rosterAvg),
    attrsAvg: Math.round(attrsAvg),
    base,
    rating: Math.round(effectiveTeamRating(s)),
    form: formBonus(s),
    morale: moraleModifier(s),
    members,
    player: {
      name: s.player && s.player.name || 'player',
      attrsAvg: Math.round(attrsAvg),
      contribution: Math.round(attrsAvg * 0.2),
      sharePct: playerShare
    }
  };
}

export function positionBalance(s) {
  const roster = Array.isArray(s.team && s.team.roster) ? s.team.roster : [];
  const rosterAvg = teamAvgRating(roster);
  const rows = ROLES.map((role) => {
    const players = roster.filter((p) => p.role === role);
    const count = players.length;
    const total = players.reduce((a, p) => a + (p.rating || 0), 0);
    const avg = count ? Math.round(total / count) : 0;
    const gap = count ? Math.round(rosterAvg - avg) : Math.round(rosterAvg);
    return { role, count, avg, gap, total, players };
  });
  const missing = rows.find((r) => r.count === 0);
  const weakest = [...rows]
    .filter((r) => r.count > 0)
    .sort((a, b) => a.avg - b.avg || a.count - b.count)[0] || null;
  const recommendation = missing || weakest;
  let reason = '阵容位置完整';
  if (missing) reason = '缺少 ' + missing.role + '，建议优先补上该位置';
  else if (weakest) reason = weakest.role + ' 均评 ' + weakest.avg + ' 是全队最低，建议优先补强';
  return {
    rosterAvg,
    rows,
    missingRoles: rows.filter((r) => r.count === 0).map((r) => r.role),
    recommendation,
    reason
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function addLedger(s, type, amount, label) {
  if (!Array.isArray(s.team.ledger)) s.team.ledger = [];
  s.team.ledger.push({ t: Date.now(), round: Number(s.season && s.season.round) || 1, type, amount: Math.round(amount || 0), label });
  if (s.team.ledger.length > 300) s.team.ledger.splice(0, s.team.ledger.length - 300);
}

export function sponsorIncome(s) {
  const league = s && s.team && s.team.league ? s.team.league : '乙级';
  const base = LEAGUE_SPONSOR[league] || LEAGUE_SPONSOR['乙级'];
  const morale = Number(s && s.team && s.team.morale) || 65;
  const rating = Number((s && s.season && s.season.teams && s.season.teams.find((t) => t.id === 'player') || {}).rating) || 65;
  return Math.round(base * (0.7 + morale / 200) * (0.8 + rating / 500));
}

export function sponsorPreview(s) {
  const league = s.team.league;
  const base = LEAGUE_SPONSOR[league] || LEAGUE_SPONSOR['乙级'];
  const morale = Number(s.team.morale) || 65;
  const rating = Number((s.season.teams.find((t) => t.id === 'player') || {}).rating) || 65;
  const totalRounds = Number(s.season.totalRounds) || 14;
  const round = Math.min(totalRounds, Number(s.season.round) || 1);
  const progress = Math.round((round / totalRounds) * 100);
  const remaining = Math.max(0, totalRounds - (s.season.standings.find((x) => x.teamId === 'player') || {}).played || 0);
  const targets = [
    { label: '士气 80', morale: 80, rating },
    { label: '士气 100', morale: 100, rating },
    { label: '评级 80', morale, rating: 80 },
    { label: '评级 90', morale, rating: 90 },
    { label: '评级 95', morale, rating: 95 }
  ].map((t) => ({
    ...t,
    income: Math.round(base * (0.7 + t.morale / 200) * (0.8 + t.rating / 500))
  }));
  const current = sponsorIncome(s);
  const next = targets.filter((t) => t.income > current).sort((a, b) => a.income - b.income)[0] || null;
  const ledger = Array.isArray(s.team.ledger) ? s.team.ledger : [];
  const seasonEarned = ledger.reduce((a, x) => a + (x.type === 'income' && x.label && x.label.includes('赞助') ? (x.amount || 0) : 0), 0);
  return {
    league,
    base,
    morale,
    rating,
    current,
    progress,
    remaining,
    seasonEarned,
    seasonProjection: current * remaining,
    targets,
    next
  };
}

export function cashflowForecast(s) {
  const current = Number(s.team && s.team.bank) || 0;
  const totalRounds = Number(s.season && s.season.totalRounds) || 14;
  const playerStanding = (s.season.standings || []).find((x) => x.teamId === 'player') || { played: 0 };
  const remainingLeague = Math.max(0, totalRounds - Number(playerStanding.played) || 0);
  const sponsor = sponsorIncome(s);
  const expectedSponsor = sponsor * remainingLeague;
  let expectedPrize = 0;
  for (const f of Array.isArray(s.season.fixtures) ? s.season.fixtures : []) {
    if (f.played || (f.home !== 'player' && f.away !== 'player')) continue;
    const oppId = f.home === 'player' ? f.away : f.home;
    const venue = f.home === 'player' ? 'home' : 'away';
    const chance = winChance(s, oppId, venue) / 100;
    expectedPrize += (chance * 1500 + (1 - chance) * 300 + chance * 0.2 * 200);
  }
  if (s.season.cup && s.season.cup.phase === 'active') {
    for (const m of s.season.cup.bracket || []) {
      if (!m.played && (m.a === 'player' || m.b === 'player')) {
        const oppId = m.a === 'player' ? m.b : m.a;
        const chance = winChance(s, oppId, 'home') / 100;
        expectedPrize += chance * 5000;
        if (m.round === 'F') expectedPrize += chance * 30000;
      }
    }
  }
  expectedPrize = Math.round(expectedPrize);
  const projectedBank = Math.round(current + expectedPrize + expectedSponsor);
  const cushion = Math.max(0, projectedBank - 6000);
  return {
    bank: current,
    remainingLeagueMatches: remainingLeague,
    expectedPrize,
    expectedSponsor,
    projectedBank,
    cushion,
    sponsorPerMatch: sponsor,
    safe: projectedBank >= 6000
  };
}

export function seasonBudget(s) {
  const ledger = Array.isArray(s.team && s.team.ledger) ? s.team.ledger : [];
  const bank = Number(s.team && s.team.bank) || 0;
  const income = ledger.reduce((a, x) => a + Math.max(0, x.amount || 0), 0);
  const expense = ledger.reduce((a, x) => a + Math.min(0, x.amount || 0), 0);
  const flow = cashflowForecast(s);
  const budget = 20000 + flow.expectedSponsor + flow.expectedPrize;
  const spent = Math.abs(expense);
  const spendable = Math.max(0, budget - spent);
  const spentPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const warnings = [];
  if (bank < 5000) warnings.push('当前资金低于 5000，优先保留比赛与续约底线');
  if (bank < 1200 && Number(s.team && s.team.trainingLeft) > 0) warnings.push('资金不足完成进阶训练');
  if (bank < 500 && Number(s.team && s.team.trainingLeft) > 0) warnings.push('资金不足完成基础训练');
  if (transferWindowOpen(s) && bank < 10000) warnings.push('转会窗期间预算偏低，建议只做小成本补强');
  return {
    bank,
    budget: Math.round(budget),
    income,
    expense,
    spent,
    spendable,
    spentPct,
    warnings
  };
}

export function financeTrend(s) {
  const ledger = Array.isArray(s.team && s.team.ledger) ? s.team.ledger : [];
  const maxRound = Math.max(1, Number(s.season && s.season.round) || 1);
  const map = new Map();
  for (let r = 1; r <= maxRound; r++) map.set(r, { round: r, income: 0, expense: 0, net: 0 });
  for (const x of ledger) {
    const round = Math.max(1, Math.min(maxRound, Number(x.round) || maxRound));
    const row = map.get(round);
    const amount = Number(x.amount) || 0;
    if (amount >= 0) row.income += amount;
    else row.expense += Math.abs(amount);
    row.net += amount;
  }
  const rows = [...map.values()].map((r) => ({ ...r, income: Math.round(r.income), expense: Math.round(r.expense), net: Math.round(r.net) }));
  const totalIncome = rows.reduce((a, r) => a + r.income, 0);
  const totalExpense = rows.reduce((a, r) => a + r.expense, 0);
  return {
    rows,
    maxIncome: Math.max(1, ...rows.map((r) => r.income)),
    maxExpense: Math.max(1, ...rows.map((r) => r.expense)),
    totalIncome,
    totalExpense,
    totalNet: totalIncome - totalExpense
  };
}

export function remainingPrizePreview(s) {
  const list = sortedStandings(s);
  const rank = list.findIndex((x) => x.teamId === 'player') + 1;
  const currentRankPrize = PRIZE[rank] || 0;
  const pace = seasonPace(s);
  const projectedRank = pace.projectedRank;
  const projectedRankPrize = projectedRank ? (PRIZE[projectedRank] || 0) : currentRankPrize;
  const cash = cashflowForecast(s);
  let expectedCup = 0;
  let maxCup = 0;
  if (s.season.cup && s.season.cup.phase === 'active') {
    for (const m of s.season.cup.bracket || []) {
      if (!m.played && (m.a === 'player' || m.b === 'player')) {
        const oppId = m.a === 'player' ? m.b : m.a;
        const chance = winChance(s, oppId, 'home') / 100;
        const winPrize = m.round === 'F' ? 35000 : 5000;
        expectedCup += chance * winPrize;
        maxCup += winPrize;
      }
    }
  }
  const matchExpected = Math.max(0, cash.expectedPrize - Math.round(expectedCup));
  const rankUpside = Math.max(0, projectedRankPrize - currentRankPrize);
  return {
    rank,
    currentRankPrize,
    projectedRank,
    projectedRankPrize,
    rankUpside,
    matchExpected,
    maxCup,
    expectedCup: Math.round(expectedCup),
    total: Math.round(matchExpected + expectedCup + rankUpside)
  };
}

function currentWinStreak(s) {
  const list = Array.isArray(s.player.form) ? s.player.form : [];
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].win) break;
    n++;
  }
  return n;
}

export function careerForm(s) {
  return (Array.isArray(s.player.form) ? s.player.form : []).slice(-5);
}

export function formBonus(s) {
  const recent = careerForm(s);
  if (!recent.length) return 0;
  let score = 0;
  for (const m of recent) {
    score += (m.win ? 1 : -1) + Math.max(-2, Math.min(2, ((m.kills || 0) - (m.deaths || 0)) / 3));
  }
  return clamp(Math.round(score / Math.max(1, recent.length)), -4, 4);
}

export function fatiguePenalty(s) {
  return Math.min(0.3, (Number(s.player.fatigue) || 0) / 400);
}

function effectiveAttrs(s) {
  const p = fatiguePenalty(s);
  const base = s.player.attrs;
  const out = {};
  for (const k of Object.keys(base)) out[k] = clamp(Math.round(base[k] * (1 - p)), 1, 100);
  return out;
}

function moraleModifier(s) {
  return clamp(Math.round(((Number(s.team.morale) || 65) - 50) / 10), -1, 5);
}

export function careerMorale(s) {
  return clamp(Number(s.team.morale) || 65, 20, 100);
}

export function seasonGoals(s) {
  const def = SEASON_GOALS[s.team.league] || SEASON_GOALS['乙级'];
  const list = sortedStandings(s);
  const rank = list.findIndex((x) => x.teamId === 'player') + 1;
  const cupRound = s.season.cup.phase === 'finished' ? Number(s.season.cupResult) : -1;
  return {
    league: s.team.league,
    rankGoal: def.rank,
    cupGoal: def.cup,
    reward: def.reward,
    currentRank: rank,
    currentCupRound: cupRound,
    achieved: rank <= def.rank && (Number.isFinite(cupRound) ? cupRound >= def.cup : false)
  };
}

export function achievementDefs() {
  return ACHIEVEMENTS.map((a) => ({ ...a }));
}

export function achievements(s) {
  return (Array.isArray(s.player.achievements) ? s.player.achievements : []).slice();
}

export function unlockAchievement(s, id) {
  if (!Array.isArray(s.player.achievements)) s.player.achievements = [];
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def || s.player.achievements.some((a) => a.id === id)) return false;
  s.player.achievements.push({ id: def.id, title: def.title, unlockedAt: Date.now() });
  addNews(s, 'award', '成就解锁：' + def.title);
  save();
  return true;
}

export function careerRecords(s) {
  if (!s.player.records) s.player.records = {};
  return s.player.records;
}

function updateRecords(s, win, kills, bankGain, cupChampion) {
  const rec = careerRecords(s);
  rec.bestKills = Math.max(Number(rec.bestKills) || 0, kills || 0);
  rec.totalPrize = Math.round((Number(rec.totalPrize) || 0) + (bankGain || 0));
  if (win) {
    const streak = currentWinStreak(s);
    rec.longestWinStreak = Math.max(Number(rec.longestWinStreak) || 0, streak);
    if (streak >= 5) unlockAchievement(s, 'streak5');
  }
  if (cupChampion) {
    rec.cupChampions = (Number(rec.cupChampions) || 0) + 1;
    unlockAchievement(s, 'cup_champion');
  }
}

export function migrateCareerState(parsed) {
  if (!parsed.player) parsed.player = {};
  if (!parsed.team) parsed.team = {};
  if (!parsed.season) parsed.season = {};
  parsed.version = VERSION;
  parsed.player.form = Array.isArray(parsed.player.form) ? parsed.player.form : [];
  parsed.player.fatigue = Number.isFinite(Number(parsed.player.fatigue)) ? Number(parsed.player.fatigue) : 0;
  parsed.player.achievements = Array.isArray(parsed.player.achievements) ? parsed.player.achievements : [];
  parsed.player.records = parsed.player.records && typeof parsed.player.records === 'object' ? parsed.player.records : {};
  parsed.team.ledger = Array.isArray(parsed.team.ledger) ? parsed.team.ledger : [];
  parsed.team.morale = Number.isFinite(Number(parsed.team.morale)) ? parsed.team.morale : 65;
  parsed.team.rested = !!parsed.team.rested;
  parsed.team.pool = parsed.team.pool || null;
  parsed.team.trainingLog = Array.isArray(parsed.team.trainingLog) ? parsed.team.trainingLog : [];
  parsed.season.cup = parsed.season.cup || { phase: 'idle', bracket: [] };
  assignFixtureMaps(parsed);
  parsed.matchHistory = Array.isArray(parsed.matchHistory) ? parsed.matchHistory : [];
  return parsed;
}

export function xpNeeded(level) { return level * 500; }
export function titleFor(level) { return TITLES[Math.max(0, Math.min(level - 1, TITLES.length - 1))]; }
export function trainingTiers() { return TRAIN_TIERS.map((t) => ({ ...t })); }
export function trainingHistory(s) {
  const logs = Array.isArray(s && s.team && s.team.trainingLog) ? s.team.trainingLog : [];
  const sorted = [...logs].sort((a, b) => (b.t || 0) - (a.t || 0));
  return {
    logs: sorted,
    recent: sorted.slice(0, 6),
    playerCount: logs.filter((x) => x.type === 'player').length,
    teammateCount: logs.filter((x) => x.type === 'teammate').length,
    totalCount: logs.length,
    totalSpend: logs.reduce((a, x) => a + (Number(x.cost) || 0), 0)
  };
}

export function rosterStatus(s) {
  const roster = Array.isArray(s.team && s.team.roster) ? s.team.roster : [];
  const attrs = s.player && s.player.attrs ? s.player.attrs : { aim: 0, move: 0, react: 0, nade: 0 };
  const attrsAvg = Math.round((attrs.aim + attrs.move + attrs.react + attrs.nade) / 4);
  const morale = careerMorale(s);
  const rows = [{
    id: 'player',
    name: s.player && s.player.name || '玩家',
    type: '玩家',
    rating: attrsAvg,
    ratingLabel: '属性 ' + attrsAvg,
    fatigue: Number(s.player && s.player.fatigue) || 0,
    morale
  }];
  for (const p of roster) {
    rows.push({
      id: p.id,
      name: p.name,
      type: p.role,
      rating: p.rating,
      ratingLabel: '评级 ' + p.rating,
      fatigue: Number(p.fatigue) || 0,
      morale
    });
  }
  return {
    rows,
    rosterAvg: teamAvgRating(roster),
    attrsAvg,
    morale,
    fatigue: Number(s.player && s.player.fatigue) || 0
  };
}

export function careerMapPool() { return MAP_IDS.slice(); }

function makeRoster() {
  return ROLES.map((role, i) => {
    const rating = randInt(60, 75);
    const price = playerPrice(rating);
    return { id: 'r' + (i + 1), name: PLAYER_LINEUP[i], team: PLAYER_TEAM.name, role, rating, price, costBasis: price, contractYears: 2 + (i % 2), renewalCost: Math.round(rating * 45) };
  });
}

function makeTeams(league, playerRating) {
  const [lo, hi] = LEAGUE_RATING[league] || LEAGUE_RATING['乙级'];
  const names = pickUnique(TEAM_POOL, 7);
  const teams = [{ id: 'player', name: PLAYER_TEAM.name, tag: PLAYER_TEAM.tag, rating: playerRating, homeMap: pick(MAP_IDS) }];
  for (let i = 0; i < 7; i++) {
    teams.push({ id: 't' + (i + 1), name: names[i].name, tag: names[i].tag, rating: randInt(lo, hi), homeMap: pick(MAP_IDS) });
  }
  return teams;
}

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
    for (const [home, away] of pairs) {
      fixtures.push({ round: ri + 1, home, away, score: null, played: false, winner: null });
    }
  });
  return fixtures;
}

export function fixtureMapFor(s, f) {
  if (!f) return null;
  if (f.mapId) return f.mapId;
  const home = s && Array.isArray(s.season && s.season.teams) ? s.season.teams.find((t) => t.id === f.home) : null;
  return home ? home.homeMap : null;
}

export function assignFixtureMaps(s) {
  if (!s || !Array.isArray(s.season && s.season.fixtures) || !Array.isArray(s.season && s.season.teams)) return;
  for (const f of s.season.fixtures) {
    if (!f.mapId) f.mapId = fixtureMapFor(s, f);
  }
}

function makeStandings(teams) {
  return teams.map((t) => ({ teamId: t.id, played: 0, w: 0, d: 0, l: 0, pts: 0 }));
}

function makeCup(teams, standings) {
  const table = standings ? [...standings].sort((a, b) => b.pts - a.pts || b.w - a.w) : [...teams].sort((a, b) => b.rating - a.rating);
  const ids = table.map((x) => x.teamId);
  const qf = [[ids[0], ids[7]], [ids[3], ids[4]], [ids[2], ids[5]], [ids[1], ids[6]]];
  const bracket = qf.map(([a, b]) => ({ round: 'QF', a, b, score: null, played: false, winner: null }));
  bracket.push({ round: 'SF', a: null, b: null, score: null, played: false, winner: null });
  bracket.push({ round: 'SF', a: null, b: null, score: null, played: false, winner: null });
  bracket.push({ round: 'F', a: null, b: null, score: null, played: false, winner: null });
  return { phase: 'active', bracket };
}

function refreshCup(s) {
  const b = s.season.cup.bracket;
  if (b[0].played && b[1].played) { b[4].a = b[0].winner; b[4].b = b[1].winner; }
  if (b[2].played && b[3].played) { b[5].a = b[2].winner; b[5].b = b[3].winner; }
  if (b[4].played && b[5].played) { b[6].a = b[4].winner; b[6].b = b[5].winner; }
  if (b[6].played) {
    s.season.cup.phase = 'finished';
    s.season.cup.champion = b[6].winner;
  }
}

function makeCandidates() {
  // 名字与所属队伍必须同源配对：随机抽取 CAND_NAMES 的索引，再同时取名字与队伍
  const idxPool = CAND_NAMES.map((_, i) => i);
  const picks = pickUnique(idxPool, 8);
  const out = [];
  ROLES.forEach((role, ri) => {
    for (let j = 0; j < 2; j++) {
      const idx = ri * 2 + j;
      const pi = picks[idx];
      const rating = randInt(55, 85);
      const potential = Math.min(96, rating + randInt(3, 12));
      out.push({ id: 'c' + (idx + 1), name: CAND_NAMES[pi], team: teamDisplay(CAND_TEAMS[pi]), role, rating, price: playerPrice(rating), potential, youth: rng() < 0.35 });
    }
  });
  return out;
}

function addNews(s, type, text) {
  s.news.unshift({ t: Date.now(), type, text });
  if (s.news.length > 20) s.news.length = 20;
}

export function save() {
  if (!state) return false;
  return write(SAVE_KEY, JSON.stringify(state));
}

export function newCareerState() {
  const roster = makeRoster();
  const playerRating = effectiveRatingFor(roster, { aim: 50, move: 50, react: 50, nade: 40 });
  const teams = makeTeams('乙级', playerRating);
  const state = {
    version: VERSION,
    player: {
      name: 'donk', level: 1, xp: 0,
      attrs: { aim: 50, move: 50, react: 50, nade: 40 },
      seasonStats: { played: 0, w: 0, d: 0, l: 0, kills: 0, deaths: 0, mvp: 0 },
      form: [],
      fatigue: 0,
      achievements: [],
      records: {}
    },
    team: {
      name: PLAYER_TEAM.name, league: '乙级', bank: 12000,
      roster, trainingLeft: 2, transfersLeft: 2, transferWindow: false, pool: null,
      ledger: [], trainingLog: [], morale: 65, rested: false
    },
    season: {
      id: 1, round: 1, totalRounds: 14,
      teams, fixtures: makeFixtures(teams.map((t) => t.id)), standings: makeStandings(teams),
      cup: { phase: 'idle', bracket: [] }
    },
    history: [],
    matchHistory: [],
    news: []
  };
  assignFixtureMaps(state);
  return state;
}

export function loadCareer() {
  if (state) return state;
  const raw = read(SAVE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.version === VERSION || parsed.version === 2) && parsed.season && parsed.team && parsed.player) {
        state = migrateCareerState(parsed);
        save();
        return state;
      }
    } catch (e) { /* fallthrough */ }
    write(BACKUP_KEY, raw);
  }
  state = newCareerState();
  save();
  return state;
}

export function getState() { return state || loadCareer(); }
export function __clearStateForTest() { state = null; }
export function resetCareer() {
  state = newCareerState();
  save();
  return state;
}
export function candidates() {
  const s = getState();
  if (!s.team.pool) {
    s.team.pool = makeCandidates();
    save();
  }
  return s.team.pool;
}

export function candidateProfile(c) {
  if (!c) return null;
  const rating = Number(c.rating) || 70;
  const potential = Number.isFinite(Number(c.potential)) ? Number(c.potential) : Math.min(96, rating + 5);
  return {
    ...c,
    potential,
    youth: !!c.youth,
    growth: potential - rating
  };
}

export function filterCandidates(pool, filters = {}) {
  const source = Array.isArray(pool) ? pool : [];
  const role = filters.role || '';
  const minRating = Number.isFinite(Number(filters.minRating)) ? Number(filters.minRating) : 0;
  const maxPrice = Number.isFinite(Number(filters.maxPrice)) ? Number(filters.maxPrice) : 30000;
  const sortBy = filters.sortBy || 'rating';
  const sortDir = filters.sortDir === 'asc' ? 1 : -1;
  const list = source.filter((c) =>
    (!role || c.role === role) &&
    (c.rating || 0) >= minRating &&
    (c.price || 0) <= maxPrice
  ).sort((a, b) => {
    const av = sortBy === 'potential'
      ? (Number.isFinite(Number(a.potential)) ? Number(a.potential) : Math.min(96, (Number(a.rating) || 70) + 5))
      : (Number(a[sortBy]) || 0);
    const bv = sortBy === 'potential'
      ? (Number.isFinite(Number(b.potential)) ? Number(b.potential) : Math.min(96, (Number(b.rating) || 70) + 5))
      : (Number(b[sortBy]) || 0);
    return (av - bv) * sortDir;
  });
  return {
    list,
    total: source.length,
    shown: list.length,
    filters: { role, minRating, maxPrice, sortBy, sortDir }
  };
}

export function transferWindowOpen(s) { return s.season.round >= 5 && s.season.round <= 8; }

export function transferWindowInfo(s) {
  const round = Number(s.season.round) || 1;
  const open = transferWindowOpen(s);
  const opensIn = open ? 0 : Math.max(0, 5 - round);
  const closesIn = open ? Math.max(0, 8 - round) : 0;
  let text;
  if (open) text = closesIn === 0 ? '转会窗本轮结束' : '转会窗开放 · 剩余 ' + closesIn + ' 轮';
  else if (round < 5) text = '还有 ' + opensIn + ' 轮开窗';
  else text = '本赛季转会窗已关闭';
  return {
    open,
    round,
    opensRound: 5,
    closesRound: 8,
    opensIn,
    closesIn,
    remaining: Number(s.team.transfersLeft) || 0,
    text
  };
}

export function transferBudget(s) {
  const pool = Array.isArray(s.team && s.team.pool) ? s.team.pool : (transferWindowOpen(s) ? candidates() : []);
  const bank = Number(s.team && s.team.bank) || 0;
  const affordable = pool
    .filter((c) => c && c.price <= bank)
    .sort((a, b) => b.rating - a.rating || a.price - b.price);
  const best = affordable[0] || null;
  return {
    bank,
    total: pool.length,
    affordable: affordable.length,
    maxAffordableRating: affordable.length ? affordable[0].rating : null,
    best,
    afterBestBuy: best ? Math.max(0, bank - best.price) : bank
  };
}

export function contractStatus(s) {
  const list = Array.isArray(s.team && s.team.roster) ? s.team.roster : [];
  return list.map((p) => {
    const years = Number.isInteger(p.contractYears) ? p.contractYears : 3;
    const renewalCost = Number.isFinite(Number(p.renewalCost)) ? Number(p.renewalCost) : Math.round((Number(p.price) || 0) * 0.12);
    return {
      ...p,
      yearsLeft: years,
      renewalCost,
      expiring: years <= 1
    };
  });
}

export function renewPlayer(id) {
  const s = getState();
  const p = s.team.roster.find((x) => x.id === id);
  if (!p) return { ok: false, error: '队友不存在' };
  const years = Number.isInteger(p.contractYears) ? p.contractYears : 3;
  if (years > 1) return { ok: false, error: '合同尚未到期' };
  const renewalCost = Number.isFinite(Number(p.renewalCost)) ? Number(p.renewalCost) : Math.round((Number(p.price) || 0) * 0.12);
  if (s.team.bank < renewalCost) return { ok: false, error: '资金不足' };
  s.team.bank -= renewalCost;
  p.contractYears = 3;
  p.renewalCost = Math.round((Number(p.price) || 0) * 0.12);
  s.team.morale = clamp(Number(s.team.morale) + 1, 20, 100);
  addLedger(s, 'expense', -renewalCost, '续约：' + p.name);
  addNews(s, 'info', '续约完成：' + p.name + ' 3 年');
  save();
  return { ok: true, cost: renewalCost };
}

export function train(attr, tierKey) {
  const s = getState();
  const tier = TRAIN_TIERS.find((t) => t.key === tierKey);
  if (!tier) return { ok: false, error: '训练档位不存在' };
  if (!(attr in s.player.attrs)) return { ok: false, error: '属性不存在' };
  if (s.player.attrs[attr] >= 100) return { ok: false, error: '属性已满' };
  if (s.team.trainingLeft <= 0) return { ok: false, error: '本轮训练次数已用完' };
  if (s.team.bank < tier.cost) return { ok: false, error: '资金不足' };
  s.team.bank -= tier.cost;
  s.player.attrs[attr] = Math.min(100, s.player.attrs[attr] + tier.points);
  s.player.fatigue = clamp(Number(s.player.fatigue) + (tier.fatigue || 3), 0, 100);
  s.team.trainingLeft--;
  refreshPlayerRating(s);
  addLedger(s, 'expense', -tier.cost, '训练：' + attr);
  if (!Array.isArray(s.team.trainingLog)) s.team.trainingLog = [];
  s.team.trainingLog.push({ t: Date.now(), type: 'player', attr, tierKey: tier.key, label: tier.label, cost: tier.cost, gained: tier.points });
  addNews(s, 'info', '训练完成：' + attr + ' +' + tier.points);
  save();
  return { ok: true };
}

export function trainingPreview(s, attr, tierKey) {
  const tier = TRAIN_TIERS.find((t) => t.key === tierKey);
  if (!tier || !s || !s.player || !s.player.attrs || !(attr in s.player.attrs)) return null;
  const before = Number(s.player.attrs[attr]) || 0;
  const after = Math.min(100, before + tier.points);
  const fatigueAfter = Math.min(100, (Number(s.player.fatigue) || 0) + (tier.fatigue || 3));
  return {
    attr,
    tierKey,
    label: tier.label,
    cost: tier.cost,
    before,
    after,
    gained: after - before,
    fatigueAfter,
    fatigueGain: fatigueAfter - (Number(s.player.fatigue) || 0),
    affordable: Number(s.team && s.team.bank) >= tier.cost,
    trainingLeft: Number(s.team && s.team.trainingLeft) || 0,
    blocked: before >= 100
  };
}

export function trainingSuggestion(s) {
  const attrs = s.player.attrs || {};
  const tiers = trainingTiers();
  const options = [];
  for (const attr of Object.keys(attrs)) {
    for (const tier of tiers) {
      const pre = trainingPreview(s, attr, tier.key);
      if (!pre || pre.blocked || pre.gained <= 0 || !pre.affordable || pre.trainingLeft <= 0) continue;
      options.push({
        attr,
        tierKey: tier.key,
        label: tier.label,
        cost: pre.cost,
        gained: pre.gained,
        fatigueGain: pre.fatigueGain,
        value: pre.before,
        score: pre.gained / Math.max(1, pre.cost + pre.fatigueGain * 120)
      });
    }
  }
  options.sort((a, b) => b.score - a.score || a.value - b.value || a.cost - b.cost || a.fatigueGain - b.fatigueGain);
  return {
    suggestion: options[0] || null,
    options: options.slice(0, 3),
    bank: Number(s.team.bank) || 0,
    fatigue: Number(s.player.fatigue) || 0,
    trainingLeft: Number(s.team.trainingLeft) || 0
  };
}

export function rotationAdvice(s) {
  const fatigue = Number(s.player.fatigue) || 0;
  const rested = !!s.team.rested;
  const info = nextMatchInfo(s);
  const importance = info ? info.importance : '';
  const important = /关键|争冠|保级|杯赛/.test(importance);
  let advice = '正常训练';
  let reason = '疲劳可控，优先补弱项';
  let shouldRest = false;
  if (fatigue >= 80) {
    advice = '必须休息';
    reason = '高疲劳会明显削弱下一场属性';
    shouldRest = true;
  } else if (fatigue >= 50 || (fatigue >= 30 && important)) {
    advice = '建议休息';
    reason = '下一场重要，疲劳已影响状态';
    shouldRest = true;
  } else if (rested) {
    advice = '已休息';
    reason = '本轮恢复机会已使用';
  }
  return {
    fatigue,
    rested,
    importance,
    important,
    advice,
    reason,
    shouldRest
  };
}

export function restPlayer() {
  const s = getState();
  if (s.team.rested) return { ok: false, error: '本轮已经休息过' };
  s.player.fatigue = 0;
  s.team.rested = true;
  addLedger(s, 'expense', 0, '休息恢复');
  addNews(s, 'info', '休息完成，疲劳清零');
  save();
  return { ok: true };
}

// 队友训练：消耗训练次数与资金提升队友 rating（1 档点 ≈ 1 rating），赛季成长可持续
export function trainTeammate(id, tierKey) {
  const s = getState();
  const tier = TRAIN_TIERS.find((t) => t.key === tierKey);
  if (!tier) return { ok: false, error: '训练档位不存在' };
  const p = s.team.roster.find((x) => x.id === id);
  if (!p) return { ok: false, error: '队友不存在' };
  if (s.team.trainingLeft <= 0) return { ok: false, error: '本轮训练次数已用完' };
  if (s.team.bank < tier.cost) return { ok: false, error: '资金不足' };
  if (p.rating >= 97) return { ok: false, error: '该队友已接近上限' };
  s.team.bank -= tier.cost;
  p.rating = Math.min(97, p.rating + tier.points);
  s.team.trainingLeft--;
  refreshPlayerRating(s);
  addLedger(s, 'expense', -tier.cost, '训练：' + p.name);
  if (!Array.isArray(s.team.trainingLog)) s.team.trainingLog = [];
  s.team.trainingLog.push({ t: Date.now(), type: 'teammate', target: p.name, role: p.role, tierKey: tier.key, label: tier.label, cost: tier.cost, gained: tier.points });
  addNews(s, 'info', '训练完成：' + p.name + ' rating +' + tier.points);
  save();
  return { ok: true };
}

export function sellPlayer(id) {
  const s = getState();
  if (!transferWindowOpen(s)) return { ok: false, error: '转会窗未开放' };
  if (s.team.transfersLeft <= 0) return { ok: false, error: '转会次数已用完' };
  const idx = s.team.roster.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, error: '队友不存在' };
  const p = s.team.roster[idx];
  const preview = sellPreview(s, id);
  const refund = preview ? preview.refund : Math.floor(p.price * 0.5);
  s.team.bank += refund;
  s.team.roster.splice(idx, 1);
  s.team.transfersLeft--;
  s.team.morale = clamp(Number(s.team.morale) - 2, 20, 100);
  refreshPlayerRating(s);
  addLedger(s, 'income', refund, '卖出：' + p.name);
  addNews(s, 'info', '卖出 ' + p.name + '，返还 ' + refund);
  save();
  return { ok: true, refund };
}

export function sellPreview(s, id) {
  const p = Array.isArray(s.team && s.team.roster) ? s.team.roster.find((x) => x.id === id) : null;
  if (!p) return null;
  const roster = Array.isArray(s.team.roster) ? s.team.roster : [];
  const afterRoster = roster.filter((x) => x.id !== id);
  const attrs = s.player && s.player.attrs ? s.player.attrs : { aim: 0, move: 0, react: 0, nade: 0 };
  const ratingBefore = Math.round(effectiveRatingFor(roster, attrs) + formBonus(s) + moraleModifier(s));
  const ratingAfter = Math.round(effectiveRatingFor(afterRoster, attrs) + formBonus(s) + moraleModifier(s));
  const costBasis = Number.isFinite(Number(p.costBasis)) ? Number(p.costBasis) : Number(p.price) || 0;
  const refund = Math.floor((Number(p.price) || 0) * 0.5);
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    price: Number(p.price) || 0,
    costBasis,
    refund,
    valueDelta: refund - costBasis,
    ratingBefore,
    ratingAfter,
    ratingImpact: ratingAfter - ratingBefore,
    roleCountAfter: afterRoster.filter((x) => x.role === p.role).length
  };
}

export function buyPlayer(candId) {
  const s = getState();
  if (!transferWindowOpen(s)) return { ok: false, error: '转会窗未开放' };
  if (s.team.transfersLeft <= 0) return { ok: false, error: '转会次数已用完' };
  candidates();
  const cand = s.team.pool.find((c) => c.id === candId);
  if (!cand) return { ok: false, error: '候选不存在' };
  if (s.team.bank < cand.price) return { ok: false, error: '资金不足' };
  const profile = candidateProfile(cand);
  let refund = 0;
  let slot = s.team.roster.find((p) => p.role === cand.role && p.id !== cand.id);
  if (slot) {
    const oldPreview = sellPreview(s, slot.id);
    refund = oldPreview ? oldPreview.refund : Math.floor(slot.price * 0.5);
    s.team.bank += refund;
    slot.name = cand.name; slot.team = cand.team || s.team.name; slot.rating = cand.rating; slot.price = cand.price; slot.costBasis = cand.price; slot.potential = profile.potential; slot.youth = profile.youth; slot.contractYears = 3; slot.renewalCost = Math.round(cand.price * 0.12);
  } else {
    s.team.roster.push({ id: 'r' + Date.now(), name: cand.name, team: cand.team || s.team.name, role: cand.role, rating: cand.rating, price: cand.price, costBasis: cand.price, potential: profile.potential, youth: profile.youth, contractYears: 3, renewalCost: Math.round(cand.price * 0.12) });
  }
  s.team.bank -= cand.price;
  s.team.transfersLeft--;
  s.team.morale = clamp(Number(s.team.morale) + 2, 20, 100);
  s.team.pool = s.team.pool.filter((c) => c.id !== candId);
  refreshPlayerRating(s);
  addLedger(s, 'expense', -cand.price, '买入：' + cand.name);
  addNews(s, 'info', '买入 ' + cand.name + '（' + cand.role + '）' + (refund ? '，替换返还 ' + refund : ''));
  save();
  return { ok: true, refund };
}

export function findPlayerFixture(s) {
  return s.season.fixtures.find((f) => f.round === s.season.round && !f.played && (f.home === 'player' || f.away === 'player'));
}
export function fixtureMatchRecord(s, f) {
  if (!s || !f || !Array.isArray(s.matchHistory)) return null;
  const opp = f.home === 'player' ? f.away : f.home;
  const rows = s.matchHistory.filter((m) => m && !m.isCup && m.seasonId === s.season.id && m.oppId === opp);
  return rows.find((m) => m.round == null || Number(m.round) === Number(f.round)) || rows[rows.length - 1] || null;
}
export function findCupMatch(s) {
  const b = s.season.cup.bracket;
  return b.find((m) => !m.played && (m.a === 'player' || m.b === 'player'));
}
function currentMatch(s, isCup) {
  return isCup ? findCupMatch(s) : findPlayerFixture(s);
}
function matchOpponent(m, isCup) {
  if (!m) return null;
  return isCup ? (m.a === 'player' ? m.b : m.a) : (m.home === 'player' ? m.away : m.home);
}
export function nextMatch(s) {
  if (s.season.cup.phase === 'active') return findCupMatch(s);
  return findPlayerFixture(s);
}

export function teamRecentForm(s, teamId, max = 5) {
  const out = [];
  const add = (f, team, winner) => {
    if (team !== teamId || !winner) return;
    out.push(winner === team ? 'W' : 'L');
  };
  for (const f of Array.isArray(s.season && s.season.fixtures) ? s.season.fixtures : []) {
    if (!f.played) continue;
    add(f, f.home, f.winner);
    add(f, f.away, f.winner);
  }
  const bracket = s.season && s.season.cup && Array.isArray(s.season.cup.bracket) ? s.season.cup.bracket : [];
  for (const m of bracket) {
    if (!m.played || !m.a || !m.b || !m.winner) continue;
    add(m, m.a, m.winner);
    add(m, m.b, m.winner);
  }
  return out.slice(-Math.max(1, Number(max) || 5)).join('');
}

export function opponentStanding(s, teamId) {
  const list = sortedStandings(s);
  const idx = list.findIndex((x) => x.teamId === teamId);
  return idx < 0 ? null : idx + 1;
}

export function scoutReport(s, oppId) {
  const opp = s.season.teams.find((x) => x.id === oppId);
  if (!opp) return null;
  const recent = (Array.isArray(s.matchHistory) ? s.matchHistory : []).filter((m) => m && m.oppId === oppId).slice(-5);
  const avgKills = recent.length
    ? round2(recent.reduce((a, m) => a + (m.kills || 0), 0) / recent.length)
    : Math.max(5, Math.round((opp.rating - 60) * 0.35 + 8));
  const avgDeaths = recent.length
    ? round2(recent.reduce((a, m) => a + (m.deaths || 0), 0) / recent.length)
    : Math.max(4, Math.round(avgKills * 0.85));
  const mapWins = {};
  for (const f of Array.isArray(s.season.fixtures) ? s.season.fixtures : []) {
    if (!f.played || f.winner !== oppId) continue;
    const mapId = fixtureMapFor(s, f);
    if (mapId) mapWins[mapId] = (mapWins[mapId] || 0) + 1;
  }
  for (const m of Array.isArray(s.season.cup && s.season.cup.bracket) ? s.season.cup.bracket : []) {
    if (!m.played || m.winner !== oppId) continue;
    const mapId = cupMapForRound(m.round);
    if (mapId) mapWins[mapId] = (mapWins[mapId] || 0) + 1;
  }
  const bestMap = Object.entries(mapWins).sort((a, b) => b[1] - a[1])[0] ? Object.entries(mapWins).sort((a, b) => b[1] - a[1])[0][0] : opp.homeMap;
  return {
    oppId,
    name: opp.name,
    rating: opp.rating,
    rank: opponentStanding(s, oppId),
    points: (s.season.standings.find((x) => x.teamId === oppId) || {}).pts || 0,
    form: teamRecentForm(s, oppId),
    avgKills,
    avgDeaths,
    homeMap: opp.homeMap,
    bestMap
  };
}

export function winChance(s, oppId, venue = 'home') {
  const opp = s.season.teams.find((x) => x.id === oppId);
  if (!opp) return 50;
  const playerRating = effectiveTeamRating(s) + (venue === 'home' ? 2 : 0);
  const diff = playerRating - opp.rating;
  return clamp(Math.round(50 + diff * 2.5), 5, 95);
}

export function matchImportance(s, match) {
  if (!match) return '普通战';
  if (s.season.cup.phase === 'active') return '杯赛';
  const list = sortedStandings(s);
  const playerRow = list.find((x) => x.teamId === 'player');
  const oppRow = list.find((x) => x.teamId === (match.home === 'player' ? match.away : match.home));
  if (!playerRow || !oppRow) return '普通战';
  const playerRank = list.indexOf(playerRow) + 1;
  const oppRank = list.indexOf(oppRow) + 1;
  const gap = Math.abs(playerRow.pts - oppRow.pts);
  const late = s.season.round >= s.season.totalRounds - 3;
  const titleRelevant = playerRank <= 2 || oppRank <= 2;
  const relegRelevant = s.team.league !== '丙级' && (playerRank >= 7 || oppRank >= 7);
  if (late && titleRelevant && gap <= 6) return '争冠战';
  if (late && relegRelevant && gap <= 6) return '保级战';
  if (gap <= 3 && (late || playerRank <= 4 || oppRank <= 4 || playerRank >= 6 || oppRank >= 6)) return '关键战';
  return '普通战';
}

export function nextMatchInfo(s) {
  const nm = nextMatch(s);
  if (!nm) return null;
  const isCup = s.season.cup.phase === 'active';
  const oppId = isCup ? (nm.a === 'player' ? nm.b : nm.a) : (nm.home === 'player' ? nm.away : nm.home);
  const venue = isCup ? 'home' : (nm.home === 'player' ? 'home' : 'away');
  const opp = s.season.teams.find((x) => x.id === oppId);
  const playerTeam = s.season.teams.find((x) => x.id === 'player');
  const ratingDiff = opp && playerTeam ? opp.rating - playerTeam.rating : 0;
  const threat = ratingDiff > 10 ? '强敌' : (ratingDiff < -10 ? '弱旅' : '势均力敌');
  return {
    oppId,
    oppName: opp ? opp.name : oppId,
    venue,
    isCup,
    mapId: isCup ? cupMap(s) : fixtureMapFor(s, nm),
    rating: opp ? opp.rating : null,
    rank: opponentStanding(s, oppId),
    form: teamRecentForm(s, oppId),
    ratingDiff,
    threat,
    importance: matchImportance(s, nm),
    scout: scoutReport(s, oppId),
    winChance: winChance(s, oppId, venue)
  };
}

export function matchReadiness(s) {
  const rawAttrs = { ...s.player.attrs };
  const effectiveAttrsCopy = effectiveAttrs(s);
  const rosterAvg = teamAvgRating(s.team.roster);
  const rawAvg = (rawAttrs.aim + rawAttrs.move + rawAttrs.react + rawAttrs.nade) / 4;
  const effAvg = (effectiveAttrsCopy.aim + effectiveAttrsCopy.move + effectiveAttrsCopy.react + effectiveAttrsCopy.nade) / 4;
  const base = Math.round(rosterAvg * 0.8 + effAvg * 0.2);
  const form = formBonus(s);
  const morale = moraleModifier(s);
  const final = Math.round(effectiveTeamRating(s));
  const info = nextMatchInfo(s);
  return {
    rawAttrs,
    effectiveAttrs: effectiveAttrsCopy,
    rawAvg: Math.round(rawAvg),
    effectiveAvg: Math.round(effAvg),
    fatiguePct: Math.round(fatiguePenalty(s) * 100),
    form,
    morale,
    base,
    final,
    netAdjust: final - base,
    next: info ? {
      oppId: info.oppId,
      oppName: info.oppName,
      oppRating: info.rating,
      winChance: info.winChance,
      venue: info.venue
    } : null
  };
}

export function cupMapForRound(round) {
  const order = { QF: 0, SF: 1, F: 2 };
  return MAP_IDS[order[round] != null ? order[round] : 0];
}

export function cupPrizeInfo() {
  return {
    perRound: 5000,
    champion: 30000,
    rounds: [
      { key: 'QF', label: '八强', prize: 5000, map: cupMapForRound('QF') },
      { key: 'SF', label: '四强', prize: 5000, map: cupMapForRound('SF') },
      { key: 'F', label: '决赛', prize: 35000, map: cupMapForRound('F') }
    ]
  };
}

export function cupPreview(s) {
  const b = s.season && s.season.cup && Array.isArray(s.season.cup.bracket) ? s.season.cup.bracket : [];
  return b.map((m) => ({
    round: m.round,
    roundName: cupMapForRound(m.round) ? (m.round === 'QF' ? '八强' : m.round === 'SF' ? '四强' : '决赛') : m.round,
    a: m.a,
    b: m.b,
    map: cupMapForRound(m.round),
    prize: m.round === 'F' ? 35000 : 5000,
    played: !!m.played,
    winner: m.winner || null,
    score: m.score || null
  }));
}

export function cupMap(s) {
  // 杯赛地图按轮次固定：八强 dust2、四强 canal、决赛 metro（避免连续场次重复地图）
  const m = findCupMatch(s);
  return cupMapForRound(m && m.round);
}

function gainXp(s, amount) {
  s.player.xp += amount;
  while (s.player.level < TITLES.length && s.player.xp >= xpNeeded(s.player.level)) {
    s.player.xp -= xpNeeded(s.player.level);
    s.player.level++;
  }
}

function markFixture(s, f, score, winner) {
  f.played = true;
  f.score = score;
  f.winner = winner;
  const home = s.season.standings.find((x) => x.teamId === f.home);
  const away = s.season.standings.find((x) => x.teamId === f.away);
  home.played++; away.played++;
  // 积分判定以 winner 为准（比分方向在客场/模拟路径可能不同，score 仅作显示）
  if (winner === f.home) { home.w++; away.l++; home.pts += 3; }
  else { away.w++; home.l++; away.pts += 3; }
}

function simulateLeagueRound(s) {
  const fixtures = s.season.fixtures.filter((f) => f.round === s.season.round && !f.played);
  for (const f of fixtures) {
    if (f.home === 'player' || f.away === 'player') continue;
    const home = s.season.teams.find((t) => t.id === f.home);
    const away = s.season.teams.find((t) => t.id === f.away);
    const r = simScore(home, away);
    markFixture(s, f, r.score, r.winner.id);
  }
  const left = s.season.fixtures.filter((f) => f.round === s.season.round && !f.played);
  if (!left.length) {
    if (s.season.round < s.season.totalRounds) {
      s.season.round++;
    } else if (s.season.cup.phase === 'idle') {
      refreshPlayerRating(s);
      s.season.cup = makeCup(s.season.teams, s.season.standings);
    }
  }
}

function markCupMatch(s, m, score, win) {
  m.played = true;
  m.score = score;
  m.winner = win ? 'player' : (m.a === 'player' ? m.b : m.a);
  if (!win) {
    s.season.cupResult = m.round === 'QF' ? 0 : (m.round === 'SF' ? 1 : 2);
  }
  refreshCup(s);
  if (s.season.cup.champion === 'player') s.season.cupResult = 3;
}

function simulateRemainingCup(s) {
  const b = s.season.cup.bracket;
  for (let guard = 0; guard < 10; guard++) {
    const m = b.find((x) => !x.played && x.a && x.b && x.a !== 'player' && x.b !== 'player');
    if (!m) break;
    const home = s.season.teams.find((x) => x.id === m.a);
    const away = s.season.teams.find((x) => x.id === m.b);
    const r = simScore(home, away);
    m.played = true;
    m.score = r.score;
    m.winner = r.winner.id;
    refreshCup(s);
  }
}

export function applyPlayerResult(s, r) {
  const { win, kills, deaths, mvp, score, isCup, noReward } = r;
  const match = currentMatch(s, !!isCup);
  const opp = matchOpponent(match, !!isCup);
  const oppTeam = opp ? s.season.teams.find((x) => x.id === opp) : null;
  const matchMapId = isCup ? cupMap(s) : fixtureMapFor(s, match);
  const matchImportanceLabel = isCup ? '杯赛' : matchImportance(s, match);
  const preMatchRating = Math.round(effectiveTeamRating(s));
  s.player.seasonStats.played++;
  if (win) s.player.seasonStats.w++; else s.player.seasonStats.l++;
  s.player.seasonStats.kills += kills;
  s.player.seasonStats.deaths += deaths;
  if (mvp) s.player.seasonStats.mvp++;
  if (!Array.isArray(s.player.form)) s.player.form = [];
  s.player.form.push({ win: !!win, kills: kills || 0, deaths: deaths || 0 });
  if (s.player.form.length > 5) s.player.form.splice(0, s.player.form.length - 5);
  s.player.fatigue = clamp(Number(s.player.fatigue) + (isCup ? 10 : 6) + (win ? 0 : 2), 0, 100);
  s.team.morale = clamp(Number(s.team.morale) + (win ? 4 : -3) + (mvp ? 2 : 0) + (isCup && win ? 3 : 0), 20, 100);
  s.team.rested = false;
  refreshPlayerRating(s);
  let bankGain = 0;
  if (!noReward) {
    bankGain = (win ? 1500 : 300) + (mvp ? 200 : 0);
    gainXp(s, (win ? 300 : 50) + kills * 10 + (mvp ? 100 : 0));
  }
  if (isCup) {
    const m = findCupMatch(s);
    if (m) {
      const cupWin = win;
      markCupMatch(s, m, score, cupWin);
      simulateRemainingCup(s);
      if (cupWin && !noReward) {
        bankGain += 5000;
        s.season.cupPrizeEarned = (s.season.cupPrizeEarned || 0) + 5000;
        if (m.round === 'F') {
          bankGain += 30000;
          s.season.cupPrizeEarned += 30000;
        }
      }
    }
  } else {
    const f = findPlayerFixture(s);
    if (f) {
      const winner = win ? 'player' : (f.home === 'player' ? f.away : f.home);
      markFixture(s, f, score, winner);
      simulateLeagueRound(s);
    }
  }
  const sponsor = !noReward ? sponsorIncome(s) : 0;
  s.team.bank += bankGain + sponsor;
  if (bankGain) addLedger(s, 'income', bankGain, '比赛奖金');
  if (sponsor) addLedger(s, 'income', sponsor, '赞助收入');
  s.team.trainingLeft = 2;
  if (!Array.isArray(s.matchHistory)) s.matchHistory = [];
  const matchDmg = r.dmg != null ? Math.round(r.dmg) : Math.round((kills || 0) * 70);
  s.matchHistory.push({
    seasonId: s.season.id,
    round: isCup ? (match ? match.round : null) : s.season.round,
    isCup: !!isCup,
    oppId: opp,
    oppName: oppTeam ? oppTeam.name : (opp || null),
    venue: isCup ? 'home' : (match && match.home === 'player' ? 'home' : 'away'),
    win: !!win,
    kills: kills || 0,
    deaths: deaths || 0,
    mvp: !!mvp,
    dmg: matchDmg,
    money: bankGain,
    highlight: !!mvp || (kills || 0) >= 15 || matchDmg >= 1000,
    score: score || null,
    mapId: matchMapId || null,
    oppRating: oppTeam ? oppTeam.rating : null,
    playerRating: preMatchRating,
    importance: matchImportanceLabel
  });
  if (s.matchHistory.length > 500) s.matchHistory.splice(0, s.matchHistory.length - 500);
  updateRecords(s, win, kills, bankGain + sponsor, isCup && s.season.cup.champion === 'player');
  if (s.player.seasonStats.w === 1) unlockAchievement(s, 'first_win');
  if (s.player.level >= 10) unlockAchievement(s, 'veteran');
  if ((Number(careerRecords(s).totalPrize) || 0) >= 100000) unlockAchievement(s, 'rich100k');
  if (noReward) {
    addNews(s, 'info', '放弃本场（' + (isCup ? '杯赛' : '联赛') + '）');
  } else {
    addNews(s, win ? 'win' : 'lose', (isCup ? '杯赛' : '联赛') + (win ? '胜利' : '失利') + '，奖金 ' + bankGain);
  }
  return { bankGain };
}

export function startCareerMatch(game, oppId, venue, isCup) {
  const s = getState();
  let pendingMapId = null;
  if (!isCup) {
    const f = findPlayerFixture(s);
    if (!f) return { ok: false, error: '\u5f53\u524d\u8f6e\u6b21\u6ca1\u6709\u5f85\u6253\u6bd4\u8d5b' };
    const expected = f.home === 'player' ? f.away : f.home;
    if (expected !== oppId) return { ok: false, error: '\u53ea\u80fd\u5f00\u59cb\u5f53\u524d\u8f6e\u6b21\u7684\u6bd4\u8d5b' };
    pendingMapId = fixtureMapFor(s, f);
  } else {
    const m = findCupMatch(s);
    if (!m || (m.a !== 'player' && m.b !== 'player')) return { ok: false, error: '\u5f53\u524d\u676f\u8d5b\u6ca1\u6709\u5f85\u6253\u6bd4\u8d5b' };
    const expected = m.a === 'player' ? m.b : m.a;
    if (expected !== oppId) return { ok: false, error: '\u53ea\u80fd\u5f00\u59cb\u5f53\u524d\u676f\u8d5b' };
  }
  s.pendingMatch = { oppId, venue, isCup: !!isCup, mapId: pendingMapId };
  save();
  game.opts.mode = 'career';
  startMatch(game);
  return { ok: true };
}

function careerStart(game) {
  const s = getState();
  const pm = s.pendingMatch || inferPendingMatch(s);
  if (!pm) {
    if (game.ui) game.ui.showMenu();
    return;
  }
  const teams = s.season.teams;
  const playerTeam = teams.find((t) => t.id === 'player') || teams[0];
  const opp = teams.find((t) => t.id === pm.oppId) || teams.find((t) => t.id !== 'player') || teams[0];
  const venue = pm.venue || 'home';
  game.careerMatch = { oppId: opp.id, venue, isCup: !!pm.isCup, settled: false };
  game.opts.mapId = pm.isCup ? cupMap(s) : (pm.mapId || fixtureMapFor(s, findPlayerFixture(s)) || (venue === 'home' ? playerTeam.homeMap : opp.homeMap));
  game.opts.team = venue === 'home' ? 't' : 'ct';
  game.opts.bots = 4;
  game.opts.diff = 'hard';
  game.opts.diffParams = teamDiffParams(opp);
  game.noRoundEnd = false;
  setupMatchEntities(game);
  const roster = s.team.roster.slice();
  let extraIdx = 0;
  while (roster.length < 4) {
    const name = CAND_NAMES[extraIdx++ % CAND_NAMES.length];
    if (roster.some((x) => x.name === name)) continue;
    roster.push({ id: 'r' + Date.now() + roster.length, name, team: playerTeam.name, role: ROLES[roster.length % ROLES.length], rating: 60, price: playerPrice(60) });
  }
  const avg = effectiveTeamRating(s);
  const friendBase = teamDiffParams({ rating: avg });
  const foeBase = teamDiffParams(opp);
  const teamBots = game.entities.filter((e) => e.bot && e.team === game.opts.team);
  teamBots.forEach((e, i) => {
    const p = roster[i];
    e.name = p.name;
    e.role = p.role;
    e.aiParams = { ...friendBase };
  });
  const foeRoster = TEAM_ROSTERS[opp.tag] || CAND_NAMES;
  let foeIdx = 0;
  for (const e of game.entities.filter((x) => x.bot && x.team !== game.opts.team)) {
    e.name = foeRoster[foeIdx++ % foeRoster.length];
    e.aiParams = { ...foeBase };
  }
  const p = game.player;
  const a = effectiveAttrs(s);
  p.spreadMult = 1.3 - a.aim / 250;
  p.speedMult = 0.9 + a.move / 250;
  p.reloadMult = 1.25 - a.react / 200;
  p.recoverMult = 0.75 + a.react / 200;
  p.nadeMult = 1 + a.nade / 300;
  game.attrsApplied = true;
  startRound(game);
}

function inferPendingMatch(s) {
  const nm = nextMatch(s);
  if (!nm) return null;
  if (s.season.cup.phase === 'active') {
    return { oppId: nm.a === 'player' ? nm.b : nm.a, venue: 'home', isCup: true };
  }
  return { oppId: nm.home === 'player' ? nm.away : nm.home, venue: nm.home === 'player' ? 'home' : 'away', isCup: false };
}

export function careerEndMatch(game) {
  const s = getState();
  const cm = game.careerMatch;
  if (!cm || cm.settled) return { ok: false };
  // 防御重复结算：本场若已被模拟/放弃标记（对应比赛已 played 或轮次已推进到其它对手），
  // 不再二次标记比分与发放奖励，仅收尾清除状态
  const pendingOpp = cm.isCup ? (() => {
    const m = findCupMatch(s);
    return m && !m.played ? (m.a === 'player' ? m.b : m.a) : null;
  })() : (() => {
    const f = findPlayerFixture(s);
    return f && !f.played ? (f.home === 'player' ? f.away : f.home) : null;
  })();
  if (pendingOpp !== cm.oppId) {
    cm.settled = true;
    save();
    return { ok: false };
  }
  const p = game.player;
  const win = (p.team === 't' && game.score.T >= ROUND.MATCH_WIN) || (p.team === 'ct' && game.score.CT >= ROUND.MATCH_WIN);
  const kills = p.kills || 0;
  const deaths = p.deaths || 0;
  const teamBots = game.entities.filter((e) => e.bot && e.team === p.team);
  const maxTeammateKills = teamBots.reduce((m, e) => Math.max(m, e.kills || 0), 0);
  const mvp = kills >= 5 && kills > maxTeammateKills;
  const homeScore = cm.venue === 'home' ? game.score.T : game.score.CT;
  const awayScore = cm.venue === 'home' ? game.score.CT : game.score.T;
  const levelBefore = s.player.level;
  const res = applyPlayerResult(s, { win, kills, deaths, mvp, score: [homeScore, awayScore], isCup: cm.isCup });
  cm.settled = true;
  s.pendingMatch = null;
  save();
  if (game.ui) {
    game.ui.hideEnd();
    let msg = (win ? '胜利' : '失利') + '，奖金 ' + res.bankGain + (mvp ? '，最佳 +200' : '');
    if (s.player.level > levelBefore) msg += '，等级提升：' + titleFor(s.player.level);
    game.ui.showToast(msg);
  }
  return { ok: true, win, mvp };
}

export function settlePlayerMatch(win, kills, deaths, opts = {}) {
  const s = getState();
  const pm = s.pendingMatch || inferPendingMatch(s);
  if (!pm) return { ok: false, error: '没有待结算的比赛' };
  const mvp = opts.mvp === true;
  const f = pm.isCup ? findCupMatch(s) : findPlayerFixture(s);
  const venue = pm.isCup ? 'home' : (f && f.home === 'player' ? 'home' : 'away');
  const winnerScore = ROUND.MATCH_WIN;
  const loserScore = Math.max(1, ROUND.MATCH_WIN - 3);
  const score = win ? (venue === 'home' ? [winnerScore, loserScore] : [loserScore, winnerScore]) : (venue === 'home' ? [loserScore, winnerScore] : [winnerScore, loserScore]);
  applyPlayerResult(s, { win, kills: kills || 0, deaths: deaths || 0, mvp, score, isCup: !!pm.isCup });
  s.pendingMatch = null;
  save();
  return { ok: true };
}

function sortedStandings(s) {
  return [...s.season.standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
}

export function seasonPace(s, teamId = 'player') {
  const list = sortedStandings(s);
  const row = list.find((x) => x.teamId === teamId);
  if (!row) return { teamId, points: 0, played: 0, remaining: 0, projected: null, currentRank: null, projectedRank: null };
  const total = Number(s.season.totalRounds) || 14;
  const remaining = Math.max(0, total - row.played);
  const avg = row.played > 0 ? row.pts / row.played : null;
  const projected = avg == null ? null : Math.round(row.pts + avg * remaining);
  const projectedRanks = s.season.standings.map((x) => {
    const avg2 = x.played > 0 ? x.pts / x.played : null;
    return {
      teamId: x.teamId,
      projected: avg2 == null ? null : Math.round(x.pts + avg2 * Math.max(0, total - x.played)),
      w: x.w,
      pts: x.pts
    };
  }).filter((x) => x.projected != null).sort((a, b) => b.projected - a.projected || b.w - a.w);
  const projectedRank = projectedRanks.length ? projectedRanks.findIndex((x) => x.teamId === teamId) + 1 : null;
  return {
    teamId,
    points: row.pts,
    played: row.played,
    remaining,
    projected,
    currentRank: list.indexOf(row) + 1,
    projectedRank
  };
}

export function relegationProjection(s) {
  const list = sortedStandings(s);
  const row = list.find((x) => x.teamId === 'player');
  if (!row) return null;
  const rank = list.indexOf(row) + 1;
  const league = s.team.league;
  const promotionTargetRank = league === '甲级' ? null : 2;
  const safetyTargetRank = league === '丙级' ? null : 6;
  const promotionRow = promotionTargetRank ? list[promotionTargetRank - 1] : null;
  const safetyRow = safetyTargetRank ? list[safetyTargetRank - 1] : null;
  const pointsToPromotion = promotionRow && rank > promotionTargetRank
    ? Math.max(0, promotionRow.pts + 1 - row.pts)
    : 0;
  const pointsToSafety = safetyRow && rank > safetyTargetRank
    ? Math.max(0, safetyRow.pts + 1 - row.pts)
    : 0;
  const remaining = Math.max(0, Number(s.season.totalRounds || 14) - row.played);
  const maxRemainingPoints = remaining * 3;
  const projectedRank = seasonPace(s).projectedRank;
  let status = '安全';
  if (promotionTargetRank && rank <= promotionTargetRank) status = '升级区';
  else if (league !== '丙级' && rank >= 7) status = '降级区';
  else if (league !== '甲级' && rank <= 2) status = '升级区';
  return {
    league,
    rank,
    points: row.pts,
    played: row.played,
    remaining,
    maxRemainingPoints,
    promotionTargetRank,
    safetyTargetRank,
    pointsToPromotion,
    pointsToSafety,
    canPromote: promotionTargetRank ? maxRemainingPoints >= pointsToPromotion : false,
    relegationRisk: safetyTargetRank ? pointsToSafety > maxRemainingPoints : false,
    projectedRank,
    status
  };
}

export function goalProgress(s) {
  const goals = seasonGoals(s);
  const pace = seasonPace(s);
  const list = sortedStandings(s);
  const playerRow = list.find((x) => x.teamId === 'player');
  const targetRow = list[goals.rankGoal - 1] || playerRow;
  const rankPointsGap = playerRow && targetRow && playerRow !== targetRow
    ? Math.max(0, targetRow.pts + 1 - playerRow.pts)
    : 0;
  const rankProgress = goals.rankGoal
    ? Math.min(100, Math.max(0, Math.round(((goals.rankGoal - goals.currentRank + 1) / goals.rankGoal) * 100)))
    : 0;
  const cupProgress = goals.cupGoal === 0
    ? (goals.currentCupRound >= 0 ? 100 : 0)
    : (goals.currentCupRound === -1 ? 0 : Math.min(100, Math.max(0, Math.round(((goals.currentCupRound + 1) / (goals.cupGoal + 1)) * 100))));
  return {
    ...goals,
    rankPointsGap,
    rankProgress,
    cupProgress,
    projectedPoints: pace.projected,
    projectedRank: pace.projectedRank,
    played: pace.played,
    remaining: pace.remaining
  };
}

export function seasonReport() {
  const s = getState();
  const list = sortedStandings(s);
  const rank = list.findIndex((x) => x.teamId === 'player') + 1;
  const rankPrize = PRIZE[rank] || 0;
  const cupPrize = s.season.cupPrizeEarned || 0;
  const cupRound = s.season.cupResult === undefined ? 0 : s.season.cupResult;
  return { league: s.team.league, rank, rankPrize, cupPrize, cupRound, prize: rankPrize + cupPrize, standings: list };
}

function filterMatches(history, season) {
  return (Array.isArray(history) ? history : []).filter((m) => {
    if (!m) return false;
    if (typeof season === 'function') return !!season(m);
    if (season == null) return true;
    return m.seasonId === season;
  });
}

function round2(n) { return Math.round(n * 100) / 100; }

export function seasonStats(history, season) {
  const matches = filterMatches(history, season);
  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let money = 0;
  let dmg = 0;
  let mvp = 0;
  for (const m of matches) {
    if (m.win) wins++;
    kills += m.kills || 0;
    deaths += m.deaths || 0;
    money += m.money || 0;
    dmg += m.dmg || 0;
    if (m.mvp) mvp++;
  }
  const n = matches.length;
  return {
    matches: n,
    wins,
    losses: n - wins,
    winRate: n ? Math.round((wins / n) * 100) : 0,
    kd: deaths ? round2(kills / deaths) : kills,
    totalMoney: money,
    avgDmg: n ? Math.round(dmg / n) : 0,
    kills,
    deaths,
    totalDmg: dmg,
    mvp
  };
}

export function seasonAwards(history, season) {
  const list = filterMatches(history, season).map(matchDetail);
  if (!list.length) {
    return { matches: 0, mvpMatches: 0, bestKills: null, bestDmg: null, avgKills: 0, avgDmg: 0, bestKd: 0, topPerformance: null };
  }
  const mvpMatches = list.filter((m) => m.mvp);
  const bestKills = list.reduce((a, b) => (b.kills > a.kills ? b : a), list[0]);
  const bestDmg = list.reduce((a, b) => (b.dmg > a.dmg ? b : a), list[0]);
  const avgKills = round2(list.reduce((a, m) => a + m.kills, 0) / list.length);
  const avgDmg = Math.round(list.reduce((a, m) => a + m.dmg, 0) / list.length);
  const topPerformance = list.slice().sort((a, b) =>
    (b.kills + b.dmg / 100 + (b.mvp ? 4 : 0) + (b.win ? 2 : 0)) -
    (a.kills + a.dmg / 100 + (a.mvp ? 4 : 0) + (a.win ? 2 : 0))
  )[0];
  const bestKd = list.slice().sort((a, b) => b.kd - a.kd)[0];
  return {
    matches: list.length,
    mvpMatches,
    bestKills,
    bestDmg,
    avgKills,
    avgDmg,
    bestKd,
    topPerformance
  };
}

export function seasonPerformanceSummary(s, seasonId) {
  const id = seasonId == null ? (s && s.season ? s.season.id : null) : seasonId;
  const history = Array.isArray(s && s.matchHistory) ? s.matchHistory : [];
  const stats = seasonStats(history, id);
  const awards = seasonAwards(history, id);
  return {
    seasonId: id,
    matches: stats.matches,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    kd: stats.kd,
    kills: stats.kills,
    deaths: stats.deaths,
    avgKills: awards.avgKills,
    totalDmg: stats.totalDmg,
    avgDmg: stats.avgDmg,
    totalMoney: stats.totalMoney,
    mvpCount: stats.mvp,
    mvpMatches: awards.mvpMatches,
    bestKills: awards.bestKills ? awards.bestKills.kills : 0,
    bestDmg: awards.bestDmg ? awards.bestDmg.dmg : 0,
    topPerformance: awards.topPerformance
  };
}

export function seasonSeries(history, season) {
  return filterMatches(history, season).map((m) => ({
    win: !!m.win,
    kills: m.kills || 0,
    deaths: m.deaths || 0,
    dmg: m.dmg || 0,
    money: m.money || 0,
    isCup: !!m.isCup,
    round: m.round != null ? m.round : null
  }));
}

export function matchDetail(m) {
  if (!m) return null;
  const score = Array.isArray(m.score) ? m.score : null;
  const kills = m.kills || 0;
  const deaths = m.deaths || 0;
  return {
    ...m,
    win: !!m.win,
    kills,
    deaths,
    dmg: m.dmg || 0,
    money: m.money || 0,
    highlight: !!m.highlight || !!m.mvp || kills >= 15 || (m.dmg || 0) >= 1000,
    kd: deaths ? round2(kills / deaths) : kills,
    scoreText: score ? score.join(':') : '未记录',
    impact: m.mvp ? 'MVP' : (m.win ? '胜利' : '失利')
  };
}

export function seasonTimeline(history, season) {
  return filterMatches(history, season).map((m, i) => {
    const d = matchDetail(m);
    return {
      ...d,
      no: i + 1,
      label: d.isCup ? '杯赛' : ('第 ' + (d.round != null ? d.round : i + 1) + ' 轮')
    };
  });
}

export function headToHead(history, oppId) {
  const list = filterMatches(history, (m) => m && m.oppId === oppId);
  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let totalMoney = 0;
  let totalDmg = 0;
  for (const m of list) {
    if (m.win) wins++;
    kills += m.kills || 0;
    deaths += m.deaths || 0;
    totalMoney += m.money || 0;
    totalDmg += m.dmg || 0;
  }
  const n = list.length;
  return {
    oppId,
    matches: n,
    wins,
    losses: n - wins,
    winRate: n ? Math.round((wins / n) * 100) : 0,
    kd: deaths ? round2(kills / deaths) : kills,
    totalMoney,
    totalDmg,
    last: list.slice(-5).map(matchDetail)
  };
}

export function importantMatches(history, limit = 20) {
  const list = (Array.isArray(history) ? history : []).filter((m) => m && m.importance && /关键|争冠|保级|杯赛/.test(String(m.importance)));
  return list.slice(-Math.max(0, limit)).reverse().map(matchDetail);
}

export function favoriteMatches(history, limit = 20) {
  const list = (Array.isArray(history) ? history : []).filter((m) => m && matchDetail(m).highlight);
  return list.slice(-Math.max(0, limit)).reverse().map(matchDetail);
}

export function cupHistory(seasonHistory) {
  const labels = { 0: '八强', 1: '四强', 2: '亚军', 3: '冠军' };
  return (Array.isArray(seasonHistory) ? seasonHistory : [])
    .filter((h) => h && h.cupRound != null)
    .slice()
    .reverse()
    .map((h) => ({
      seasonId: h.seasonId,
      league: h.league,
      rank: h.rank,
      cupRound: h.cupRound,
      cupLabel: labels[h.cupRound] || '未参加',
      prize: h.prize || 0
    }));
}

export function trophyCase(seasonHistory) {
  const rows = cupHistory(seasonHistory).filter((h) => h.cupRound >= 2);
  const championCount = rows.filter((h) => h.cupRound === 3).length;
  const runnerUpCount = rows.filter((h) => h.cupRound === 2).length;
  return {
    championCount,
    runnerUpCount,
    total: rows.length,
    rows
  };
}

export function careerTimeline(s, limit = 60) {
  const entries = [];
  const mh = Array.isArray(s && s.matchHistory) ? s.matchHistory.slice().reverse() : [];
  for (const m of mh) {
    const d = matchDetail(m);
    entries.push({
      type: d.win ? 'win' : 'lose',
      seasonId: d.seasonId,
      text: (d.isCup ? '杯赛' : '联赛') + (d.win ? '胜利' : '失利') + ' · ' + (d.oppName || d.oppId || '-') + ' · ' + d.scoreText + ' · ' + d.kills + 'K/' + d.deaths + 'D',
      detail: d.importance
    });
  }
  for (const h of Array.isArray(s && s.history) ? s.history.slice().reverse() : []) {
    entries.push({
      type: 'season',
      seasonId: h.seasonId,
      text: '第 ' + h.seasonId + ' 赛季结束 · ' + h.league + ' · 第 ' + h.rank + ' 名 · 奖金 ' + h.prize,
      detail: cupHistory([h])[0] ? cupHistory([h])[0].cupLabel : ''
    });
  }
  for (const a of (s && s.player && Array.isArray(s.player.achievements) ? s.player.achievements.slice().reverse() : [])) {
    entries.push({ type: 'award', text: '成就 · ' + a.title, detail: '' });
  }
  for (const n of Array.isArray(s && s.news) ? s.news.slice() : []) {
    entries.push({ type: n.type || 'info', text: n.text, detail: '' });
  }
  return entries.slice(0, Math.max(1, limit));
}

export function seasonStreaks(series) {
  const list = Array.isArray(series) ? series : [];
  let current = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].win) break;
    current++;
  }
  let longest = 0;
  let run = 0;
  for (const m of list) {
    if (m.win) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return { current, longest };
}

export function careerSummary(history) {
  const seasons = new Set();
  let matches = 0;
  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let money = 0;
  let dmg = 0;
  for (const m of Array.isArray(history) ? history : []) {
    if (!m) continue;
    if (m.seasonId != null) seasons.add(m.seasonId);
    matches++;
    if (m.win) wins++;
    kills += m.kills || 0;
    deaths += m.deaths || 0;
    money += m.money || 0;
    dmg += m.dmg || 0;
  }
  return {
    seasons: seasons.size,
    matches,
    wins,
    losses: matches - wins,
    winRate: matches ? Math.round((wins / matches) * 100) : 0,
    kd: deaths ? round2(kills / deaths) : kills,
    totalMoney: money,
    totalDmg: dmg,
    avgDmg: matches ? Math.round(dmg / matches) : 0,
    kills,
    deaths
  };
}

export function seasonTrends(history) {
  const ids = [...new Set((Array.isArray(history) ? history : []).filter((m) => m && m.seasonId != null).map((m) => m.seasonId))].sort((a, b) => a - b);
  return ids.map((seasonId) => {
    const st = seasonStats(history, seasonId);
    return {
      seasonId,
      matches: st.matches,
      wins: st.wins,
      losses: st.losses,
      winRate: st.winRate,
      kd: st.kd,
      avgDmg: st.avgDmg,
      totalMoney: st.totalMoney,
      kills: st.kills,
      deaths: st.deaths
    };
  });
}

function promoteLeague(league, rank) {
  if (league === '甲级') return rank >= 7 ? '乙级' : '甲级';
  if (league === '乙级') return rank <= 2 ? '甲级' : (rank >= 7 ? '丙级' : '乙级');
  return rank <= 2 ? '乙级' : '丙级';
}

export function nextSeason() {
  const s = getState();
  const report = seasonReport();
  const oldLeague = s.team.league;
  const goals = seasonGoals(s);
  if (goals.achieved) {
    s.team.bank += goals.reward;
    addLedger(s, 'income', goals.reward, '赛季目标奖励');
    addNews(s, 'award', '赛季目标达成，奖励 ' + goals.reward);
  }
  s.team.bank += report.rankPrize;
  addLedger(s, 'income', report.rankPrize, '排名奖金');
  addLedger(s, 'income', report.cupPrize, '杯赛奖金');
  const rec = careerRecords(s);
  rec.bestSeasonRank = Math.min(Number(rec.bestSeasonRank) || 99, report.rank);
  rec.totalPrize = Math.round((Number(rec.totalPrize) || 0) + report.prize + goals.reward);
  s.history.push({ seasonId: s.season.id, league: report.league, rank: report.rank, cupRound: report.cupRound, prize: report.prize });
  addNews(s, 'info', '第 ' + s.season.id + ' 赛季结束：第 ' + report.rank + ' 名，总奖金 ' + report.prize);
  s.team.league = promoteLeague(report.league, report.rank);
  if (s.team.league !== oldLeague) unlockAchievement(s, 'promotion');
  s.season.id++;
  s.season.round = 1;
  s.team.transfersLeft = 2;
  s.team.transferWindow = false;
  s.team.trainingLeft = 2;
  s.team.rested = false;
  s.team.pool = null;
  s.player.fatigue = 0;
  s.player.seasonStats = { played: 0, w: 0, d: 0, l: 0, kills: 0, deaths: 0, mvp: 0 };
  const teams = makeTeams(s.team.league, effectiveTeamRating(s));
  s.season.teams = teams;
  s.season.fixtures = makeFixtures(teams.map((t) => t.id));
  assignFixtureMaps(s);
  s.season.standings = makeStandings(teams);
  s.season.cup = { phase: 'idle', bracket: [] };
  delete s.season.cupPrizeEarned;
  delete s.season.cupResult;
  delete s.pendingMatch;
  addNews(s, 'info', '新赛季开始：' + s.team.league + ' 第 ' + s.season.id + ' 赛季');
  save();
  return report;
}

export function simulatePlayerMatch() {
  const s = getState();
  const pm = s.pendingMatch || inferPendingMatch(s);
  if (!pm) return { ok: false, error: '没有可模拟的比赛' };
  const playerTeam = s.season.teams.find((x) => x.id === 'player');
  const opp = s.season.teams.find((x) => x.id === pm.oppId) || s.season.teams.find((x) => x.id !== 'player');
  const f = pm.isCup ? findCupMatch(s) : findPlayerFixture(s);
  const venue = pm.isCup ? 'home' : (f && f.home === 'player' ? 'home' : 'away');
  // 主场优势：主队 rating 临时 +2，反映熟悉场地/主场氛围
  const homeBonus = venue === 'home' ? 2 : 0;
  const r = simScore({ ...playerTeam, rating: effectiveTeamRating(s) + homeBonus }, opp);
  const win = r.winner.id === 'player';
  const playerScore = win ? r.score[0] : r.score[1];
  const oppScore = win ? r.score[1] : r.score[0];
  const score = venue === 'home' ? [playerScore, oppScore] : [oppScore, playerScore];
  const kills = 3 + Math.floor(rng() * 6);
  const deaths = Math.floor(rng() * 8);
  applyPlayerResult(s, { win, kills, deaths, mvp: kills >= 5, score, isCup: !!pm.isCup });
  s.pendingMatch = null;
  save();
  return { ok: true, win, kills, deaths, score };
}

export function abandonPendingMatch() {
  const s = getState();
  const pm = s.pendingMatch || inferPendingMatch(s);
  if (!pm) return { ok: false, error: '没有待处理比赛' };
  const f2 = pm.isCup ? findCupMatch(s) : findPlayerFixture(s);
  const venue2 = pm.isCup ? 'home' : (f2 && f2.home === 'player' ? 'home' : 'away');
  applyPlayerResult(s, { win: false, kills: 0, deaths: 0, mvp: false, score: venue2 === 'home' ? [0, ROUND.MATCH_WIN] : [ROUND.MATCH_WIN, 0], isCup: !!pm.isCup, noReward: true });
  s.pendingMatch = null;
  save();
  return { ok: true };
}

registerMode({
  id: 'career',
  name: '生涯模式',
  desc: '个人+战队长线赛季',
  customBots: false,
  start: careerStart
});
