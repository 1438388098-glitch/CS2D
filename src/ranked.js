import { ROUND } from './config.js';
import { registerMode } from './registry.js';
import { setupMatchEntities, startRound, startMatch } from './game.js';
import { teamDiffParams, simScore } from './modes.js';
import { computePerformanceScore, computeMvp } from './mvp-score.js';

const SAVE_KEY = 'cs2d_ranked';
const BACKUP_KEY = 'cs2d_ranked_backup';
const VERSION = 1;
const MAP_IDS = ['dust2', 'canal', 'metro', 'forge'];
const TIERS = [
  { key: 'bronze', label: '青铜', min: 0, width: 1000 },
  { key: 'silver', label: '白银', min: 1000, width: 200 },
  { key: 'gold', label: '黄金', min: 1200, width: 200 },
  { key: 'platinum', label: '铂金', min: 1400, width: 200 },
  { key: 'diamond', label: '钻石', min: 1600, width: 200 },
  { key: 'master', label: '大师', min: 1800, width: 200 },
  { key: 'grandmaster', label: '宗师', min: 2000, width: 400 }
];
const OPP_TEAMS = [
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
const OPP_ROSTERS = {
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
  COL: ['EliGE', 'JT', 'floppy', 'hallzerk', 'Grim']
};
const PLAYER_BOTS = ['sh1ro', 'chopper', 'magixx', 'zont1x'];

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
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function tierOf(mmr) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (mmr >= TIERS[i].min) return { ...TIERS[i], index: i };
  }
  return { ...TIERS[0], index: 0 };
}
export function divisionOf(mmr, tier) {
  const span = Math.max(1, tier.width);
  return Math.min(4, Math.max(1, Math.floor((mmr - tier.min) / (span / 4)) + 1));
}
export function tierLadder() {
  return TIERS.map((t) => ({ ...t }));
}
export function playerRating(s) {
  const mmr = s.player.mmr > 0 ? s.player.mmr : 1150;
  return Math.round(65 + mmr / 80);
}

export function newRankedState() {
  return {
    version: VERSION,
    player: {
      name: '玩家',
      mmr: 0,
      placement: { left: 5, wins: 0, kills: 0, deaths: 0 },
      stats: { played: 0, w: 0, l: 0, kills: 0, deaths: 0, mvp: 0, streak: 0, bestStreak: 0, lossStreak: 0 },
      history: [],
      next: null
    }
  };
}

export function save() {
  if (!state) return false;
  return write(SAVE_KEY, JSON.stringify(state));
}

export function loadRanked() {
  if (state) return state;
  const raw = read(SAVE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === VERSION && parsed.player) {
        state = parsed;
        if (!state.player.history) state.player.history = [];
        if (!state.player.stats) state.player.stats = { played: 0, w: 0, l: 0, kills: 0, deaths: 0, mvp: 0, streak: 0, bestStreak: 0, lossStreak: 0 };
        if (!state.player.stats.lossStreak) state.player.stats.lossStreak = 0;
        return state;
      }
    } catch (e) { /* fallthrough */ }
    write(BACKUP_KEY, raw);
  }
  state = newRankedState();
  save();
  return state;
}

export function getState() { return state || loadRanked(); }
export function resetRanked() {
  state = newRankedState();
  save();
  return state;
}
export function __clearStateForTest() { state = null; }

function nextOpponent(s) {
  const base = s.player.mmr > 0 ? s.player.mmr : 1150;
  // 分段匹配：优先 ±60 带内对手（胜率接近、对局更真实），80% 概率留在同段
  const tight = rng() < 0.8 ? 60 : 180;
  const rating = clamp(Math.round(base + rng() * tight * 2 - tight), 800, 2400);
  const team = pick(OPP_TEAMS);
  return { oppName: team.name, oppTag: team.tag, oppMmr: rating, mapId: pick(MAP_IDS), settled: false };
}

export function makePending(s) {
  if (!s.next) s.next = nextOpponent(s);
  return s.next;
}

export function startRankedMatch(game) {
  const s = loadRanked();
  makePending(s);
  save();
  game.opts.mode = 'ranked';
  startMatch(game);
}

function rankedStart(game) {
  const s = loadRanked();
  const pending = makePending(s);
  game.rankedMatch = { settled: false, oppName: pending.oppName, oppTag: pending.oppTag, oppMmr: pending.oppMmr, mapId: pending.mapId };
  game.opts.mapId = pending.mapId;
  game.opts.team = 't';
  game.opts.bots = 4;
  game.opts.diff = 'hard';
  game.opts.diffParams = teamDiffParams({ rating: pending.oppMmr });
  game.noRoundEnd = false;
  setupMatchEntities(game);
  const teamBots = game.entities.filter((e) => e.bot && e.team === 't');
  const enemyBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  const friendParams = teamDiffParams({ rating: playerRating(s) });
  const foeParams = teamDiffParams({ rating: pending.oppMmr });
  const foeRoster = OPP_ROSTERS[pending.oppTag] || OPP_ROSTERS.NAVI;
  teamBots.forEach((e, i) => {
    e.name = PLAYER_BOTS[i % PLAYER_BOTS.length];
    e.aiParams = { ...friendParams };
  });
  enemyBots.forEach((e, i) => {
    e.name = foeRoster[i % foeRoster.length];
    e.aiParams = { ...foeParams };
  });
  startRound(game);
}

function addHistory(s, r) {
  const entry = {
    t: Date.now(),
    oppName: r.oppName,
    oppMmr: r.oppMmr,
    mapId: r.mapId,
    score: r.score,
    win: r.win,
    delta: r.delta,
    kills: r.kills,
    deaths: r.deaths,
    mvp: r.mvp,
    perf: r.perf,
    placement: r.placement
  };
  s.player.history.unshift(entry);
  if (s.player.history.length > 20) s.player.history.length = 20;
}

export function applyRankedResult(s, r) {
  const { win, kills, deaths, mvp, oppMmr, oppName, mapId, score } = r;
  const placement = s.player.placement.left > 0;
  const tierBefore = s.player.mmr > 0 ? tierOf(s.player.mmr) : null;
  let delta = 0;
  let lossProtect = false;
  const nextLossStreak = win ? 0 : (s.player.stats.lossStreak || 0) + 1;
  if (placement) {
    s.player.placement.left--;
    if (win) s.player.placement.wins++;
    s.player.placement.kills += kills;
    s.player.placement.deaths += deaths;
    if (s.player.placement.left === 0) {
      const base = 1000 + s.player.placement.wins * 80 + Math.round(s.player.placement.kills * 4) - s.player.placement.deaths * 2;
      s.player.mmr = clamp(base, 800, 1600);
    }
  } else {
    const expected = 1 / (1 + Math.pow(10, (oppMmr - s.player.mmr) / 400));
    let d = 32 * ((win ? 1 : 0) - expected) + (mvp ? 3 : 0);
    // 连胜加成：3 连胜起 MMR 增益 ×1.25，让连赢上分更快、接近真实天梯手感
    if (win && s.player.stats.streak >= 3) d *= 1.25;
    if (!win && nextLossStreak >= 3) { d *= 0.6; lossProtect = true; }
    delta = clamp(Math.round(d), -40, 40);
    s.player.mmr = clamp(s.player.mmr + delta, 400, 2500);
  }
  // 段位变化检测：升级/降级提示
  const tierAfter = tierOf(s.player.mmr);
  let tierChange = 'none';
  if (tierBefore && !placement) {
    if (tierAfter.index > tierBefore.index) tierChange = 'up';
    else if (tierAfter.index < tierBefore.index) tierChange = 'down';
  }
  s.player.stats.played++;
  if (win) { s.player.stats.w++; s.player.stats.streak++; }
  else { s.player.stats.l++; s.player.stats.streak = 0; }
  s.player.stats.lossStreak = nextLossStreak;
  s.player.stats.bestStreak = Math.max(s.player.stats.bestStreak, s.player.stats.streak);
  s.player.stats.kills += kills;
  s.player.stats.deaths += deaths;
  if (mvp) s.player.stats.mvp++;
  addHistory(s, { win, kills, deaths, mvp, oppMmr, oppName, mapId, score, delta, placement });
  return { delta, placementDone: s.player.placement.left === 0 && placement, tierChange, lossProtect };
}

export function statsFromEntity(e) {
  return {
    name: e.name || '玩家',
    team: e.team,
    kills: e.kills || 0,
    deaths: e.deaths || 0,
    assists: e.assists || 0,
    plants: e.plants || 0,
    defuses: e.defuses || 0,
    damage: e.dmgGiven || 0
  };
}

function allMatchStats(game) {
  const p = game.player;
  const list = [];
  for (const e of game.entities) {
    if (e === p) list.push(statsFromEntity(p));
    else if (e.bot) list.push(statsFromEntity(e));
  }
  if (list.length === 0) list.push(statsFromEntity(p));
  return list;
}

export function rankedEndMatch(game) {
  const s = loadRanked();
  const rm = game.rankedMatch;
  if (!rm || rm.settled) return { ok: false };
  const p = game.player;
  const win = (p.team === 't' && game.score.T >= ROUND.MATCH_WIN) || (p.team === 'ct' && game.score.CT >= ROUND.MATCH_WIN);
  const kills = p.kills || 0;
  const deaths = p.deaths || 0;
  const mvp = computeMvp(allMatchStats(game));
  const isMvp = mvp && mvp.player === p;
  const perf = computePerformanceScore(statsFromEntity(p));
  const score = [game.score.T, game.score.CT];
  const res = applyRankedResult(s, { win, kills, deaths, mvp: isMvp, perf, oppMmr: rm.oppMmr, oppName: rm.oppName, mapId: rm.mapId, score });
  rm.settled = true;
  s.next = null;
  save();
  if (game.ui) {
    game.ui.hideEnd();
    let msg = (win ? '胜利' : '失利') + (res.placementDone ? '，定级完成' : '，MMR ' + (res.delta >= 0 ? '+' : '') + res.delta);
    if (res.tierChange === 'up') msg += ' · 段位晋升 ' + tierOf(s.player.mmr).name;
    else if (res.tierChange === 'down') msg += ' · 段位跌落 ' + tierOf(s.player.mmr).name;
    if (s.player.placement.left > 0) msg += ' · 剩余定级 ' + s.player.placement.left + ' 场';
    msg += ' · 综合评分 ' + perf;
    if (isMvp) msg += '（本场 MVP）';
    if (res.lossProtect) msg += ' \u00b7 \u8fde\u8d25\u4fdd\u62a4';
    game.ui.showToast(msg);
  }
  return { ok: true, win, mvp: isMvp, perf, delta: res.delta, tierChange: res.tierChange };
}

export function simulateRankedMatch() {
  const s = loadRanked();
  const pending = makePending(s);
  const playerObj = { rating: playerRating(s) };
  const oppObj = { rating: pending.oppMmr };
  const r = simScore(playerObj, oppObj);
  const win = r.winner === playerObj;
  const score = r.score;
  const kills = 3 + Math.floor(rng() * 6);
  const deaths = Math.floor(rng() * 8);
  const simStats = { kills, deaths, assists: Math.floor(rng() * 3), plants: 0, defuses: 0, damage: kills * 70 };
  const perf = computePerformanceScore(simStats);
  const mvp = perf >= 60;
  const res = applyRankedResult(s, { win, kills, deaths, mvp, perf, oppMmr: pending.oppMmr, oppName: pending.oppName, mapId: pending.mapId, score });
  s.next = null;
  save();
  return { ok: true, win, kills, deaths, score, perf, delta: res.delta, placementDone: res.placementDone };
}

function rankedFinish(game) {
  if (!game.rankedMatch) return;
  const players = allMatchStats(game);
  const best = computeMvp(players);
  if (!best) return;
  game.rankedMatch.mvpInfo = {
    name: best.player.name || '玩家',
    score: best.score,
    kills: best.player.kills || 0,
    team: best.player.team || 't'
  };
}

registerMode({
  id: 'ranked',
  name: '排位赛',
  desc: '5 场定级 + MMR 天梯',
  customBots: false,
  start: rankedStart,
  onFinish: rankedFinish
});
