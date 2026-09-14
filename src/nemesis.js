// 宿敌系统：跨对局记住杀你最多的那个 bot，给它红色标记；复仇击杀有赏金。
// bot 目前是匿名消耗品——一个跨局记得你、你也不记恨不行的"老对手"把单机对局变成连续剧。
// 存储极简：{ counts: { botName: 死亡次数 }, revenges: 总复仇次数 }，localStorage 可缺失（无痕模式退化内存）。
const KEY = 'cs2d_nemesis_v1';

let cache = null;

function store() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (e) { return null; }
}

export function loadNemesis() {
  if (cache) return cache;
  const s = store();
  if (s) {
    try {
      const raw = s.getItem(KEY);
      if (raw) cache = JSON.parse(raw);
    } catch (e) { /* 坏档重建 */ }
  }
  if (!cache || typeof cache !== 'object') cache = { counts: {}, revenges: 0 };
  if (!cache.counts) cache.counts = {};
  return cache;
}

function saveNemesis() {
  const s = store();
  if (!s || !cache) return;
  try { s.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* 配额满忽略 */ }
}

// 玩家阵亡于 bot 之手：累计该 bot 的宿敌值
export function recordNemesisDeath(killerName) {
  if (!killerName) return;
  const d = loadNemesis();
  d.counts[killerName] = (d.counts[killerName] || 0) + 1;
  saveNemesis();
}

// 玩家击杀宿敌：清零其宿敌值并记一次复仇
export function recordRevenge(name) {
  const d = loadNemesis();
  if (d.counts[name]) delete d.counts[name];
  d.revenges = (d.revenges || 0) + 1;
  saveNemesis();
}

// 当前宿敌名（死亡次数最多者，≥3 次死亡才成宿敌）
export function nemesisName() {
  const d = loadNemesis();
  let best = null, n = 0;
  for (const k in d.counts) {
    if (d.counts[k] > n) { n = d.counts[k]; best = k; }
  }
  return n >= 3 ? best : null;
}

// 每回合开始调用：把宿敌标记打到玩家敌方对应名字的 bot 头上（gameplayPlus 开关内）
export function markNemesis(game) {
  if (!game || !game.player) return;
  for (const e of game.entities) e.nemesis = false;
  if (!game.opts || !game.opts.gameplayPlus) return;
  const name = nemesisName();
  if (!name) return;
  const target = game.entities.find((e) => e.bot && !e.dead && e.team !== game.player.team && e.name === name);
  if (target) target.nemesis = true;
}

export function nemesisStats() {
  const d = loadNemesis();
  return { name: nemesisName(), revenges: d.revenges || 0, counts: { ...d.counts } };
}
