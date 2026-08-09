import { ROUND } from './config.js';
import { registerMode, registerMap } from './registry.js';
import { DUEL_MAPS } from './duel-maps.js';
import { setupMatchEntities, startRound } from './game.js';
import { teamDiffParams } from './modes.js';

const SAVE_KEY = 'cs2d_duel';
const BACKUP_KEY = 'cs2d_duel_backup';
const VERSION = 1;

export const OPPONENTS = [
  { name: 'ZywOo', tag: 'VIT', rating: 90 },
  { name: 'donk', tag: 'SPIRIT', rating: 92 },
  { name: 'm0NESY', tag: 'G2', rating: 89 },
  { name: 'NiKo', tag: 'FALCONS', rating: 88 },
  { name: 'sh1ro', tag: 'SPIRIT', rating: 87 },
  { name: 'b1t', tag: 'NAVI', rating: 86 },
  { name: 'ropz', tag: 'FAZE', rating: 85 },
  { name: 'XANTARES', tag: 'EF', rating: 85 },
  { name: 'flameZ', tag: 'VIT', rating: 84 },
  { name: 'dev1ce', tag: 'AST', rating: 84 },
  { name: 'Twistzz', tag: 'TL', rating: 83 },
  { name: 'EliGE', tag: 'COL', rating: 82 }
];

for (const m of DUEL_MAPS) registerMap({ id: m.id, name: m.name, accent: m.accent, rows: m.rows, mode: 'duel' });

let storage = null;
try { if (typeof globalThis !== 'undefined' && globalThis.localStorage) storage = globalThis.localStorage; } catch (e) { storage = null; }
let state = null;

export function setStorage(s) { storage = s; }
export function isStorageAvailable() { return !!storage; }

function read(key) {
  try { return storage ? storage.getItem(key) : null; } catch (e) { return null; }
}
function write(key, val) {
  try { if (storage) { storage.setItem(key, val); return true; } } catch (e) {}
  return false;
}

export function newDuelState() {
  return {
    version: VERSION,
    stats: { played: 0, w: 0, l: 0, kills: 0, deaths: 0, streak: 0, bestStreak: 0 },
    history: [],
    vs: {}
  };
}

export function save() {
  if (!state) return false;
  return write(SAVE_KEY, JSON.stringify(state));
}

export function loadDuel() {
  if (state) return state;
  const raw = read(SAVE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === VERSION && parsed.stats) {
        state = parsed;
        if (!state.history) state.history = [];
        if (!state.vs) state.vs = {};
        return state;
      }
    } catch (e) { /* fallthrough */ }
    write(BACKUP_KEY, raw);
  }
  state = newDuelState();
  save();
  return state;
}

export function getState() { return state || loadDuel(); }
export function resetDuel() {
  state = newDuelState();
  save();
  return state;
}
export function __clearStateForTest() { state = null; }
export function getOpponents() { return OPPONENTS.map((o) => ({ ...o })); }
export function getStats() { const s = loadDuel(); return { ...s.stats, history: s.history.slice(), vs: s.vs || {} }; }

export function pickDuelMap(selected, played) {
  if (selected && selected !== 'auto' && DUEL_MAPS.some((m) => m.id === selected)) return selected;
  return DUEL_MAPS[Math.max(0, played || 0) % DUEL_MAPS.length].id;
}

function pickOpponent(name) {
  return OPPONENTS.find((o) => o.name === name) || OPPONENTS[0];
}

export function recordResult(s, win, kills, deaths, oppName, mapId) {
  s.stats.played++;
  if (win) { s.stats.w++; s.stats.streak++; }
  else { s.stats.l++; s.stats.streak = 0; }
  s.stats.bestStreak = Math.max(s.stats.bestStreak, s.stats.streak);
  s.stats.kills += kills;
  s.stats.deaths += deaths;
  // 每对手战绩：按对手名累计（ZywOo / NiKo ...），方便查看对谁有胜率
  if (oppName) {
    const v = s.vs[oppName] = s.vs[oppName] || { w: 0, l: 0, kills: 0, deaths: 0 };
    if (win) v.w++; else v.l++;
    v.kills += kills;
    v.deaths += deaths;
  }
  s.history.unshift({ t: Date.now(), win, kills, deaths, opp: oppName || null, map: mapId || null });
  if (s.history.length > 20) s.history.length = 20;
}

function duelStart(game) {
  const mapId = pickDuelMap(game.opts.duelMap, getState().stats.played);
  const map = DUEL_MAPS.find((m) => m.id === mapId) || DUEL_MAPS[0];
  game.opts.mapId = map.id;
  const opp = pickOpponent(game.opts.duelOpponent);
  game.duelMatch = { settled: false, opp, mapId: map.id };
  game.opts.bots = 1;
  // 难度档：easy/normal/hard/hell 缩放对手 rating（影响 AI 参数），默认困难
  const diffMult = { easy: 0.7, normal: 0.85, hard: 1.0, hell: 1.15 };
  const mult = diffMult[game.opts.duelDiff] || 1.0;
  const effRating = Math.round(Math.min(99, Math.max(55, opp.rating * mult)));
  game.opts.diff = game.opts.duelDiff === 'hell' ? 'hell' : 'hard';
  game.opts.diffParams = teamDiffParams({ rating: effRating });
  game.noRoundEnd = false;
  setupMatchEntities(game);
  game.entities = game.entities.filter((e) => !(e.bot && e.team === game.opts.team));
  const enemy = game.entities.find((e) => e.bot && e.team !== game.opts.team);
  if (enemy) {
    enemy.name = opp.name;
    enemy.aiParams = { ...teamDiffParams({ rating: effRating }) };
  }
  startRound(game);
}

function settleDuel(game) {
  if (!game.duelMatch || game.duelMatch.settled) return;
  const p = game.player;
  const win = (p.team === 't' && game.score.T >= ROUND.MATCH_WIN) || (p.team === 'ct' && game.score.CT >= ROUND.MATCH_WIN);
  const s = loadDuel();
  recordResult(s, win, p.kills || 0, p.deaths || 0, game.duelMatch.opp.name, game.duelMatch.mapId);
  game.duelMatch.settled = true;
  save();
  if (game.ui) game.ui.showToast((win ? '胜' : '负') + ' ' + game.duelMatch.opp.name + ' · 总战绩 ' + s.stats.w + ' 胜 ' + s.stats.l + ' 负');
}

function duelUpdate(game) {
  settleDuel(game);
}

registerMode({
  id: 'duel',
  name: '单挑模式',
  desc: '1v1 九局五胜（BO9）',
  customBots: false,
  start: duelStart,
  update: duelUpdate,
  onFinish: settleDuel
});
