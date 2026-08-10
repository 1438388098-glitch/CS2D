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
const TEAM_ROLES = ['突破', '狙击', '补枪', '指挥', '自由人'];
const STYLE_POOL = ['快攻抢点', '控图磨血', '道具压制', '明星单点', '纪律防守', '变速反清', '稳扎稳打', '青训冲劲'];
const TACTIC_POOL = ['默认防守', '前压反清', '后保残局', '变速转点', '围点强攻', '拖延保枪'];
const TRAIN_TIERS = [
  { key: 'basic', label: '基础', cost: 500, points: 2, fatigue: 3 },
  { key: 'pro', label: '进阶', cost: 1200, points: 6, fatigue: 6 },
  { key: 'elite', label: '精英', cost: 2500, points: 15, fatigue: 10 }
];
const FACILITIES = {
  academy: { label: '青训', desc: '训练点数 +1/级', baseCost: 4000, max: 3 },
  medical: { label: '医疗', desc: '比赛疲劳 -2/级', baseCost: 3500, max: 3 },
  scouting: { label: '球探', desc: '候选潜力 +1/级', baseCost: 3000, max: 3 }
};
const PRIZE = { 1: 30000, 2: 20000, 3: 15000, 4: 8000, 5: 8000, 6: 8000, 7: 4000, 8: 4000 };
const LEAGUE_RATING = { '甲级': [80, 92], '乙级': [70, 85], '丙级': [60, 74] };
const TITLES = ['新兵', '列兵', '下士', '中士', '上尉', '少校', '上校', '准将', '少将', '中将', '上将', '传奇'];
const LEAGUE_SPONSOR = { '甲级': 5000, '乙级': 3200, '丙级': 2000 };
const LEAGUE_RULES = {
  '甲级': {
    ratingRange: [80, 92],
    sponsor: 5000,
    ticketBase: 1200,
    matchWin: 2200,
    matchLose: 500,
    mvpBonus: 250,
    prizeScale: 1.45,
    budgetBase: 28000,
    cupRoundPrize: 6500,
    cupFinalPrize: 42000,
    goal: { rank: 6, cup: 1, reward: 12000 },
    identity: '顶级豪门：强弱差距大，保级与争冠都极高压',
    competition: '两极分化',
    youthBias: 0,
    tacticalBias: 1,
    mediaPressure: 90
  },
  '乙级': {
    ratingRange: [70, 85],
    sponsor: 3200,
    ticketBase: 800,
    matchWin: 1500,
    matchLose: 300,
    mvpBonus: 200,
    prizeScale: 1,
    budgetBase: 20000,
    cupRoundPrize: 5000,
    cupFinalPrize: 30000,
    goal: { rank: 2, cup: 1, reward: 10000 },
    identity: '中游联赛：争升级和保级绞杀最密集',
    competition: '中游绞杀',
    youthBias: 0.4,
    tacticalBias: 0,
    mediaPressure: 55
  },
  '丙级': {
    ratingRange: [60, 74],
    sponsor: 2000,
    ticketBase: 500,
    matchWin: 1000,
    matchLose: 200,
    mvpBonus: 150,
    prizeScale: 0.72,
    budgetBase: 15000,
    cupRoundPrize: 3500,
    cupFinalPrize: 18000,
    goal: { rank: 4, cup: 0, reward: 7000 },
    identity: '新秀联赛：年轻阵容多，比赛节奏快但稳定性差',
    competition: '青春冲击',
    youthBias: 0.8,
    tacticalBias: -0.4,
    mediaPressure: 25
  }
};
const SEASON_GOALS = {
  '甲级': { rank: 6, cup: 1, reward: 12000 },
  '乙级': { rank: 2, cup: 1, reward: 10000 },
  '丙级': { rank: 4, cup: 0, reward: 7000 }
};
const ACHIEVEMENTS = [
  { id: 'first_win', title: '首胜', desc: '赢得第一场生涯比赛', category: '表现', hint: '赢下一场联赛或杯赛', rewardMoney: 500 },
  { id: 'streak5', title: '五连胜', desc: '创造一次五连胜', category: '表现', hint: '连续赢下 5 场正式比赛', rewardMoney: 1500 },
  { id: 'promotion', title: '升级', desc: '带队升入更高级别联赛', category: '赛季', hint: '以升级区排名结束赛季', rewardMoney: 3000 },
  { id: 'cup_champion', title: '杯赛冠军', desc: '拿下淘汰赛冠军', category: '杯赛', hint: '赢下杯赛决赛', rewardMoney: 5000 },
  { id: 'rich100k', title: '百万俱乐部', desc: '累计赛季奖金达到 100000', category: '财务', hint: '通过排名、杯赛与目标奖励累计奖金', rewardMoney: 2000 },
  { id: 'veteran', title: '老将', desc: '玩家达到 10 级', category: '生涯', hint: '持续比赛提升玩家等级', rewardMoney: 1000 }
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
export function leagueRules(league) {
  const key = LEAGUE_RULES[league] ? league : '乙级';
  return { key, ...LEAGUE_RULES[key] };
}
export function leagueInfo() {
  return Object.keys(LEAGUE_RULES).map((league) => ({
    league,
    ...leagueRules(league)
  }));
}
function rankPrizeFor(league, rank) {
  return Math.round((PRIZE[rank] || 0) * leagueRules(league).prizeScale);
}
function cupPrizeFor(league, round) {
  const rules = leagueRules(league);
  return round === 'F' ? rules.cupRoundPrize + rules.cupFinalPrize : rules.cupRoundPrize;
}
function addLedger(s, type, amount, label) {
  if (!Array.isArray(s.team.ledger)) s.team.ledger = [];
  s.team.ledger.push({
    t: Date.now(),
    seasonId: Number(s.season && s.season.id) || null,
    round: Number(s.season && s.season.round) || 1,
    type,
    amount: Math.round(amount || 0),
    label
  });
  if (s.team.ledger.length > 300) s.team.ledger.splice(0, s.team.ledger.length - 300);
}
function ensureTransferLog(s) {
  if (!Array.isArray(s.team.transferLog)) s.team.transferLog = [];
  return s.team.transferLog;
}

export function sponsorIncome(s) {
  const league = s && s.team && s.team.league ? s.team.league : '乙级';
  const base = leagueRules(league).sponsor;
  const morale = Number(s && s.team && s.team.morale) || 65;
  const rating = Number((s && s.season && s.season.teams && s.season.teams.find((t) => t.id === 'player') || {}).rating) || 65;
  return Math.round(base * (0.7 + morale / 200) * (0.8 + rating / 500));
}

export function sponsorPreview(s) {
  const league = s.team.league;
  const base = leagueRules(league).sponsor;
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

export function sponsorSeasonPreview(s) {
  const list = sortedStandings(s);
  const rank = list.findIndex((x) => x.teamId === 'player') + 1;
  const pace = seasonPace(s);
  const projectedRank = pace.projectedRank || rank;
  const currentLeague = s.team.league;
  const likelyLeague = promoteLeague(currentLeague, projectedRank);
  const morale = careerMorale(s);
  const rating = Number((s.season.teams.find((t) => t.id === 'player') || {}).rating) || 65;
  const rows = Object.keys(LEAGUE_RULES).map((league) => {
    const base = leagueRules(league).sponsor;
    return {
      league,
      base,
      income: Math.round(base * (0.7 + morale / 200) * (0.8 + rating / 500)),
      current: league === currentLeague,
      likely: league === likelyLeague
    };
  });
  const next = rows.find((r) => r.likely) || rows.find((r) => r.current);
  const current = rows.find((r) => r.current) || rows[0];
  return {
    currentLeague,
    rank,
    projectedRank,
    likelyLeague,
    currentIncome: sponsorIncome(s),
    likelyIncome: next ? next.income : sponsorIncome(s),
    delta: next ? next.income - sponsorIncome(s) : 0,
    rows,
    risk: likelyLeague !== currentLeague && next && next.income < sponsorIncome(s)
      ? '按预测将降档，保住排名可避免赞助损失'
      : (likelyLeague !== currentLeague && next && next.income > sponsorIncome(s) ? '按预测将升档，继续维持排名即可提高赞助' : '按预测可保住当前赞助档位')
  };
}

export function homeTicketIncome(s, win) {
  const base = leagueRules(s.team.league).ticketBase;
  const rating = Number((s.season.teams.find((t) => t.id === 'player') || {}).rating) || 65;
  const morale = careerMorale(s);
  const multiplier = (0.8 + rating / 250) * (0.8 + morale / 150) * (win ? 1.35 : 0.8);
  return Math.round(base * multiplier);
}

export function ticketPreview(s) {
  const ledger = Array.isArray(s.team.ledger) ? s.team.ledger : [];
  const seasonEarned = ledger.reduce((a, x) => a + (x.type === 'income' && x.label === '主场票房' ? (x.amount || 0) : 0), 0);
  return {
    homeWin: homeTicketIncome(s, true),
    homeLoss: homeTicketIncome(s, false),
    awayWin: 0,
    seasonEarned,
    venue: '主场与客场'
  };
}

export function cashflowForecast(s) {
  const rules = leagueRules(s.team.league);
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
    expectedPrize += (chance * rules.matchWin + (1 - chance) * rules.matchLose + chance * 0.2 * rules.mvpBonus);
  }
  if (s.season.cup && s.season.cup.phase === 'active') {
    for (const m of s.season.cup.bracket || []) {
      if (!m.played && (m.a === 'player' || m.b === 'player')) {
        const oppId = m.a === 'player' ? m.b : m.a;
        const chance = winChance(s, oppId, 'home') / 100;
        expectedPrize += chance * rules.cupRoundPrize;
        if (m.round === 'F') expectedPrize += chance * rules.cupFinalPrize;
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
  const rules = leagueRules(s.team.league);
  const ledger = Array.isArray(s.team && s.team.ledger) ? s.team.ledger : [];
  const bank = Number(s.team && s.team.bank) || 0;
  const income = ledger.reduce((a, x) => a + Math.max(0, x.amount || 0), 0);
  const expense = ledger.reduce((a, x) => a + Math.min(0, x.amount || 0), 0);
  const flow = cashflowForecast(s);
  const budget = rules.budgetBase + flow.expectedSponsor + flow.expectedPrize;
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

export function financialRisk(s) {
  const bank = Number(s && s.team && s.team.bank) || 0;
  const sponsor = sponsorIncome(s);
  const cash = cashflowForecast(s);
  const budget = seasonBudget(s);
  const remaining = Number(cash.remainingLeagueMatches) || 0;
  const transferOpen = transferWindowOpen(s);
  const advice = [];
  let score = 0;
  if (bank < 5000) {
    score += 35;
    advice.push('当前资金低于 5000，暂停大额转会并优先保留比赛与续约底线');
  } else if (bank < 10000) {
    score += 18;
    advice.push('当前资金中等，优先基础训练和小成本补强');
  }
  if (cash.projectedBank < 6000) {
    score += 25;
    advice.push('赛季末预测低于安全垫，避免连续高投入');
  } else if (cash.cushion < 3000) {
    score += 15;
    advice.push('安全垫偏薄，训练和转会建议按最低档进行');
  }
  if (transferOpen && bank < 10000) {
    score += 20;
    advice.push('转会窗期间资金偏低，只适合低成本补强或暂缓引援');
  }
  if (remaining <= 2 && bank < 8000) {
    score += 15;
    advice.push('剩余赛程少且资金不足，收入恢复空间有限');
  }
  if (remaining >= 8 && bank >= 10000) {
    score -= 15;
    advice.push('赛程充足且资金健康，可继续投入训练或合理补强');
  }
  if (sponsor * 2 > bank) {
    score += 10;
    advice.push('赞助收入相对余额占比较高，近期需控制固定支出');
  }
  score += Math.min(10, budget.warnings.length * 5);
  score = clamp(Math.round(score), 0, 100);
  const level = score >= 75 ? '高风险' : score >= 50 ? '紧张' : score >= 25 ? '谨慎' : '安全';
  const mode = score >= 50 ? '低资金模式' : score >= 25 ? '稳健运营' : '可投入';
  if (!advice.length) advice.push('当前财务健康，保持现有训练和转会节奏即可');
  return {
    bank,
    sponsor,
    remaining,
    transferOpen,
    projectedBank: cash.projectedBank,
    cushion: cash.cushion,
    score,
    level,
    mode,
    advice
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

export function seasonFinancialSummary(s, seasonId) {
  const id = seasonId == null ? (s && s.season ? s.season.id : null) : seasonId;
  const ledger = Array.isArray(s && s.team && s.team.ledger) ? s.team.ledger : [];
  const rows = ledger.filter((x) => x && (id == null || x.seasonId == null || x.seasonId === id));
  const income = new Map();
  const expense = new Map();
  let totalIncome = 0;
  let totalExpense = 0;
  for (const x of rows) {
    const amount = Number(x.amount) || 0;
    if (amount >= 0) {
      totalIncome += amount;
      const key = labelSource(x.label, 'income');
      income.set(key, (income.get(key) || 0) + amount);
    } else {
      const abs = Math.abs(amount);
      totalExpense += abs;
      const key = labelSource(x.label, 'expense');
      expense.set(key, (expense.get(key) || 0) + abs);
    }
  }
  const toList = (map) => [...map.entries()]
    .map(([label, amount]) => ({ label, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);
  return {
    seasonId: id,
    totalIncome: Math.round(totalIncome),
    totalExpense: Math.round(totalExpense),
    net: Math.round(totalIncome - totalExpense),
    bank: Math.round(Number(s && s.team && s.team.bank) || 0),
    incomeSources: toList(income),
    expenseSources: toList(expense)
  };
}

function labelSource(label, type) {
  const text = String(label || '');
  if (type === 'expense') {
    if (text.includes('买入')) return '转会买入';
    if (text.includes('续约')) return '合同续约';
    if (text.includes('设施')) return '设施投资';
    if (text.includes('训练')) return '训练投入';
    if (text.includes('休息')) return '恢复投入';
    return text || '其他支出';
  }
  if (text.includes('比赛奖金')) return '比赛奖金';
  if (text.includes('赞助')) return '赞助收入';
  if (text.includes('主场票房')) return '主场票房';
  if (text.includes('赛季目标')) return '赛季目标';
  if (text.includes('排名奖金')) return '排名奖金';
  if (text.includes('杯赛奖金')) return '杯赛奖金';
  if (text.includes('卖出')) return '转会回款';
  return text || '其他收入';
}

export function remainingPrizePreview(s) {
  const rules = leagueRules(s.team.league);
  const list = sortedStandings(s);
  const rank = list.findIndex((x) => x.teamId === 'player') + 1;
  const currentRankPrize = rankPrizeFor(s.team.league, rank);
  const pace = seasonPace(s);
  const projectedRank = pace.projectedRank;
  const projectedRankPrize = projectedRank ? rankPrizeFor(s.team.league, projectedRank) : currentRankPrize;
  const cash = cashflowForecast(s);
  let expectedCup = 0;
  let maxCup = 0;
  if (s.season.cup && s.season.cup.phase === 'active') {
    for (const m of s.season.cup.bracket || []) {
      if (!m.played && (m.a === 'player' || m.b === 'player')) {
        const oppId = m.a === 'player' ? m.b : m.a;
        const chance = winChance(s, oppId, 'home') / 100;
        const winPrize = cupPrizeFor(s.team.league, m.round);
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
  const def = leagueRules(s.team.league).goal;
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

export function seasonGoalHistory(s) {
  const list = Array.isArray(s && s.goalHistory) ? s.goalHistory : [];
  return list.slice().reverse().map((h) => ({ ...h, achieved: !!h.achieved }));
}

export function achievementDefs() {
  return ACHIEVEMENTS.map((a) => ({ ...a }));
}

export function achievements(s) {
  return (Array.isArray(s.player.achievements) ? s.player.achievements : []).slice();
}

export function achievementProgress(s) {
  const unlocked = new Set((s.player && Array.isArray(s.player.achievements) ? s.player.achievements : [])
    .map((a) => a && a.id)
    .filter(Boolean));
  const rows = ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: unlocked.has(def.id)
  }));
  const unlockedCount = rows.filter((r) => r.unlocked).length;
  const total = rows.length;
  return {
    total,
    unlockedCount,
    lockedCount: total - unlockedCount,
    pct: total ? Math.round((unlockedCount / total) * 100) : 0,
    next: rows.find((r) => !r.unlocked) || null,
    rows
  };
}

export function honorTitle(s) {
  const ach = new Set((s.player && Array.isArray(s.player.achievements) ? s.player.achievements : [])
    .map((a) => a && a.id)
    .filter(Boolean));
  const rec = careerRecords(s);
  const badges = [];
  if (Number(rec.cupChampions) >= 3) badges.push('三冠教头');
  else if (Number(rec.cupChampions) >= 1) badges.push('杯赛冠军');
  if (ach.has('promotion')) badges.push('升级功臣');
  if ((Number(rec.bestSeasonRank) || 99) <= 2) badges.push('争冠核心');
  if (ach.has('rich100k')) badges.push('百万经理');
  if (ach.has('veteran')) badges.push('老将');
  const title = badges[0] || titleFor(s.player.level);
  const reason = badges.length ? badges.slice(0, 3).join(' · ') : titleFor(s.player.level) + ' · 等级 ' + s.player.level;
  return { title, badges: badges.slice(0, 3), reason };
}

export function unlockAchievement(s, id) {
  if (!Array.isArray(s.player.achievements)) s.player.achievements = [];
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def || s.player.achievements.some((a) => a.id === id)) return false;
  s.player.achievements.push({ id: def.id, title: def.title, unlockedAt: Date.now() });
  if (def.rewardMoney) {
    s.team.bank += def.rewardMoney;
    addLedger(s, 'income', def.rewardMoney, '成就奖励');
  }
  addNews(s, 'award', '成就解锁：' + def.title);
  save();
  return true;
}

export function careerRecords(s) {
  if (!s.player.records) s.player.records = {};
  return s.player.records;
}

function addRecordAlert(s, matchSeq, type, label, oldValue, newValue) {
  if (!Array.isArray(s.player.recordAlertLog)) s.player.recordAlertLog = [];
  s.player.recordAlertLog.push({
    matchSeq,
    seasonId: s.season ? s.season.id : null,
    round: s.season ? s.season.round : null,
    type,
    label,
    oldValue,
    newValue
  });
  if (s.player.recordAlertLog.length > 200) {
    s.player.recordAlertLog.splice(0, s.player.recordAlertLog.length - 200);
  }
}

export function lastRecordAlerts(s) {
  const log = Array.isArray(s && s.player && s.player.recordAlertLog) ? s.player.recordAlertLog : [];
  if (!log.length) return [];
  const last = Math.max(...log.map((x) => Number(x.matchSeq) || 0));
  return log.filter((x) => (Number(x.matchSeq) || 0) === last);
}

export function seasonRecordAlerts(s, seasonId) {
  const log = Array.isArray(s && s.player && s.player.recordAlertLog) ? s.player.recordAlertLog : [];
  return log.filter((x) => x.seasonId === seasonId);
}

function updateRecords(s, win, kills, bankGain, cupChampion, meta = {}) {
  const rec = careerRecords(s);
  const matchSeq = Number.isFinite(Number(meta.matchSeq))
    ? Number(meta.matchSeq)
    : (Array.isArray(s.matchHistory) ? s.matchHistory.length : 0);
  const oldBestKills = Number(rec.bestKills) || 0;
  const newBestKills = Math.max(oldBestKills, kills || 0);
  if (newBestKills > oldBestKills) {
    addRecordAlert(s, matchSeq, 'bestKills', '单场最高击杀', oldBestKills, newBestKills);
  }
  rec.bestKills = newBestKills;
  rec.totalPrize = Math.round((Number(rec.totalPrize) || 0) + (bankGain || 0));
  if (win) {
    const oldStreak = Number(rec.longestWinStreak) || 0;
    const streak = currentWinStreak(s);
    if (streak > oldStreak) {
      rec.longestWinStreak = streak;
      addRecordAlert(s, matchSeq, 'longestWinStreak', '最长连胜', oldStreak, streak);
    } else {
      rec.longestWinStreak = Math.max(oldStreak, streak);
    }
    if (streak >= 5) unlockAchievement(s, 'streak5');
  }
  if (cupChampion) {
    const oldChampions = Number(rec.cupChampions) || 0;
    rec.cupChampions = oldChampions + 1;
    addRecordAlert(s, matchSeq, 'cupChampions', '杯赛冠军', oldChampions, oldChampions + 1);
    unlockAchievement(s, 'cup_champion');
  }
}

export function migrateCareerState(parsed) {
  if (!parsed.player) parsed.player = {};
  if (!parsed.team) parsed.team = {};
  if (!parsed.season) parsed.season = {};
  parsed.version = VERSION;
  parsed.goalHistory = Array.isArray(parsed.goalHistory) ? parsed.goalHistory : [];
  parsed.player.form = Array.isArray(parsed.player.form) ? parsed.player.form : [];
  parsed.player.fatigue = Number.isFinite(Number(parsed.player.fatigue)) ? Number(parsed.player.fatigue) : 0;
  parsed.player.achievements = Array.isArray(parsed.player.achievements) ? parsed.player.achievements : [];
  parsed.player.records = parsed.player.records && typeof parsed.player.records === 'object' ? parsed.player.records : {};
  parsed.player.recordAlertLog = Array.isArray(parsed.player.recordAlertLog) ? parsed.player.recordAlertLog : [];
  parsed.team.ledger = Array.isArray(parsed.team.ledger) ? parsed.team.ledger : [];
  parsed.team.morale = Number.isFinite(Number(parsed.team.morale)) ? parsed.team.morale : 65;
  parsed.team.rested = !!parsed.team.rested;
  parsed.team.pool = parsed.team.pool || null;
  parsed.team.trainingLog = Array.isArray(parsed.team.trainingLog) ? parsed.team.trainingLog : [];
  parsed.team.transferLog = Array.isArray(parsed.team.transferLog) ? parsed.team.transferLog : [];
  parsed.team.facilities = parsed.team.facilities && typeof parsed.team.facilities === 'object' ? parsed.team.facilities : { academy: 0, medical: 0, scouting: 0 };
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

function facilityLevel(s, key) {
  const facilities = s && s.team && s.team.facilities ? s.team.facilities : {};
  return Math.min(3, Number(facilities[key]) || 0);
}

export function facilityStatus(s) {
  const bank = Number(s.team && s.team.bank) || 0;
  return Object.keys(FACILITIES).map((key) => {
    const cfg = FACILITIES[key];
    const level = facilityLevel(s, key);
    const nextCost = Math.round(cfg.baseCost * (1 + level * 0.8));
    return {
      key,
      label: cfg.label,
      desc: cfg.desc,
      level,
      max: cfg.max,
      nextCost,
      affordable: level < cfg.max && bank >= nextCost,
      maxed: level >= cfg.max
    };
  });
}

export function upgradeFacility(key) {
  const s = getState();
  const cfg = FACILITIES[key];
  if (!cfg) return { ok: false, error: '设施不存在' };
  const level = facilityLevel(s, key);
  if (level >= cfg.max) return { ok: false, error: '该设施已满级' };
  const cost = Math.round(cfg.baseCost * (1 + level * 0.8));
  if (s.team.bank < cost) return { ok: false, error: '资金不足' };
  s.team.bank -= cost;
  s.team.facilities[key] = level + 1;
  addLedger(s, 'expense', -cost, '设施投资：' + cfg.label);
  addNews(s, 'info', cfg.label + '设施升级至 ' + (level + 1) + ' 级');
  save();
  return { ok: true, cost, level: level + 1 };
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

function teamStyleFor(rules) {
  if (rules.tacticalBias >= 0.6) return pick(['战术控图', '纪律防守', '变速反清']);
  if (rules.tacticalBias <= -0.2) return pick(['狂攻抢点', '青训冲劲', '快攻对枪']);
  return pick(STYLE_POOL);
}

function makeOpponentRoster(tag, rating, youthBias) {
  const names = TEAM_ROSTERS[tag] || Array.from({ length: 5 }, (_, i) => tag + ' ' + (i + 1));
  return names.map((name, i) => {
    const role = TEAM_ROLES[i % TEAM_ROLES.length];
    const anchor = i === 0 ? 2 : i === 1 ? 1 : i === 3 ? -2 : 0;
    const playerRating = clamp(Math.round(rating + anchor + randInt(-2, 2)), 45, 98);
    return {
      name,
      role,
      rating: playerRating,
      potential: Math.min(99, playerRating + randInt(2, 9)),
      youth: rng() < Math.max(0, Math.min(1, youthBias || 0))
    };
  });
}

function makePlayerRoster(roster, playerName) {
  const players = Array.isArray(roster) ? roster : [];
  const name = playerName || 'donk';
  return [
    { name, role: '突破', rating: 65, potential: 99, youth: true },
    ...players.map((p) => ({
      name: p.name || '队员',
      role: p.role || '补枪',
      rating: p.rating || 65,
      potential: p.potential || Math.min(99, (p.rating || 65) + 8),
      youth: !!p.youth
    }))
  ];
}

function buildTeamProfile(team, league, playerRoster, playerName) {
  const rules = leagueRules(league);
  const isPlayer = team.id === 'player';
  const roster = isPlayer
    ? makePlayerRoster(playerRoster, playerName)
    : Array.isArray(team.lineup) && team.lineup.length
      ? team.lineup
      : makeOpponentRoster(team.tag || team.name, Number(team.rating) || 70, rules.youthBias);
  const corePlayer = [...roster].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || null;
  const homeMap = team.homeMap || pick(MAP_IDS);
  const mapPrefs = Array.isArray(team.mapPrefs) && team.mapPrefs.length
    ? team.mapPrefs
    : [homeMap, ...pickUnique(MAP_IDS.filter((m) => m !== homeMap), 2)];
  const style = team.style || teamStyleFor(rules);
  const tactics = team.tactics || pick(TACTIC_POOL);
  const form = Array.isArray(team.form) && team.form.length
    ? team.form
    : [pick(['W', 'W', 'L']), pick(['W', 'L']), pick(['W', 'L'])];
  const youthCount = roster.filter((p) => p.youth).length;
  return {
    ...team,
    league,
    identity: rules.identity,
    competition: rules.competition,
    youthBias: rules.youthBias,
    tacticalBias: rules.tacticalBias,
    mediaPressure: rules.mediaPressure,
    lineup: roster,
    corePlayer,
    style,
    tactics,
    homeMap,
    mapPrefs,
    form: form.slice(-5),
    recentForm: team.recentForm || form.slice(-5).join(''),
    morale: clamp(Number(team.morale) || randInt(45, 85), 20, 100),
    aggression: clamp(Number(team.aggression) || Math.round(58 - rules.tacticalBias * 18 + randInt(-8, 8)), 15, 95),
    youthCount,
    status: team.status || (youthCount >= 3 ? '轮换' : '健康')
  };
}

export function teamProfile(s, teamId) {
  if (!s || !Array.isArray(s.season && s.season.teams)) return null;
  const team = s.season.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const league = (s.team && s.team.league) || '乙级';
  return buildTeamProfile(team, league, teamId === 'player' ? s.team && s.team.roster : null, s.player && s.player.name);
}

export function buildCareerTeams(league, playerRating, playerRoster, playerName) {
  return makeTeams(league, playerRating, playerRoster, playerName);
}

function makeTeams(league, playerRating, playerRoster, playerName) {
  const rules = leagueRules(league);
  const [lo, hi] = rules.ratingRange;
  const names = pickUnique(TEAM_POOL, 7);
  const teams = [{
    id: 'player',
    name: PLAYER_TEAM.name,
    tag: PLAYER_TEAM.tag,
    rating: playerRating,
    homeMap: pick(MAP_IDS)
  }];
  for (let i = 0; i < 7; i++) {
    teams.push({ id: 't' + (i + 1), name: names[i].name, tag: names[i].tag, rating: randInt(lo, hi), homeMap: pick(MAP_IDS) });
  }
  return teams.map((t) => buildTeamProfile(t, league, playerRoster, playerName));
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
  const teams = makeTeams('乙级', playerRating, roster, 'donk');
  const state = {
    version: VERSION,
    player: {
      name: 'donk', level: 1, xp: 0,
      attrs: { aim: 50, move: 50, react: 50, nade: 40 },
      seasonStats: { played: 0, w: 0, d: 0, l: 0, kills: 0, deaths: 0, mvp: 0 },
      form: [],
      fatigue: 0,
      achievements: [],
      records: {},
      recordAlertLog: []
    },
    team: {
      name: PLAYER_TEAM.name, league: '乙级', bank: 12000,
      roster, trainingLeft: 2, transfersLeft: 2, transferWindow: false, pool: null,
      ledger: [], trainingLog: [], transferLog: [], facilities: { academy: 0, medical: 0, scouting: 0 }, morale: 65, rested: false
    },
    season: {
      id: 1, round: 1, totalRounds: 14,
      teams, fixtures: makeFixtures(teams.map((t) => t.id)), standings: makeStandings(teams),
      cup: { phase: 'idle', bracket: [] }
    },
    history: [],
    goalHistory: [],
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
  const facilities = getState().team && getState().team.facilities ? getState().team.facilities : {};
  const scouting = Number(facilities.scouting) || 0;
  const basePotential = Number.isFinite(Number(c.potential)) ? Number(c.potential) : Math.min(96, rating + 5);
  const potential = Math.min(96, basePotential + scouting);
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

export function transferProfit(s) {
  const log = ensureTransferLog(s);
  const buys = log.filter((x) => x.type === 'buy');
  const sells = log.filter((x) => x.type === 'sell');
  const matched = new Set();
  let realized = 0;
  for (const sell of sells) {
    const idx = buys.findIndex((b, i) => !matched.has(i) && b.name === sell.name);
    if (idx >= 0) {
      matched.add(idx);
      realized += (Number(sell.refund) || 0) - (Number(buys[idx].cost) || 0);
    }
  }
  return {
    log: log.slice().reverse(),
    buysCount: buys.length,
    sellsCount: sells.length,
    totalBuyCost: buys.reduce((a, x) => a + (Number(x.cost) || 0), 0),
    totalRefund: sells.reduce((a, x) => a + (Number(x.refund) || 0), 0),
    realized,
    transactions: log.slice().reverse().slice(0, 10)
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
  const gained = Math.min(15, tier.points + facilityLevel(s, 'academy'));
  const fatigueGain = Math.max(1, (tier.fatigue || 3) - facilityLevel(s, 'medical'));
  s.team.bank -= tier.cost;
  s.player.attrs[attr] = Math.min(100, s.player.attrs[attr] + gained);
  s.player.fatigue = clamp(Number(s.player.fatigue) + fatigueGain, 0, 100);
  s.team.trainingLeft--;
  refreshPlayerRating(s);
  addLedger(s, 'expense', -tier.cost, '训练：' + attr);
  if (!Array.isArray(s.team.trainingLog)) s.team.trainingLog = [];
  s.team.trainingLog.push({ t: Date.now(), type: 'player', attr, tierKey: tier.key, label: tier.label, cost: tier.cost, gained });
  addNews(s, 'info', '训练完成：' + attr + ' +' + gained);
  save();
  return { ok: true };
}

export function trainingPreview(s, attr, tierKey) {
  const tier = TRAIN_TIERS.find((t) => t.key === tierKey);
  if (!tier || !s || !s.player || !s.player.attrs || !(attr in s.player.attrs)) return null;
  const before = Number(s.player.attrs[attr]) || 0;
  const gained = Math.min(15, tier.points + facilityLevel(s, 'academy'));
  const after = Math.min(100, before + gained);
  const fatigueGain = Math.max(1, (tier.fatigue || 3) - facilityLevel(s, 'medical'));
  const fatigueAfter = Math.min(100, (Number(s.player.fatigue) || 0) + fatigueGain);
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
  const gained = Math.min(15, tier.points + facilityLevel(s, 'academy'));
  s.team.bank -= tier.cost;
  p.rating = Math.min(97, p.rating + gained);
  s.team.trainingLeft--;
  refreshPlayerRating(s);
  addLedger(s, 'expense', -tier.cost, '训练：' + p.name);
  if (!Array.isArray(s.team.trainingLog)) s.team.trainingLog = [];
  s.team.trainingLog.push({ t: Date.now(), type: 'teammate', target: p.name, role: p.role, tierKey: tier.key, label: tier.label, cost: tier.cost, gained });
  addNews(s, 'info', '训练完成：' + p.name + ' rating +' + gained);
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
  ensureTransferLog(s).push({ type: 'sell', name: p.name, role: p.role, refund, round: s.season.round, t: Date.now() });
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
    ensureTransferLog(s).push({ type: 'sell', name: slot.name, role: slot.role, refund, round: s.season.round, t: Date.now() });
    s.team.bank += refund;
    slot.name = cand.name; slot.team = cand.team || s.team.name; slot.rating = cand.rating; slot.price = cand.price; slot.costBasis = cand.price; slot.potential = profile.potential; slot.youth = profile.youth; slot.contractYears = 3; slot.renewalCost = Math.round(cand.price * 0.12);
  } else {
    s.team.roster.push({ id: 'r' + Date.now(), name: cand.name, team: cand.team || s.team.name, role: cand.role, rating: cand.rating, price: cand.price, costBasis: cand.price, potential: profile.potential, youth: profile.youth, contractYears: 3, renewalCost: Math.round(cand.price * 0.12) });
  }
  s.team.bank -= cand.price;
  ensureTransferLog(s).push({ type: 'buy', name: cand.name, role: cand.role, cost: cand.price, round: s.season.round, t: Date.now() });
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

export function cupPrizeInfo(s) {
  const rules = leagueRules(s && s.team && s.team.league);
  const perRound = rules.cupRoundPrize;
  const champion = rules.cupFinalPrize;
  return {
    perRound,
    champion,
    finalTotal: perRound + champion,
    rounds: [
      { key: 'QF', label: '八强', prize: perRound, map: cupMapForRound('QF') },
      { key: 'SF', label: '四强', prize: perRound, map: cupMapForRound('SF') },
      { key: 'F', label: '决赛', prize: perRound + champion, map: cupMapForRound('F') }
    ]
  };
}

export function cupPreview(s) {
  const rules = leagueRules(s && s.team && s.team.league);
  const b = s.season && s.season.cup && Array.isArray(s.season.cup.bracket) ? s.season.cup.bracket : [];
  return b.map((m) => ({
    round: m.round,
    roundName: cupMapForRound(m.round) ? (m.round === 'QF' ? '八强' : m.round === 'SF' ? '四强' : '决赛') : m.round,
    a: m.a,
    b: m.b,
    map: cupMapForRound(m.round),
    prize: cupPrizeFor(rules.key, m.round),
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

function simFormScore(form) {
  if (!Array.isArray(form)) return 0;
  let score = 0;
  for (const f of form) {
    if (f === 'W' || f === true || f === 1) score += 1;
    else if (f === 'L' || f === false || f === 0) score -= 1;
  }
  return clamp(score * 1.1, -6, 6);
}

function simLineup(team) {
  const lineup = Array.isArray(team && team.lineup) && team.lineup.length ? team.lineup : [];
  if (!lineup.length) {
    const base = Number(team && team.rating) || 70;
    return TEAM_ROLES.map((role, i) => ({
      name: (team && team.name || '战队') + ' ' + (i + 1),
      role,
      rating: clamp(base + (i === 0 ? 2 : i === 1 ? 1 : 0) - i * 2, 35, 99),
      youth: false
    }));
  }
  return lineup.slice(0, 5);
}

function simTeamPower(team, side, opts = {}) {
  const lineup = simLineup(team);
  const avg = lineup.reduce((a, p) => a + (Number(p.rating) || 0), 0) / Math.max(1, lineup.length);
  const base = Number(team && team.rating) || 70;
  const form = simFormScore(team && team.form);
  const morale = ((Number(team && team.morale) || 50) - 50) * 0.12;
  const aggression = (clamp(Number(team && team.aggression) || 50, 15, 95) - 50) * 0.04;
  const fatigue = opts.fatigue && opts.fatigue[team.id] ? -Number(opts.fatigue[team.id]) : 0;
  const home = opts.homeId === team.id ? 2 : 0;
  const youth = (Number(team && team.youthCount) || 0) * (opts.rules && opts.rules.youthBias > 0.5 ? 0.8 : -0.35);
  const tactical = opts.rules && opts.rules.tacticalBias > 0 ? (team.tactics === '纪律防守' || team.tactics === '控图磨血' ? 1.2 : 0) : 0;
  const sideBonus = side === 'attack'
    ? (team.style === '快攻抢点' || team.style === '青训冲劲' || team.style === '狂攻抢点' ? 3 : 0) + aggression
    : (team.tactics === '默认防守' || team.tactics === '纪律防守' ? 2.5 : 0) - aggression * 0.5;
  return clamp(base * 0.65 + avg * 0.35 + form + morale + fatigue + home + youth + tactical + sideBonus, 35, 112);
}

function simSiteWeights(team, mapId) {
  const prefs = Array.isArray(team && team.mapPrefs) ? team.mapPrefs : [];
  const idx = prefs.indexOf(mapId);
  const bonus = idx === 0 ? 0.7 : idx === 1 ? 0.35 : 0;
  const aggressive = (Number(team && team.aggression) || 50) > 62 ? 0.3 : 0;
  return [1 + bonus + aggressive, 1 + (idx === 0 ? 0 : idx === 1 ? bonus : 0)];
}

function pickSite(attacker, options) {
  const weights = simSiteWeights(attacker, options.mapId);
  const total = weights[0] + weights[1];
  return rng() < weights[0] / total ? 'A' : 'B';
}

function simDuelWin(entry, anchor, attackPower, defensePower) {
  return clamp(0.5 + (Number(entry.rating) - Number(anchor.rating)) * 0.006 + (attackPower - defensePower) * 0.006, 0.12, 0.92);
}

function simStatKey(teamId, name) {
  return teamId + '|' + name;
}

function recordSimKill(stats, teamId, name, role, rating, damage = 85) {
  const key = simStatKey(teamId, name);
  if (!stats[key]) stats[key] = { teamId, name, role: role || '补枪', rating: rating || 65, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 };
  stats[key].kills++;
  stats[key].dmg += damage;
  return stats[key];
}

function recordSimDeath(stats, teamId, name, role, rating) {
  const key = simStatKey(teamId, name);
  if (!stats[key]) stats[key] = { teamId, name, role: role || '补枪', rating: rating || 65, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 };
  stats[key].deaths++;
  return stats[key];
}

function recordSimAct(stats, teamId, name, role, rating, act) {
  const key = simStatKey(teamId, name);
  if (!stats[key]) stats[key] = { teamId, name, role: role || '补枪', rating: rating || 65, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 };
  stats[key][act]++;
  return stats[key];
}

function simulateCareerRound(index, home, away, options, stats) {
  const attacker = index % 2 === 0 ? home : away;
  const defender = attacker === home ? away : home;
  const site = pickSite(attacker, options);
  const tactic = (attacker && attacker.tactics) || '默认进攻';
  const events = [{
    t: 'opening',
    side: attacker.id,
    site,
    tactic,
    text: attacker.name + ' 选择 ' + site + ' 点，战术 ' + tactic
  }];
  const attackPower = simTeamPower(attacker, 'attack', options);
  const defensePower = simTeamPower(defender, 'defense', options);
  if (rng() < clamp(0.45 + (Number(attacker.aggression) || 50) * 0.002, 0.15, 0.9)) {
    const kind = pick(['烟雾', '闪光', '手雷']);
    events.push({ t: 'utility', side: attacker.id, site, kind, text: attacker.name + ' 使用 ' + kind + ' 控制 ' + site + ' 点入口' });
  }
  const entry = attacker.lineup && attacker.lineup[0] || simLineup(attacker)[0];
  const anchor = (defender.lineup || simLineup(defender)).find((p) => p.role === '指挥') || (defender.lineup || simLineup(defender)).slice(-1)[0];
  const entryWin = rng() < simDuelWin(entry, anchor, attackPower, defensePower);
  const duelWinner = entryWin ? attacker : defender;
  const duelLoser = entryWin ? defender : attacker;
  const winnerPlayer = entryWin ? entry : anchor;
  const loserPlayer = entryWin ? anchor : entry;
  recordSimKill(stats, duelWinner.id, winnerPlayer.name, winnerPlayer.role, winnerPlayer.rating);
  recordSimDeath(stats, duelLoser.id, loserPlayer.name, loserPlayer.role, loserPlayer.rating);
  events.push({
    t: 'duel',
    side: duelWinner.id,
    site,
    winnerName: winnerPlayer.name,
    loserName: loserPlayer.name,
    text: winnerPlayer.name + ' 对位击败 ' + loserPlayer.name
  });
  const siteControl = rng() < clamp(0.5 + (attackPower - defensePower) * 0.01 + (entryWin ? 0.12 : 0) - (defender.tactics === '默认防守' ? 0.05 : 0), 0.22, 0.92);
  events.push({ t: 'site_control', side: siteControl ? attacker.id : defender.id, site, text: (siteControl ? attacker.name : defender.name) + ' 控制 ' + site + ' 点' });
  let winner;
  if (!siteControl) {
    winner = rng() < clamp(0.5 + (attackPower - defensePower) * 0.01 - 0.12, 0.18, 0.88) ? attacker : defender;
    events.push({ t: 'elimination', side: winner.id, site, text: winner.name + ' 在残局中清空 ' + site + ' 点' });
  } else {
    const planter = (attacker.lineup || simLineup(attacker))[Math.floor(rng() * (attacker.lineup || simLineup(attacker)).length)];
    const planted = rng() < clamp(0.55 + (Number(attacker.aggression) || 50) * 0.002 + (attacker.style === '道具压制' ? 0.12 : 0), 0.35, 0.96);
    if (!planted) {
      winner = defender;
      events.push({ t: 'elimination', side: defender.id, site, text: defender.name + ' 在安放前击溃 ' + attacker.name + ' 的进攻' });
    } else {
      recordSimAct(stats, attacker.id, planter.name, planter.role, planter.rating, 'plants');
      events.push({ t: 'plant', side: attacker.id, site, planter: planter.name, text: planter.name + ' 在 ' + site + ' 点安放 C4' });
      const retake = rng() < clamp(0.42 + (defensePower - attackPower) * 0.012 + (defender.tactics === '后保残局' ? 0.1 : 0), 0.18, 0.88);
      if (!retake) {
        winner = attacker;
        events.push({ t: 'post_plant', side: attacker.id, site, text: attacker.name + ' 用枪线与道具守住 ' + site + ' 点' });
      } else {
        const defuser = (defender.lineup || simLineup(defender))[Math.floor(rng() * (defender.lineup || simLineup(defender)).length)];
        const defused = rng() < clamp(0.5 + (defensePower - attackPower) * 0.01 - (Number(attacker.aggression) || 50) * 0.002, 0.15, 0.92);
        if (defused) {
          recordSimAct(stats, defender.id, defuser.name, defuser.role, defuser.rating, 'defuses');
          winner = defender;
          events.push({ t: 'defuse', side: defender.id, site, defuser: defuser.name, text: defuser.name + ' 拆掉 ' + site + ' 点的 C4' });
        } else {
          const clutchPlayer = (attacker.lineup || simLineup(attacker)).find((p) => p.role === '自由人') || entry;
          recordSimKill(stats, attacker.id, clutchPlayer.name, clutchPlayer.role, clutchPlayer.rating);
          recordSimDeath(stats, defender.id, defuser.name, defuser.role, defuser.rating);
          recordSimAct(stats, attacker.id, clutchPlayer.name, clutchPlayer.role, clutchPlayer.rating, 'clutches');
          winner = attacker;
          events.push({ t: 'clutch', side: attacker.id, site, player: clutchPlayer.name, text: clutchPlayer.name + ' 完成 ' + site + ' 点残局' });
        }
      }
    }
  }
  const round = index + 1;
  events.push({ t: 'round_end', side: winner.id, round, text: winner.name + ' 赢下第 ' + round + ' 回合' });
  return { round, attacker: attacker.id, defender: defender.id, site, tactic, winner: winner.id, events, stats: {} };
}

export function simulateCareerMatch(home, away, options = {}) {
  const homeTeam = home || { id: 'player', name: '主队', rating: 70 };
  const awayTeam = away || { id: 'away', name: '客队', rating: 70 };
  const rules = leagueRules(options.league || '乙级');
  const need = options.rounds || ROUND.MATCH_WIN;
  const maxRounds = need * 2 - 1;
  const stats = {};
  const rounds = [];
  let homeScore = 0;
  let awayScore = 0;
  const simOptions = { ...options, rules, homeId: homeTeam.id };
  for (let i = 0; i < maxRounds && homeScore < need && awayScore < need; i++) {
    const r = simulateCareerRound(i, homeTeam, awayTeam, simOptions, stats);
    rounds.push(r);
    if (r.winner === homeTeam.id) homeScore++; else awayScore++;
  }
  const players = Object.values(stats).map((p) => ({ ...p })).sort((a, b) => b.kills - a.kills || b.dmg - a.dmg);
  const mvp = players.slice().sort((a, b) =>
    (b.kills * 2 + b.dmg / 100 + b.plants + b.defuses + b.clutches * 2) -
    (a.kills * 2 + a.dmg / 100 + a.plants + a.defuses + a.clutches * 2)
  )[0] || null;
  const winnerId = homeScore >= awayScore ? homeTeam.id : awayTeam.id;
  return {
    mapId: options.mapId || (homeTeam.homeMap || 'dust2'),
    league: rules.key,
    homeId: homeTeam.id,
    awayId: awayTeam.id,
    score: [homeScore, awayScore],
    winner: winnerId,
    rounds,
    timeline: rounds.flatMap((r) => r.events.map((e) => ({ ...e, round: r.round }))),
    players,
    mvp,
    totalKills: players.reduce((a, p) => a + p.kills, 0),
    totalDamage: players.reduce((a, p) => a + p.dmg, 0)
  };
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
    const r = simulateCareerMatch(home, away, {
      mapId: fixtureMapFor(s, f),
      league: s.team.league,
      homeId: f.home
    });
    f.simRounds = r.rounds.length;
    markFixture(s, f, r.score, r.winner);
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
    const r = simulateCareerMatch(home, away, {
      mapId: cupMapForRound(m.round),
      league: s.team.league,
      homeId: m.a
    });
    m.played = true;
    m.score = r.score;
    m.winner = r.winner;
    m.simRounds = r.rounds.length;
    refreshCup(s);
  }
}

export function applyPlayerResult(s, r) {
  const rules = leagueRules(s.team.league);
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
  s.player.fatigue = clamp(Number(s.player.fatigue) + Math.max(1, (isCup ? 10 : 6) + (win ? 0 : 2) - facilityLevel(s, 'medical') * 2), 0, 100);
  s.team.morale = clamp(Number(s.team.morale) + (win ? 4 : -3) + (mvp ? 2 : 0) + (isCup && win ? 3 : 0), 20, 100);
  s.team.rested = false;
  refreshPlayerRating(s);
  let bankGain = 0;
  let ticket = 0;
  if (!noReward) {
    bankGain = (win ? rules.matchWin : rules.matchLose) + (mvp ? rules.mvpBonus : 0);
    gainXp(s, (win ? 300 : 50) + kills * 10 + (mvp ? 100 : 0));
  }
  if (isCup) {
    const m = findCupMatch(s);
    if (m) {
      const cupWin = win;
      markCupMatch(s, m, score, cupWin);
      simulateRemainingCup(s);
      if (cupWin && !noReward) {
        const roundPrize = cupPrizeFor(s.team.league, m.round);
        bankGain += roundPrize;
        s.season.cupPrizeEarned = (s.season.cupPrizeEarned || 0) + roundPrize;
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
  const f = !isCup ? findPlayerFixture(s) : null;
  const venue = isCup ? 'home' : (f && f.home === 'player' ? 'home' : 'away');
  if (venue === 'home' && !noReward) ticket = homeTicketIncome(s, win);
  s.team.bank += bankGain + sponsor + ticket;
  if (bankGain) addLedger(s, 'income', bankGain, '比赛奖金');
  if (sponsor) addLedger(s, 'income', sponsor, '赞助收入');
  if (ticket) addLedger(s, 'income', ticket, '主场票房');
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
    importance: matchImportanceLabel,
    rounds: Array.isArray(r.rounds) ? r.rounds : undefined,
    timeline: Array.isArray(r.timeline) ? r.timeline : undefined,
    players: Array.isArray(r.players) ? r.players : undefined
  });
  if (s.matchHistory.length > 500) s.matchHistory.splice(0, s.matchHistory.length - 500);
  updateRecords(s, win, kills, bankGain + sponsor + ticket, isCup && s.season.cup.champion === 'player', { matchSeq: s.matchHistory.length });
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

export function goalAdvice(s) {
  const goals = seasonGoals(s);
  const progress = goalProgress(s);
  const rel = relegationProjection(s);
  const cupPhase = s.season.cup.phase;
  const cupAlive = cupPhase === 'active' && !!findCupMatch(s);
  const rankOnTrack = goals.currentRank <= goals.rankGoal ||
    (progress.projectedRank != null && progress.projectedRank <= goals.rankGoal);
  const cupOnTrack = goals.cupGoal === 0 ||
    (goals.currentCupRound >= 0 && goals.currentCupRound >= goals.cupGoal);
  const lines = [];
  let priority = '联赛目标';
  if (!rankOnTrack && rel && rel.relegationRisk) {
    priority = '保级优先';
    lines.push('当前保级风险高，剩余 ' + rel.remaining + ' 场至少追回 ' + rel.pointsToSafety + ' 分，优先稳守后场');
  } else if (!rankOnTrack) {
    priority = '争排名';
    lines.push('距目标前 ' + goals.rankGoal + ' 还差 ' + progress.rankPointsGap + ' 分，剩余 ' + progress.remaining + ' 场可冲击');
  } else {
    lines.push('联赛排名已进入目标区，保持现有赛程节奏即可');
  }
  if (cupAlive && !cupOnTrack) {
    priority = '杯赛优先';
    lines.push('杯赛仍在进行且尚未达到目标，本场应以杯赛晋级为第一优先级');
  } else if (cupPhase === 'active' && !cupAlive) {
    lines.push('杯赛已淘汰，剩余联赛轮次决定最终排名');
  } else if (cupPhase === 'idle') {
    lines.push('杯赛第 14 轮后开启，联赛轮次可同步为杯赛练兵');
  }
  if (rel && rel.pointsToPromotion > 0 && !rel.relegationRisk) {
    lines.push('距升级区 ' + rel.pointsToPromotion + ' 分，可尝试在关键轮次前争取连胜');
  }
  return {
    priority,
    onTrack: rankOnTrack && cupOnTrack,
    rankGap: progress.rankPointsGap,
    cupGap: goals.cupGoal - Math.max(0, goals.currentCupRound),
    lines: lines.slice(0, 3)
  };
}

export function seasonReport() {
  const s = getState();
  const list = sortedStandings(s);
  const rank = list.findIndex((x) => x.teamId === 'player') + 1;
  const rankPrize = rankPrizeFor(s.team.league, rank);
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
    impact: m.mvp ? 'MVP' : (m.win ? '胜利' : '失利'),
    rounds: Array.isArray(m.rounds) ? m.rounds : [],
    timeline: Array.isArray(m.timeline) ? m.timeline : [],
    players: Array.isArray(m.players) ? m.players : []
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
  if (!Array.isArray(s.goalHistory)) s.goalHistory = [];
  s.goalHistory.push({
    seasonId: s.season.id,
    league: report.league,
    rankGoal: goals.rankGoal,
    cupGoal: goals.cupGoal,
    reward: goals.reward,
    achieved: goals.achieved,
    rank: report.rank,
    cupRound: report.cupRound
  });
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
  const teams = makeTeams(s.team.league, effectiveTeamRating(s), s.team.roster, s.player.name);
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
  const mapId = pm.isCup ? cupMap(s) : fixtureMapFor(s, f);
  const playerTeamSim = { ...playerTeam, rating: effectiveTeamRating(s), form: [], morale: 50 };
  const simHome = venue === 'home' ? playerTeamSim : opp;
  const simAway = venue === 'home' ? opp : playerTeamSim;
  const r = simulateCareerMatch(simHome, simAway, {
    mapId,
    league: s.team.league,
    homeId: simHome.id
  });
  const win = r.winner === 'player';
  const score = venue === 'home' ? r.score : [r.score[1], r.score[0]];
  const playerStat = r.players.find((p) => p.teamId === 'player' && p.name === s.player.name) || r.players.find((p) => p.teamId === 'player') || { kills: 0, deaths: 0, dmg: 0 };
  const kills = playerStat.kills || 0;
  const deaths = playerStat.deaths || 0;
  const dmg = Math.round(playerStat.dmg || 0);
  const top = r.players.slice().sort((a, b) =>
    (b.kills * 2 + b.dmg / 100 + b.plants + b.defuses + b.clutches * 2) -
    (a.kills * 2 + a.dmg / 100 + a.plants + a.defuses + a.clutches * 2)
  )[0] || null;
  const mvp = !!top && top.teamId === 'player';
  applyPlayerResult(s, { win, kills, deaths, mvp, score, dmg, rounds: r.rounds, timeline: r.timeline, players: r.players, isCup: !!pm.isCup });
  s.pendingMatch = null;
  save();
  return { ok: true, win, kills, deaths, dmg, mvp, score, rounds: r.rounds, timeline: r.timeline };
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
