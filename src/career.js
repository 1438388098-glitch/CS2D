import { ROUND } from './config.js';
import {registerMode} from './registry.js';
import {setupMatchEntities, startRound, startMatch} from './game.js';
import {teamDiffParams, simScore} from './modes.js';

const SAVE_KEY = 'cs2d_career';
const BACKUP_KEY = 'cs2d_career_backup';
const VERSION = 2; // v2：旧档重建，使用真实战队/选手中文信息
const MAP_IDS = ['dust2', 'canal', 'metro', 'forge'];
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
  { key: 'basic', label: '基础', cost: 500, points: 2 },
  { key: 'pro', label: '进阶', cost: 1200, points: 6 },
  { key: 'elite', label: '精英', cost: 2500, points: 15 }
];
const PRIZE = { 1: 30000, 2: 20000, 3: 15000, 4: 8000, 5: 8000, 6: 8000, 7: 4000, 8: 4000 };
const LEAGUE_RATING = { '甲级': [80, 92], '乙级': [70, 85], '丙级': [60, 74] };
const TITLES = ['新兵', '列兵', '下士', '中士', '上尉', '少校', '上校', '准将', '少将', '中将', '上将', '传奇'];

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
  return effectiveRatingFor(s.team.roster, s.player.attrs);
}
function refreshPlayerRating(s) {
  const t = s.season.teams.find((x) => x.id === 'player');
  if (t) t.rating = effectiveTeamRating(s);
}

export function xpNeeded(level) { return level * 500; }
export function titleFor(level) { return TITLES[Math.max(0, Math.min(level - 1, TITLES.length - 1))]; }
export function trainingTiers() { return TRAIN_TIERS.map((t) => ({ ...t })); }

function makeRoster() {
  return ROLES.map((role, i) => {
    const rating = randInt(60, 75);
    return { id: 'r' + (i + 1), name: PLAYER_LINEUP[i], team: PLAYER_TEAM.name, role, rating, price: playerPrice(rating) };
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

function makeStandings(teams) {
  return teams.map((t) => ({ teamId: t.id, played: 0, w: 0, d: 0, l: 0, pts: 0 }));
}

function makeCup(teams) {
  const sorted = [...teams].sort((a, b) => b.rating - a.rating);
  const qf = [[sorted[0], sorted[7]], [sorted[3], sorted[4]], [sorted[2], sorted[5]], [sorted[1], sorted[6]]];
  const bracket = qf.map(([a, b]) => ({ round: 'QF', a: a.id, b: b.id, score: null, played: false, winner: null }));
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
      out.push({ id: 'c' + (idx + 1), name: CAND_NAMES[pi], team: teamDisplay(CAND_TEAMS[pi]), role, rating, price: playerPrice(rating) });
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
  return {
    version: VERSION,
    player: {
      name: 'donk', level: 1, xp: 0,
      attrs: { aim: 50, move: 50, react: 50, nade: 40 },
      seasonStats: { played: 0, w: 0, d: 0, l: 0, kills: 0, deaths: 0, mvp: 0 }
    },
    team: {
      name: PLAYER_TEAM.name, league: '乙级', bank: 12000,
      roster, trainingLeft: 2, transfersLeft: 2, transferWindow: false, pool: null
    },
    season: {
      id: 1, round: 1, totalRounds: 14,
      teams, fixtures: makeFixtures(teams.map((t) => t.id)), standings: makeStandings(teams),
      cup: { phase: 'idle', bracket: [] }
    },
    history: [],
    news: []
  };
}

export function loadCareer() {
  if (state) return state;
  const raw = read(SAVE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === VERSION && parsed.season && parsed.team && parsed.player) {
        state = parsed;
        if (!state.team.pool) state.team.pool = null;
        if (!state.season.cup) state.season.cup = { phase: 'idle', bracket: [] };
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
export function transferWindowOpen(s) { return s.season.round >= 5 && s.season.round <= 8; }

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
  s.team.trainingLeft--;
  refreshPlayerRating(s);
  addNews(s, 'info', '训练完成：' + attr + ' +' + tier.points);
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
  s.team.bank += Math.floor(p.price * 0.5);
  s.team.roster.splice(idx, 1);
  s.team.transfersLeft--;
  refreshPlayerRating(s);
  addNews(s, 'info', '卖出 ' + p.name + '，返还 ' + Math.floor(p.price * 0.5));
  save();
  return { ok: true, refund: Math.floor(p.price * 0.5) };
}

export function buyPlayer(candId) {
  const s = getState();
  if (!transferWindowOpen(s)) return { ok: false, error: '转会窗未开放' };
  if (s.team.transfersLeft <= 0) return { ok: false, error: '转会次数已用完' };
  candidates();
  const cand = s.team.pool.find((c) => c.id === candId);
  if (!cand) return { ok: false, error: '候选不存在' };
  if (s.team.bank < cand.price) return { ok: false, error: '资金不足' };
  let refund = 0;
  let slot = s.team.roster.find((p) => p.role === cand.role && p.id !== cand.id);
  if (slot) {
    refund = Math.floor(slot.price * 0.5);
    s.team.bank += refund;
    slot.name = cand.name; slot.team = cand.team || s.team.name; slot.rating = cand.rating; slot.price = cand.price;
  } else {
    s.team.roster.push({ id: 'r' + Date.now(), name: cand.name, team: cand.team || s.team.name, role: cand.role, rating: cand.rating, price: cand.price });
  }
  s.team.bank -= cand.price;
  s.team.transfersLeft--;
  s.team.pool = s.team.pool.filter((c) => c.id !== candId);
  refreshPlayerRating(s);
  addNews(s, 'info', '买入 ' + cand.name + '（' + cand.role + '）' + (refund ? '，替换返还 ' + refund : ''));
  save();
  return { ok: true, refund };
}

export function findPlayerFixture(s) {
  return s.season.fixtures.find((f) => f.round === s.season.round && !f.played && (f.home === 'player' || f.away === 'player'));
}
export function findCupMatch(s) {
  const b = s.season.cup.bracket;
  return b.find((m) => !m.played && (m.a === 'player' || m.b === 'player'));
}
export function nextMatch(s) {
  if (s.season.cup.phase === 'active') return findCupMatch(s);
  return findPlayerFixture(s);
}
export function cupMap(s) {
  // 杯赛地图按轮次固定：八强 dust2、四强 canal、决赛 metro（避免连续场次重复地图）
  const m = findCupMatch(s);
  const order = { QF: 0, SF: 1, F: 2 };
  return MAP_IDS[order[m && m.round] != null ? order[m.round] : 0];
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
      s.season.cup = makeCup(s.season.teams);
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
  s.player.seasonStats.played++;
  if (win) s.player.seasonStats.w++; else s.player.seasonStats.l++;
  s.player.seasonStats.kills += kills;
  s.player.seasonStats.deaths += deaths;
  if (mvp) s.player.seasonStats.mvp++;
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
  s.team.bank += bankGain;
  s.team.trainingLeft = 2;
  if (noReward) {
    addNews(s, 'info', '放弃本场（' + (isCup ? '杯赛' : '联赛') + '）');
  } else {
    addNews(s, win ? 'win' : 'lose', (isCup ? '杯赛' : '联赛') + (win ? '胜利' : '失利') + '，奖金 ' + bankGain);
  }
  return { bankGain };
}

export function startCareerMatch(game, oppId, venue, isCup) {
  const s = getState();
  if (!isCup) {
    const f = findPlayerFixture(s);
    if (!f) return { ok: false, error: '\u5f53\u524d\u8f6e\u6b21\u6ca1\u6709\u5f85\u6253\u6bd4\u8d5b' };
    const expected = f.home === 'player' ? f.away : f.home;
    if (expected !== oppId) return { ok: false, error: '\u53ea\u80fd\u5f00\u59cb\u5f53\u524d\u8f6e\u6b21\u7684\u6bd4\u8d5b' };
  } else {
    const m = findCupMatch(s);
    if (!m || (m.a !== 'player' && m.b !== 'player')) return { ok: false, error: '\u5f53\u524d\u676f\u8d5b\u6ca1\u6709\u5f85\u6253\u6bd4\u8d5b' };
    const expected = m.a === 'player' ? m.b : m.a;
    if (expected !== oppId) return { ok: false, error: '\u53ea\u80fd\u5f00\u59cb\u5f53\u524d\u676f\u8d5b' };
  }
  s.pendingMatch = { oppId, venue, isCup: !!isCup };
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
  game.opts.mapId = pm.isCup ? cupMap(s) : (venue === 'home' ? playerTeam.homeMap : opp.homeMap);
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
  const avg = effectiveRatingFor(roster, s.player.attrs);
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
  const a = s.player.attrs;
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

export function seasonReport() {
  const s = getState();
  const list = sortedStandings(s);
  const rank = list.findIndex((x) => x.teamId === 'player') + 1;
  const rankPrize = PRIZE[rank] || 0;
  const cupPrize = s.season.cupPrizeEarned || 0;
  const cupRound = s.season.cupResult === undefined ? 0 : s.season.cupResult;
  return { league: s.team.league, rank, rankPrize, cupPrize, cupRound, prize: rankPrize + cupPrize, standings: list };
}

function promoteLeague(league, rank) {
  if (league === '甲级') return rank >= 7 ? '乙级' : '甲级';
  if (league === '乙级') return rank <= 2 ? '甲级' : (rank >= 7 ? '丙级' : '乙级');
  return rank <= 2 ? '乙级' : '丙级';
}

export function nextSeason() {
  const s = getState();
  const report = seasonReport();
  s.team.bank += report.rankPrize;
  s.history.push({ seasonId: s.season.id, league: report.league, rank: report.rank, cupRound: report.cupRound, prize: report.prize });
  addNews(s, 'info', '第 ' + s.season.id + ' 赛季结束：第 ' + report.rank + ' 名，总奖金 ' + report.prize);
  s.team.league = promoteLeague(report.league, report.rank);
  s.season.id++;
  s.season.round = 1;
  s.team.transfersLeft = 2;
  s.team.transferWindow = false;
  s.team.trainingLeft = 2;
  s.team.pool = null;
  s.player.seasonStats = { played: 0, w: 0, d: 0, l: 0, kills: 0, deaths: 0, mvp: 0 };
  const teams = makeTeams(s.team.league, effectiveTeamRating(s));
  s.season.teams = teams;
  s.season.fixtures = makeFixtures(teams.map((t) => t.id));
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