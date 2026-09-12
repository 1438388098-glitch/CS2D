import { ROUND } from './config.js';
import { registerMode, registerMap, getMapDef, getBombMapIds } from './registry.js';
import { DUEL_MAPS } from './duel-maps.js';
import { setupMatchEntities, startRound } from './game.js';
import { teamDiffParams } from './modes.js';
import { ctx } from './ctx.js';

const SAVE_KEY = 'cs2d_duel';
const BACKUP_KEY = 'cs2d_duel_backup';
const VERSION = 1;

export const OPPONENTS = [
  { name: 'ZywOo', tag: 'VIT', rating: 90, style: '狙击手', arch: 'sniper', p: { aimSpeed: 135, idealMin: 480, idealMax: 980, peekChance: 0.42, nadeUse: 0.35, strafe: 0.45, react: 0.10 } },
  { name: 'donk', tag: 'SPIRIT', rating: 92, style: '突破手', arch: 'breacher', p: { strafe: 0.8, riskT: 1.4, rushChance: 0.5, idealMin: 260, idealMax: 620, react: 0.11, peekChance: 0.4 } },
  { name: 'm0NESY', tag: 'G2', rating: 89, style: '狙击手', arch: 'sniper', p: { aimSpeed: 132, idealMin: 460, idealMax: 960, peekChance: 0.45, nadeUse: 0.3, strafe: 0.5, react: 0.11 } },
  { name: 'NiKo', tag: 'FALCONS', rating: 88, style: '突破手', arch: 'breacher', p: { strafe: 0.75, riskT: 1.3, rushChance: 0.45, idealMin: 280, idealMax: 640, aimSpeed: 125, react: 0.12 } },
  { name: 'sh1ro', tag: 'SPIRIT', rating: 87, style: '残局大师', arch: 'rifler', p: { nadeUse: 0.65, riskT: 1.25, peekChance: 0.4, aimSpeed: 120, saveChance: 0.15, react: 0.11 } },
  { name: 'b1t', tag: 'NAVI', rating: 86, style: '突破手', arch: 'breacher', p: { strafe: 0.7, riskT: 1.2, idealMin: 260, idealMax: 600, aimSpeed: 118, react: 0.12 } },
  { name: 'ropz', tag: 'FAZE', rating: 85, style: '自由人', arch: 'lurk', p: { rotateChance: 0.7, saveChance: 0.35, riskT: 0.8, nadeUse: 0.5, peekChance: 0.35, aimSpeed: 115 } },
  { name: 'XANTARES', tag: 'EF', rating: 85, style: '残局大师', arch: 'rifler', p: { nadeUse: 0.6, riskT: 1.35, peekChance: 0.45, aimSpeed: 122, saveChance: 0.1, react: 0.11 } },
  { name: 'flameZ', tag: 'VIT', rating: 84, style: '残局大师', arch: 'rifler', p: { nadeUse: 0.55, riskT: 1.2, peekChance: 0.42, aimSpeed: 118, react: 0.12 } },
  { name: 'dev1ce', tag: 'AST', rating: 84, style: '狙击手', arch: 'sniper', p: { aimSpeed: 130, idealMin: 500, idealMax: 1000, peekChance: 0.4, nadeUse: 0.4, strafe: 0.42, react: 0.11 } },
  { name: 'Twistzz', tag: 'TL', rating: 83, style: '自由人', arch: 'lurk', p: { rotateChance: 0.65, saveChance: 0.3, riskT: 0.85, nadeUse: 0.5, peekChance: 0.38, aimSpeed: 112 } },
  { name: 'EliGE', tag: 'COL', rating: 82, style: '突破手', arch: 'breacher', p: { strafe: 0.72, riskT: 1.25, idealMin: 270, idealMax: 620, aimSpeed: 115, react: 0.12 } }
];

for (const m of DUEL_MAPS) registerMap({ id: m.id, name: m.name, accent: m.accent, rows: m.rows, mode: 'duel', category: 'duel' });

let storage = null;
try { if (typeof globalThis !== 'undefined' && globalThis.localStorage) storage = globalThis.localStorage; } catch (e) { storage = null; }
let state = null;

export function setStorage(s) { storage = s; }
export function isStorageAvailable() { return !!storage; }

function read(key) {
  try { return storage ? storage.getItem(key) : null; } catch (e) { return null; }
}
// 存档写入失败用户可见反馈（配额超限等）：状态翻转时 toast 一次，成功自动复位
let _saveIssueNotified = false;
function notifySaveIssue(text) {
  if (_saveIssueNotified) return;
  _saveIssueNotified = true;
  try { ctx.bus.emit('toast', { text }); } catch (e) { /* UI 未就绪 */ }
}
function write(key, val) {
  try {
    if (storage) {
      storage.setItem(key, val);
      _saveIssueNotified = false;
      return true;
    }
  } catch (e) {
    notifySaveIssue('⚠ 单挑战绩写入失败：浏览器存储空间不足');
    return false;
  }
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

function duelSaveValid(parsed) {
  return !!(parsed && parsed.version === VERSION && parsed.stats);
}

// 从备份恢复（备份语义 = 上一份好档）：成功则回写主档
function tryRestoreBackup() {
  const raw = read(BACKUP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (duelSaveValid(parsed)) {
      state = parsed;
      if (!state.history) state.history = [];
      if (!state.vs) state.vs = {};
      save();
      return state;
    }
  } catch (e) { /* 备份也不可用 */ }
  return null;
}

export function loadDuel() {
  if (state) return state;
  const raw = read(SAVE_KEY);
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
      if (duelSaveValid(parsed)) {
        state = parsed;
        if (!state.history) state.history = [];
        if (!state.vs) state.vs = {};
        return state;
      }
    } catch (e) { parsed = null; }
    // 主档损坏：优先用备份恢复，仅当备份不可用才把坏主档留底供排查
    const restored = tryRestoreBackup();
    if (restored) { notifySaveIssue('检测到单挑存档损坏，已从备份恢复'); return restored; }
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

// 地图解锁进度：前 2 张常开，其后每 3 胜解锁一张（赢越多，池子越大）
export function unlockedDuelMaps(wins) {
  const n = Math.min(DUEL_MAPS.length, 2 + Math.floor(Math.max(0, wins || 0) / 3));
  return DUEL_MAPS.slice(0, n);
}

export function pickDuelMap(selected, played, wins) {
  if (selected === 'arena') {
    const ids = getBombMapIds();
    return ids.length ? ids[Math.max(0, played || 0) % ids.length] : DUEL_MAPS[0].id;
  }
  const pool = unlockedDuelMaps(wins);
  const allowed = new Set(pool.map((m) => m.id));
  // 显式选图仍允许竞技池（arena 系列），但未解锁的单挑图回退到最新解锁张
  if (selected && selected !== 'auto' && (allowed.has(selected) || getBombMapIds().includes(selected))) return selected;
  if (selected && selected !== 'auto' && getMapDef(selected) && !allowed.has(selected)) return pool[pool.length - 1].id;
  if (selected && selected !== 'auto' && getMapDef(selected)) return selected;
  return pool[Math.max(0, played || 0) % pool.length].id;
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
  const mapId = pickDuelMap(game.opts.duelMap, getState().stats.played, getState().stats.w);
  const map = getMapDef(mapId) || DUEL_MAPS[0];
  game.opts.mapId = map.id;
  const opp = pickOpponent(game.opts.duelOpponent);
  game.duelMatch = { settled: false, opp, mapId: map.id };
  game.opts.bots = 1;
  // 难度档：easy/normal/hard/hell 缩放对手 rating（影响 AI 参数），默认困难
  const diffMult = { easy: 0.7, normal: 0.85, hard: 1.0, hell: 1.15 };
  const mult = diffMult[game.opts.duelDiff] || 1.0;
  const effRating = Math.round(Math.min(99, Math.max(55, opp.rating * mult)));
  game.opts.diff = game.opts.duelDiff === 'hell' ? 'hell' : 'hard';
  // 对手人格：rating 基线 + 个人风格覆盖（狙击手远距/突破手贴脸/自由人绕后/残局大师稳）
  const base = teamDiffParams({ rating: effRating });
  const personality = opp.p || {};
  game.opts.diffParams = { ...base, ...personality };
  game.opts.sideSwapAfter = Math.max(1, Math.floor(ROUND.MATCH_WIN / 2));
  game.noRoundEnd = false;
  setupMatchEntities(game);
  game.entities = game.entities.filter((e) => !(e.bot && e.team === game.opts.team));
  const enemy = game.entities.find((e) => e.bot && e.team !== game.opts.team);
  if (enemy) {
    enemy.name = opp.name;
    enemy.archetype = opp.arch || 'rifler';
    enemy.aiParams = { ...base, ...personality };
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
