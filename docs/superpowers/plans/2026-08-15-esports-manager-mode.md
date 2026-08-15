# 电竞经理模式（Esports Manager Mode）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CS2D 中新增一个纯管理的「电竞经理」模式：玩家经营一支 5 人 CS2 战队，比赛全程 AI 实机观战，包含转会/训练/财务/老板压力/事件流/羁绊等完整经营循环。

**Architecture:** 三个新文件（`src/manager.js` 纯逻辑层、`src/manager-match.js` 实机观战包装、`src/manager-ui.js` 渲染层）+ 少量接线。逻辑层不 import DOM，可无头测试；比赛实机复用赛博斗蛐蛐（cyber）引擎链路 + 选手 9 维能力映射到 bot aiParams；AI 场次用事件级模拟器（移植 career 思路）。

**Tech Stack:** 纯 ES Modules + Canvas（零依赖），Node 无头测试（`node scripts/run-tests.mjs`），localStorage 存档。无框架。

**前置条件：** spec 已就绪：`docs/superpowers/specs/2026-08-15-esports-manager-mode-design.md`（位置×能力矩阵章节已定稿）。

**关键项目背景（务必先读）：**
- 比赛引擎复用点：`src/modes.js:1250-1328`（cyber 观战三件套：造 bot + 假观战者 + 结算）、`src/modes.js:820-834`（`teamDiffParams` rating→aiParams 映射）、`src/registry.js`（`registerMode`）、`src/game.js:218-224`（start 钩子）、`src/game.js:436-440`（onFinish 钩子）。
- 位置数据：`src/modes.js:171-460` `MAJOR_TEAMS`（48 队 × 5 选手，字段 `name/role/aim/movement/clutch/nade`）。
- 经营逻辑可移植：`src/career.js` 的 `roundRobin(1196)/makeCup(1239)/simulateCareerMatch(2144)/addLedger(288)` —— 但都是**私有函数**，manager 需自行实现（可用 career 相同算法，独立代码）。
- 测试范式：`test/career.mjs`（setStorage/setRng 注入 + 自写断言函数 + `createGame/startMatch` 实测 + stubdom UI 测试）。
- 接线点：`index.html`（加 managerPanel + mode-card）、`src/ui.js:642-649`（hideModePanels）、`src/ui.js:893-924`（startBtn 分流）、`src/main.js:82-83`（boot 里 initManagerUi）。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/manager.js` | 纯逻辑层：状态/存档/联赛/转会/训练/财务/事件/赛季结算/比赛模拟器 |
| `src/manager-match.js` | 实机观战：`mapManagerRosterToBots` + `registerMode({id:'manager'})` 的 start/update/onFinish |
| `src/manager-ui.js` | 渲染层：`#managerPanel` 全屏面板 + Tab 渲染 + 事件委托 |
| `index.html` | 加 `#managerPanel` 容器 + `data-mode="manager"` 卡片 |
| `src/ui.js` | `hideModePanels` 加 managerPanel；`startBtn` 分流加 manager 分支 |
| `src/main.js` | boot 加 `initManagerUi(document, game)` |
| `src/registry.js` | （不改）`registerMode` 已通用 |
| `test/manager.mjs` | 确定性测试 |
| `test/manager-match.mjs` | 实机对局测试 |
| `docs/MODES.md` | 模式表格加一行 |

---

### Task 1: manager.js 骨架 —— 存档系统 + 基础常量

**Files:**
- Create: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 创建 manager.js 骨架（常量 + 状态 + 存档三件套）**

```js
import { registerMode } from './registry.js';

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
```

- [ ] **Step 2: 加状态创建/迁移/存档/加载**

```js
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
```

- [ ] **Step 3: 写测试**

```js
// test/manager.mjs
import { resetManager, loadManager, setStorage, setRng, getState, SAVE_KEY, BACKUP_KEY, VERSION, ROLE_WEIGHTS } from '../src/manager.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('manager: ' + name + ' FAIL');
  console.log('manager: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

const store = fakeStorage();
setStorage(store);
setRng(() => 0.5);

let s = resetManager();
ok('save persisted', store.map.has(SAVE_KEY));
ok('version', s.version === VERSION);
ok('initial bank', s.team.bank === 12000);
ok('roster empty', Array.isArray(s.team.roster) && s.team.roster.length === 0);
ok('league 乙级', s.team.league === '乙级');
ok('board trust 70', s.board.trust === 70);
ok('6 roles weighted', Object.keys(ROLE_WEIGHTS).length === 6);
const wSum = Object.values(ROLE_WEIGHTS['突破']).reduce((a, b) => a + b, 0);
ok('role weights sum to 1', Math.abs(wSum - 1) < 0.001);

store.map.set(SAVE_KEY, '{corrupt');
s = loadManager();
ok('corrupt save backed up', store.map.has(BACKUP_KEY));
ok('corrupt save rebuilt', s.version === VERSION && s.team.bank === 12000);
```

- [ ] **Step 4: 跑测试确认失败**

Run: `node test/manager.mjs`
Expected: 报错 `Cannot find module '../src/manager.js'` 或导入失败

- [ ] **Step 5: 保存 manager.js 全部内容（Step1+2 合并），重跑测试确认通过**

Run: `node test/manager.mjs`
Expected: 全部 PASS，`manager: save persisted PASS` ... `manager: corrupt save rebuilt PASS`

- [ ] **Step 6: 跑全量测试确认无回归**

Run: `node scripts/run-tests.mjs --filter=manager`
Expected: manager 测试通过

Run: `node scripts/check-syntax.mjs`
Expected: 无语法错误

- [ ] **Step 7: Commit**

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 电竞经理模式骨架 - 存档系统 + 位置/能力常量 + 确定性测试"
```

---

### Task 2: 选手数据生成（MAJOR_TEAMS 派生 + 9 维能力 + 位置矩阵）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 导入 MAJOR_TEAMS 并实现选手派生**

在 manager.js 顶部加：`import { MAJOR_TEAMS } from './modes.js';`

然后在 `blankRoster` 附近加：

```js
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
```

- [ ] **Step 2: 实现 buildManagerTeam（用 MAJOR_TEAMS 建 5 人玩家队）**

```js
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
  // 队伍实力取 roster 均评
  const avg = Math.round(roster.reduce((a, p) => a + p.rating, 0) / Math.max(1, roster.length));
  const target = randInt(lo, hi);
  // 若均评偏离目标，整体平移到目标区间内
  const offset = clamp(target - avg, -6, 6);
  for (const p of roster) {
    p.rating = clamp(p.rating + offset, lo, hi + 8);
    p.price = playerPrice(p, league);
  }
  return roster;
}
```

- [ ] **Step 3: 写测试**

在 test/manager.mjs 末尾追加：

```js
import { buildManagerRoster, deriveAttrs, ratingFromAttrs, playerPrice } from '../src/manager.js';

s = resetManager();
s.team.roster = buildManagerRoster('乙级');
ok('roster 5', s.team.roster.length === 5);
ok('roster roles distinct', new Set(s.team.roster.map((p) => p.role)).size >= 4);
ok('roster has attrs 10 dims', s.team.roster.every((p) => p.attrs && Object.keys(p.attrs).length === 10));
ok('roster rating in range', s.team.roster.every((p) => p.rating >= 60 && p.rating <= 93));
ok('derived attrs clamp', deriveAttrs({ aim: 30, movement: 30, clutch: 30, nade: 30 }).aim === 40);
ok('rating weighted', ratingFromAttrs('狙击', { aim: 99, react: 99, movement: 50, clutch: 50, nade: 50, gameIQ: 50, leadership: 50, composure: 50, aggression: 50, discipline: 50 }) >= 90);
ok('price capped', playerPrice({ rating: 99 }, '甲级') <= 30000);
```

- [ ] **Step 4: 跑测试**

Run: `node test/manager.mjs`
Expected: 全部 PASS（含 Task1 的）

- [ ] **Step 5: 全量回归 + Commit**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs`

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 选手生成 - MAJOR_TEAMS 派生 9 维能力 + 位置权重 rating"
```

---

### Task 3: 联赛生成（8 队双循环 14 轮 + 杯赛）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 实现联赛/赛程/积分榜/杯赛（移植 career 算法，独立代码）**

```js
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

function buildStandings(teams) { return makeStandings(teams); }

function refreshCup(s) {
  const b = s.season.cup.bracket;
  if (b[4] && !b[4].played && b[0].played && b[1].played) { b[4].a = b[0].winner; b[4].b = b[1].winner; }
  if (b[5] && !b[5].played && b[2].played && b[3].played) { b[5].a = b[2].winner; b[5].b = b[3].winner; }
  if (b[6] && !b[6].played && b[4].played && b[5].played) { b[6].a = b[4].winner; b[6].b = b[5].winner; }
  if (b[6].played) { s.season.cup.phase = 'finished'; s.season.cup.champion = b[6].winner; }
}

export function buildNewSeason(s) {
  s.season.round = 1;
  s.season.teams = buildManagerTeams(s.team.league, s.team.roster);
  const ids = s.season.teams.map((t) => t.id);
  s.season.fixtures = makeFixtures(ids);
  s.season.standings = buildStandings(s.season.teams);
  s.season.cup = { phase: 'idle', bracket: [] };
  assignFixtureMaps(s);
  return s;
}

export function assignFixtureMaps(s) {
  for (const f of s.season.fixtures) {
    const home = s.season.teams.find((t) => t.id === f.home);
    f.mapId = home ? home.homeMap : 'dust2';
  }
}

export function nextFixture(s) {
  return s.season.fixtures.find((f) => !f.played && (f.home === 'player' || f.away === 'player')) || null;
}
```

- [ ] **Step 2: 实现 newManagerCareer（完整初始化玩家战队 + 赛季）**

```js
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
```

- [ ] **Step 3: 写测试**

在 test/manager.mjs 末尾追加：

```js
import { newManagerCareer, buildNewSeason, nextFixture } from '../src/manager.js';

s = newManagerCareer();
ok('career fixtures 56', s.season.fixtures.length === 56);
ok('career standings 8', s.season.standings.length === 8);
ok('career teams 8', s.season.teams.length === 8);
ok('player team present', s.season.teams.some((t) => t.id === 'player'));
ok('round robin home+away', s.season.fixtures.filter((f) => f.home === 'player').length === 7 && s.season.fixtures.filter((f) => f.away === 'player').length === 7);
ok('fixtures have map', s.season.fixtures.every((f) => f.mapId));
ok('nextFixture exists round1', nextFixture(s) && nextFixture(s).round === 1);
```

- [ ] **Step 4: 跑测试 + 全量回归**

Run: `node test/manager.mjs; node scripts/check-syntax.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 联赛生成 - 8队双循环14轮赛程 + 杯赛 + 队伍/选手初始化"
```

---

### Task 4: 比赛模拟器（AI 场次，事件级回合模拟）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 实现 simulateManagerRound / simulateManagerMatch**

```js
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
  const secondHalf = index >= need;
  const attacker = index % 2 === 0 ? home : away;
  const defender = attacker === home ? away : home;
  const aPower = teamPower(s, attacker.id, 'attack');
  const dPower = teamPower(s, defender.id, 'defense');
  const events = [];
  if (rng() < 0.4) events.push({ t: 'utility', side: attacker.id, text: attacker.name + ' 使用道具控制入口' });
  const entry = (attacker.roster || [])[Math.floor(rng() * (attacker.roster || [1]).length)] || { name: attacker.name, rating: attacker.rating, role: '步枪' };
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
    const planter = (attacker.roster || [])[Math.floor(rng() * (attacker.roster || [1]).length)];
    if (planter) { stats[planter.name] = stats[planter.name] || { name: planter.name, role: planter.role, team: attacker.id, kills: 0, deaths: 0, dmg: 0, plants: 0, defuses: 0, clutches: 0 }; stats[planter.name].plants++; }
    events.push({ t: 'plant', side: attacker.id, text: (planter ? planter.name : attacker.name) + ' 安放 C4' });
    const retake = rng() < clamp(0.42 + (dPower - aPower) * 0.012, 0.18, 0.88);
    if (!retake) {
      winner = attacker;
      events.push({ t: 'post_plant', side: attacker.id, text: attacker.name + ' 守住点位' });
    } else {
      const defuser = (defender.roster || [])[Math.floor(rng() * (defender.roster || [1]).length)];
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
```

- [ ] **Step 2: 写测试**

在 test/manager.mjs 末尾追加：

```js
import { simulateManagerMatch } from '../src/manager.js';

s = newManagerCareer();
const me = s.season.teams.find((t) => t.id === 'player');
const opp = s.season.teams.find((t) => t.id !== 'player');
const r = simulateManagerMatch(s, me, opp, { league: '乙级' });
ok('sim rounds 5-9', r.rounds.length >= 5 && r.rounds.length <= 9);
ok('sim score sums to rounds', r.score[0] + r.score[1] === r.rounds.length);
ok('sim winner valid', r.winner === me.id || r.winner === opp.id);
ok('sim mvp present', r.mvp && r.mvp.name);
ok('sim players sorted', r.players[0] && r.players[0].kills >= r.players[r.players.length - 1].kills);
```

- [ ] **Step 3: 跑测试 + 回归**

Run: `node test/manager.mjs; node scripts/check-syntax.mjs`

- [ ] **Step 4: Commit**

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 比赛模拟器 - 事件级回合模拟 + 选手数据/MVP"
```

---

### Task 5: 转会系统（候选池 + 球探噪声 + 买卖/续约）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 实现候选池 + 球探噪声 + 筛选**

```js
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
      const attrs = deriveAttrs(src);
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
```

- [ ] **Step 2: 实现买/卖/续约**

```js
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
  return { refund: Math.floor(p.price * (LEAGUE_RULES[s.team.league].refundScale || 0.5)), ratingImpact: refreshTeamRating(s) - (s.team.roster.length > 1 ? Math.round(s.team.roster.filter((x) => x.id !== id).reduce((a, x) => a + x.rating, 0) / (s.team.roster.length - 1)) : 0), roleGap: !s.team.roster.some((x) => x.id !== id && x.role === p.role) };
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
```

- [ ] **Step 3: 写测试**

在 test/manager.mjs 末尾追加：

```js
import { candidates, buyPlayer, sellPlayer, renewPlayer, transferWindowOpen, scoutingNoise, scoutedView, filterCandidates } from '../src/manager.js';

s = newManagerCareer();
s.season.round = 6;
ok('transfer window open', transferWindowOpen(s));
const pool = candidates(s);
ok('candidate pool 12', pool.length === 12);
ok('candidate roles covered', new Set(pool.map((c) => c.role)).size >= 5);
const cv = scoutedView(pool[0], 5);
ok('scouted view has stars', cv.potentialStars >= 1 && cv.potentialStars <= 5);
const filtered = filterCandidates(pool, { role: '狙击' });
ok('filter by role', filtered.every((c) => c.role === '狙击'));
s.team.bank = 99999;
const c = pool.find((x) => x.role === '狙击') || pool[0];
const buy = buyPlayer(s, c.id);
ok('buy ok', buy.ok && s.team.roster.length >= 5);
ok('bank decreased', s.team.bank < 99999);
ok('transfersLeft--', s.team.transfersLeft === 1);
s.season.round = 1;
s.team.transfersLeft = 2;
const sp = s.team.roster[0];
const sell = sellPlayer(s, sp.id);
ok('sell needs >5 roster', s.team.roster.length === 5 && !sell.ok);
// 加第6人再卖
s.team.roster.push({ ...pool[1], id: 'extra6', role: '补枪', price: 5000, contractYears: 3, renewalCost: 600 });
const sell2 = sellPlayer(s, 'extra6');
ok('sell 6th works', sell2.ok && s.team.roster.length === 5);
// 到期续约
const rp = s.team.roster[0];
rp.contractYears = 1;
s.team.bank = 50000;
const rn = renewPlayer(s, rp.id);
ok('renew ok', rn.ok && rp.contractYears === 3);
```

- [ ] **Step 4: 跑测试 + 回归**

Run: `node test/manager.mjs; node scripts/check-syntax.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 转会系统 - 候选池/球探噪声/筛选/买卖/续约"
```

---

### Task 6: 训练/休息/设施 + 状态系统（疲劳/士气/状态波动）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 实现训练/休息/设施**

```js
export const TRAIN_TIERS = [
  { key: 'basic', label: '基础', cost: 500, points: 2, fatigue: 3 },
  { key: 'pro', label: '进阶', cost: 1200, points: 6, fatigue: 6 },
  { key: 'elite', label: '精英', cost: 2500, points: 15, fatigue: 10 }
];
export const FACILITIES = {
  academy: { label: '青训', desc: '潜力成长 +1/赛季', baseCost: 4000, max: 3 },
  medical: { label: '医疗', desc: '比赛疲劳 -2/级', baseCost: 3500, max: 3 },
  scouting: { label: '球探', desc: '候选噪声 -1/级', baseCost: 3000, max: 3 },
  analytics: { label: '数据分析', desc: '经理经验 +10%/级', baseCost: 4500, max: 3 }
};

export function trainingPreview(s, p, tierKey) {
  const tier = TRAIN_TIERS.find((t) => t.key === tierKey);
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const cost = Math.round(tier.cost * rules.costScale);
  const gained = Math.min(15, tier.points + (s.team.facilities.academy || 0));
  return { cost, gained, fatigue: Math.max(1, tier.fatigue - (s.team.facilities.medical || 0)) };
}

export function trainPlayer(s, id, attr, tierKey) {
  const p = s.team.roster.find((x) => x.id === id);
  if (!p) return { ok: false, msg: '选手不存在' };
  if (!ATTRS.includes(attr)) return { ok: false, msg: '未知属性' };
  if (s.team.trainingLeft <= 0) return { ok: false, msg: '训练次数已用完' };
  const prev = trainingPreview(s, p, tierKey);
  if (s.team.bank < prev.cost) return { ok: false, msg: '资金不足' };
  const maxGain = 100 - p.attrs[attr];
  if (maxGain <= 0) return { ok: false, msg: '属性已满' };
  const gained = Math.min(prev.gained, maxGain);
  s.team.bank -= prev.cost;
  p.attrs[attr] = clamp(p.attrs[attr] + gained, 0, 100);
  p.rating = ratingFromAttrs(p.role, p.attrs);
  p.fatigue = clamp(p.fatigue + prev.fatigue, 0, 100);
  p.price = playerPrice(p, s.team.league);
  s.team.trainingLeft--;
  addLedger(s, 'expense', -prev.cost, '训练：' + p.name + ' ' + attr);
  refreshTeamRating(s);
  save();
  return { ok: true, gained };
}

export function restPlayer(s, id) {
  const p = s.team.roster.find((x) => x.id === id);
  if (!p) return { ok: false, msg: '选手不存在' };
  p.fatigue = 0;
  p.stress = clamp(p.stress - 15, 0, 100);
  pushNews(s, 'info', p.name + ' 轮休，疲劳清零');
  save();
  return { ok: true };
}

export function facilityStatus(s) {
  return Object.entries(FACILITIES).map(([key, cfg]) => {
    const level = s.team.facilities[key] || 0;
    const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
    const cost = level >= cfg.max ? 0 : Math.round(cfg.baseCost * (1 + level * 0.8) * rules.costScale);
    return { key, label: cfg.label, desc: cfg.desc, level, max: cfg.max, cost };
  });
}

export function upgradeFacility(s, key) {
  const cfg = FACILITIES[key];
  if (!cfg) return { ok: false, msg: '未知设施' };
  const level = s.team.facilities[key] || 0;
  if (level >= cfg.max) return { ok: false, msg: '已满级' };
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const cost = Math.round(cfg.baseCost * (1 + level * 0.8) * rules.costScale);
  if (s.team.bank < cost) return { ok: false, msg: '资金不足' };
  s.team.bank -= cost;
  s.team.facilities[key] = level + 1;
  addLedger(s, 'expense', -cost, '设施投资：' + cfg.label);
  pushNews(s, 'info', cfg.label + '设施升级到 ' + (level + 1) + ' 级');
  save();
  return { ok: true };
}
```

- [ ] **Step 2: 写测试**

在 test/manager.mjs 末尾追加：

```js
import { trainPlayer, restPlayer, facilityStatus, upgradeFacility, trainingPreview } from '../src/manager.js';

s = newManagerCareer();
const tp = s.team.roster[0];
const prev = trainingPreview(s, tp, 'basic');
ok('train preview cost', prev.cost > 0 && prev.gained >= 2);
s.team.bank = 99999;
const t1 = trainPlayer(s, tp.id, 'aim', 'basic');
ok('train gained', t1.ok && t1.gained > 0 && tp.attrs.aim >= prev.gained);
ok('train fatigue', tp.fatigue >= prev.fatigue);
ok('trainingLeft--', s.team.trainingLeft === 1);
const r1 = restPlayer(s, tp.id);
ok('rest clears fatigue', r1.ok && tp.fatigue === 0);
const fs = facilityStatus(s);
ok('facility 4 kinds', fs.length === 4 && fs.every((f) => f.max === 3));
s.team.bank = 99999;
const up = upgradeFacility(s, 'scouting');
ok('upgrade ok', up.ok && s.team.facilities.scouting === 1);
```

- [ ] **Step 3: 跑测试 + 回归 + Commit**

Run: `node test/manager.mjs; node scripts/check-syntax.mjs`

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 训练/休息/设施 + 状态系统"
```

---

### Task 7: 财务系统（赞助/票房/预算/流水/风险）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 实现财务函数**

```js
export function sponsorIncome(s) {
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const rating = refreshTeamRating(s);
  const morale = s.team.morale || 50;
  return Math.round(rules.sponsor * (0.7 + morale / 200) * (0.8 + rating / 500));
}

export function homeTicketIncome(s, win) {
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const rating = refreshTeamRating(s);
  const morale = s.team.morale || 50;
  return Math.round(rules.ticketBase * (0.8 + rating / 250) * (0.8 + morale / 150) * (win ? 1.35 : 0.8));
}

export function cashflowForecast(s) {
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const fixturesLeft = s.season.fixtures.filter((f) => !f.played && (f.home === 'player' || f.away === 'player')).length;
  const expectWin = 0.5;
  const matchIncome = Math.round(fixturesLeft * (rules.matchWin * expectWin + rules.matchLose * (1 - expectWin)));
  const sponsor = sponsorIncome(s);
  const projected = s.team.bank + matchIncome + sponsor;
  return { projected, cushion: Math.max(0, projected - 6000), matchIncome, sponsor, fixturesLeft };
}

export function seasonBudget(s) {
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const budget = rules.budgetBase + sponsorIncome(s) * 0.5;
  const spendable = Math.max(0, budget - Math.max(0, -s.team.bank));
  return { budget, spendable };
}

export function financialRisk(s) {
  let score = 0;
  const reasons = [];
  if (s.team.bank < 5000) { score += 35; reasons.push('资金低于 5000'); }
  const cf = cashflowForecast(s);
  if (cf.projected < 6000) { score += 25; reasons.push('预测资金低于安全垫'); }
  if (transferWindowOpen(s) && s.team.bank < 10000) { score += 20; reasons.push('转会期资金偏低'); }
  const level = score >= 60 ? '高风险' : score >= 35 ? '紧张' : score >= 15 ? '谨慎' : '安全';
  return { score, level, reasons, mode: score >= 60 ? '低资金模式' : score >= 35 ? '稳健运营' : '可投入' };
}

export function ledgerRecent(s, n = 60) {
  return (s.team.ledger || []).slice(-n).reverse();
}

export function transferProfit(s) {
  const sells = (s.team.ledger || []).filter((l) => l.type === 'income' && l.label.startsWith('卖出'));
  const buys = (s.team.ledger || []).filter((l) => l.type === 'expense' && l.label.startsWith('买入'));
  return { sellTotal: sells.reduce((a, l) => a + l.amount, 0), buyTotal: buys.reduce((a, l) => a + l.amount, 0) };
}
```

- [ ] **Step 2: 写测试**

在 test/manager.mjs 末尾追加：

```js
import { sponsorIncome, homeTicketIncome, cashflowForecast, seasonBudget, financialRisk, ledgerRecent, transferProfit } from '../src/manager.js';

s = newManagerCareer();
s.team.morale = 65;
const sp = sponsorIncome(s);
ok('sponsor positive', sp > 0);
const ti = homeTicketIncome(s, true);
ok('ticket win > lose', ti > homeTicketIncome(s, false));
const cf = cashflowForecast(s);
ok('forecast projected', cf.projected > 0);
const sb = seasonBudget(s);
ok('budget base', sb.budget >= 15000);
const fr = financialRisk(s);
ok('risk level valid', ['安全', '谨慎', '紧张', '高风险'].includes(fr.level));
s.team.bank = 100;
ok('risk high when broke', financialRisk(s).level === '高风险');
s.team.ledger.push({ type: 'income', amount: 100, label: '卖出：x' });
s.team.ledger.push({ type: 'expense', amount: -50, label: '买入：y' });
ok('transfer profit', transferProfit(s).sellTotal === 100 && transferProfit(s).buyTotal === 50);
ok('ledger recent reversed', ledgerRecent(s)[0].amount === 50);
```

- [ ] **Step 3: 跑测试 + 回归 + Commit**

Run: `node test/manager.mjs; node scripts/check-syntax.mjs`

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 财务系统 - 赞助/票房/预算/现金流/风险/流水"
```

---

### Task 8: 六个核心机制（老板压力 + 体检 + 事件流 + 羁绊 + 状态入局 + 球探噪声）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 实现老板压力 + 赛季目标**

```js
export function boardGoalFor(league) {
  if (league === '甲级') return { rank: 6, cup: 1, reward: 12000 };
  if (league === '丙级') return { rank: 4, cup: 0, reward: 7000 };
  return { rank: 2, cup: 1, reward: 10000 };
}

export function boardTrust(s) { return s.board.trust; }

export function seasonGoalProgress(s) {
  const goal = s.board.goal;
  const rank = s.season.standings.findIndex((x) => x.teamId === 'player') + 1;
  const cupRound = s.season.cup.champion === 'player' ? 3 : (s.season.cup.phase === 'finished' ? 0 : (s.season.cupResult != null ? s.season.cupResult : null));
  const rankOk = rank > 0 && rank <= goal.rank;
  const cupOk = cupRound != null ? cupRound >= goal.cup : null;
  return { rank, cupRound, rankOk, cupOk, reward: goal.reward };
}

export function settleBoard(s, finalRank, cupRound) {
  const goal = s.board.goal;
  const rankOk = finalRank <= goal.rank;
  const cupOk = cupRound >= goal.cup;
  if (rankOk && cupOk) {
    s.board.trust = clamp(s.board.trust + 15, 0, 100);
    s.team.bank += goal.reward;
    addLedger(s, 'income', goal.reward, '赛季目标达成奖励');
    pushNews(s, 'win', '董事会满意：达成赛季目标 +' + goal.reward);
  } else {
    s.board.trust = clamp(s.board.trust - 15, 0, 100);
    pushNews(s, 'lose', '董事会失望：未达成赛季目标');
  }
  if (s.board.trust <= 20) { s.board.fired = true; pushNews(s, 'lose', '老板忍无可忍，解雇了你'); }
  save();
}
```

- [ ] **Step 2: 实现战队体检**

```js
export function teamHealth(s) {
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const bank = s.team.bank;
  const budget = seasonBudget(s).budget;
  const money = bank >= budget * 0.5 ? 'green' : bank >= budget * 0.2 ? 'yellow' : 'red';
  const morale = s.team.morale >= 65 ? 'green' : s.team.morale >= 45 ? 'yellow' : 'red';
  const avgFatigue = s.team.roster.reduce((a, p) => a + p.fatigue, 0) / Math.max(1, s.team.roster.length);
  const fatigue = avgFatigue < 35 ? 'green' : avgFatigue < 60 ? 'yellow' : 'red';
  const roles = ROLES.slice(0, 5);
  const gaps = roles.filter((r) => !s.team.roster.some((p) => p.role === r));
  const roster = gaps.length === 0 ? 'green' : 'yellow';
  const stress = s.team.stressSum >= 60 ? 'red' : s.team.stressSum >= 30 ? 'yellow' : 'green';
  const advice = [];
  if (money === 'red') advice.push('资金低于安全垫，慎买人');
  if (morale === 'red') advice.push('士气低迷，考虑赢球或休息');
  if (fatigue === 'red') advice.push('疲劳过高，优先轮休');
  if (gaps.length) advice.push('阵容缺：' + gaps.join('、'));
  if (stress === 'red') advice.push('队内矛盾高，优先安抚');
  return { money, morale, fatigue, roster, stress, gaps, advice };
}
```

- [ ] **Step 3: 实现事件流（隐藏指标积累触发）**

```js
export const PERSONALITY_CN = {
  hyperAggressive: '好战', disciplined: '自律', clutchGod: '残局之王', mercurial: '情绪化', leader: '领袖', quiet: '安静', confident: '自信', fragile: '玻璃心'
};

const CHEM_RULES = { hyperAggressive: { good: ['clutchGod', 'confident'], bad: ['disciplined', 'fragile'] }, disciplined: { good: ['quiet', 'confident'], bad: ['hyperAggressive', 'mercurial'] }, clutchGod: { good: ['hyperAggressive', 'leader'], bad: ['mercurial'] }, mercurial: { good: ['clutchGod'], bad: ['disciplined', 'leader'] }, leader: { good: ['disciplined', 'confident'], bad: ['mercurial', 'fragile'] }, quiet: { good: ['disciplined', 'clutchGod'], bad: ['hyperAggressive'] }, confident: { good: ['leader', 'hyperAggressive'], bad: ['fragile'] }, fragile: { good: ['quiet', 'leader'], bad: ['confident', 'hyperAggressive'] } };

function chemistryPair(a, b) {
  const rule = CHEM_RULES[a] || { good: [], bad: [] };
  if (rule.good.includes(b)) return 10;
  if (rule.bad.includes(b)) return -12;
  return 0;
}

export function computeChemistry(s) {
  s.team.chemistry = 60;
  const roster = s.team.roster;
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      s.team.chemistry += chemistryPair(roster[i].personality, roster[j].personality);
    }
  }
  s.team.chemistry = clamp(s.team.chemistry, 30, 95);
  return s.team.chemistry;
}

export function sameTeamBonus(s) {
  const counts = {};
  for (const p of s.team.roster) {
    if (p.teamOfOrigin) counts[p.teamOfOrigin] = (counts[p.teamOfOrigin] || 0) + 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  return max >= 3 ? { react: -0.05, spreadMult: -0.03, label: '同队羁绊' } : null;
}

export function accumulateStress(s) {
  s.team.stressSum = 0;
  for (const p of s.team.roster) {
    p.stress = clamp((p.stress || 0) + (p.morale < 45 ? 3 : 0) + (p.fatigue > 60 ? 2 : 0), 0, 100);
    s.team.stressSum += p.stress;
  }
  return s.team.stressSum;
}

export function pendingEvents(s) {
  const evts = [];
  if (transferWindowOpen(s)) {
    if (rng() < 0.5) evts.push({ type: 'offer', text: '有战队对你队某选手感兴趣' });
  }
  const unhappy = s.team.roster.filter((p) => p.stress > 60 && p.role !== '指挥');
  for (const p of unhappy) evts.push({ type: 'unhappy', playerId: p.id, text: p.name + ' 因出场少/压力大想转会' });
  const conflict = s.team.roster.find((p) => p.stress > 70);
  if (conflict) evts.push({ type: 'conflict', playerId: conflict.id, text: conflict.name + ' 与队友关系紧张' });
  return evts;
}

export function respondEvent(s, type, playerId, choice) {
  const p = s.team.roster.find((x) => x.id === playerId);
  if (type === 'unhappy' && p) {
    if (choice === 'soothe') { p.morale = clamp(p.morale + 8, 20, 100); p.stress = clamp(p.stress - 15, 0, 100); pushNews(s, 'info', '安抚了 ' + p.name); }
    else if (choice === 'ignore') { p.morale = clamp(p.morale - 10, 20, 100); p.stress = clamp(p.stress + 10, 0, 100); pushNews(s, 'lose', p.name + ' 因被忽视而不满'); }
    else if (choice === 'promise') { p.morale = clamp(p.morale + 5, 20, 100); p.stress = clamp(p.stress - 8, 0, 100); pushNews(s, 'info', '承诺给 ' + p.name + ' 更多上场机会'); }
  }
  if (type === 'conflict' && p) {
    if (choice === 'mediate') { p.stress = clamp(p.stress - 20, 0, 100); s.team.stressSum = clamp(s.team.stressSum - 20, 0, 300); pushNews(s, 'info', '调解了队内矛盾'); }
    else if (choice === 'bench') { p.morale = clamp(p.morale - 10, 20, 100); pushNews(s, 'lose', p.name + ' 被下放替补，心生不满'); }
  }
  save();
  return { ok: true };
}
```

- [ ] **Step 4: 写测试**

在 test/manager.mjs 末尾追加：

```js
import { boardGoalFor, settleBoard, teamHealth, computeChemistry, sameTeamBonus, accumulateStress, pendingEvents, respondEvent } from '../src/manager.js';

s = newManagerCareer();
ok('board goal 乙级', boardGoalFor('乙级').rank === 2);
s.board.trust = 70;
settleBoard(s, 2, 1);
ok('goal met trust up', s.board.trust === 85);
ok('goal reward banked', s.team.bank > 12000);
s.board.trust = 30;
settleBoard(s, 8, 0);
ok('goal fail trust down', s.board.trust === 15);
ok('fired when trust low', s.board.fired === true);
s = newManagerCareer();
const h = teamHealth(s);
ok('health has 5 keys', ['money', 'morale', 'fatigue', 'roster', 'stress'].every((k) => k in h));
ok('health levels valid', ['green', 'yellow', 'red'].includes(h.money));
const ch = computeChemistry(s);
ok('chemistry 30-95', ch >= 30 && ch <= 95);
const bonus = sameTeamBonus(s);
ok('same team bonus type', bonus === null || (bonus.react < 0 && bonus.spreadMult < 0));
accumulateStress(s);
ok('stress sum number', typeof s.team.stressSum === 'number');
const pe = pendingEvents(s);
ok('pending events array', Array.isArray(pe));
```

- [ ] **Step 5: 跑测试 + 回归 + Commit**

Run: `node test/manager.mjs; node scripts/check-syntax.mjs`

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 核心机制 - 老板压力/战队体检/事件流/羁绊化学"
```

---

### Task 9: 赛季推进与结算（markFixture/settleMatch/nextSeason + 升降级）

**Files:**
- Modify: `src/manager.js`
- Test: `test/manager.mjs`

- [ ] **Step 1: 实现比赛结算 + 联赛推进**

```js
function updateTeamDynamics(s, homeId, awayId, winner) {
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const [lo, hi] = rules.ratingRange;
  for (const teamId of [homeId, awayId]) {
    const t = s.season.teams.find((x) => x.id === teamId);
    if (!t) continue;
    const won = winner === teamId;
    const form = (t.form || []).slice();
    form.push(won ? 'W' : 'L');
    if (form.length > 5) form.splice(0, form.length - 5);
    t.form = form;
    t.morale = clamp(Number(t.morale || 50) + (won ? 2 : -2), 20, 100);
    if (teamId !== 'player') {
      const formScore = form.reduce((a, f) => a + (f === 'W' ? 1 : -1), 0);
      t.rating = clamp(Math.round(Number(t.rating || 70) + (won ? 0.8 : -0.8) + formScore * 0.1), lo - 5, hi + 5);
    }
  }
}

export function markFixture(s, f, score, winner) {
  f.played = true;
  f.score = score;
  f.winner = winner;
  const home = s.season.standings.find((x) => x.teamId === f.home);
  const away = s.season.standings.find((x) => x.teamId === f.away);
  home.played++; away.played++;
  if (winner === f.home) { home.w++; away.l++; home.pts += 3; }
  else { away.w++; home.l++; away.pts += 3; }
  updateTeamDynamics(s, f.home, f.away, winner);
}

export function settlePlayerMatch(s, win, kills, deaths, opts = {}) {
  const f = nextFixture(s);
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const home = s.season.teams.find((x) => x.id === f.home);
  const away = s.season.teams.find((x) => x.id === f.away);
  const isHome = f.home === 'player';
  const score = win ? (isHome ? [5, 0] : [0, 5]) : (isHome ? [0, 5] : [5, 0]);
  markFixture(s, f, score, win ? 'player' : (isHome ? f.away : f.home));
  if (!opts.noReward) {
    const bankGain = (win ? rules.matchWin : rules.matchLose) + (opts.mvp ? 250 : 0);
    s.team.bank += bankGain;
    addLedger(s, 'income', bankGain, (win ? '比赛胜利奖金' : '比赛出场费') + '：' + home.name + ' vs ' + away.name);
    if (isHome) {
      const ticket = homeTicketIncome(s, win);
      s.team.bank += ticket;
      addLedger(s, 'income', ticket, '主场票房');
    }
    s.team.fans = Math.max(500, Math.round(s.team.fans * (win ? 1.05 : 0.98)));
  }
  s.team.morale = clamp(Number(s.team.morale) + (win ? 4 : -3), 20, 100);
  const fatigueGain = Math.max(1, 6 + (win ? 0 : 2) - (s.team.facilities.medical || 0) * 2);
  for (const p of s.team.roster) p.fatigue = clamp(p.fatigue + fatigueGain, 0, 100);
  s.team.trainingLeft = 2;
  s.manager.seasonStats.played++;
  if (win) s.manager.seasonStats.w++; else s.manager.seasonStats.l++;
  accumulateStress(s);
  advanceSeason(s);
  save();
  return { ok: true, bankGain };
}

function markCupMatch(s, m, score, win) {
  m.played = true;
  m.score = score;
  m.winner = win ? 'player' : (m.a === 'player' ? m.b : m.a);
  updateTeamDynamics(s, m.a, m.b, m.winner);
  if (!win) s.season.cupResult = m.round === 'QF' ? 0 : (m.round === 'SF' ? 1 : 2);
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
    const r = simulateManagerMatch(s, home, away, { league: s.team.league });
    m.played = true;
    m.score = r.score;
    m.winner = r.winner;
    m.simRounds = r.rounds.length;
    updateTeamDynamics(s, m.a, m.b, m.winner);
    refreshCup(s);
  }
}

function simulateLeagueRound(s) {
  const fixtures = s.season.fixtures.filter((f) => f.round === s.season.round && !f.played);
  for (const f of fixtures) {
    if (f.home === 'player' || f.away === 'player') continue;
    const home = s.season.teams.find((t) => t.id === f.home);
    const away = s.season.teams.find((t) => t.id === f.away);
    const r = simulateManagerMatch(s, home, away, { mapId: f.mapId, league: s.team.league });
    f.simRounds = r.rounds.length;
    markFixture(s, f, r.score, r.winner);
  }
  if (!s.season.fixtures.some((f) => f.round === s.season.round && !f.played)) {
    if (s.season.round < s.season.totalRounds) {
      s.season.round++;
    } else if (s.season.cup.phase === 'idle') {
      s.season.cup = makeCup(s.season.standings);
    }
  }
}

function advanceSeason(s) {
  if (s.season.cup.phase === 'active') {
    const pendingCup = s.season.cup.bracket.find((m) => !m.played && m.a === 'player');
    if (pendingCup) {
      return; // 等玩家打杯赛
    }
    simulateRemainingCup(s);
    if (s.season.cup.phase === 'finished') return;
  }
  simulateLeagueRound(s);
}
```

- [ ] **Step 2: 实现赛季结算 + 升降级 + nextSeason**

```js
function promoteLeague(league, rank) {
  if (league === '甲级') return rank >= 7 ? '乙级' : '甲级';
  if (league === '乙级') return rank <= 2 ? '甲级' : rank >= 7 ? '丙级' : '乙级';
  return rank <= 2 ? '乙级' : '丙级';
}

export function seasonReport(s) {
  const table = [...s.season.standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
  const rank = table.findIndex((x) => x.teamId === 'player') + 1;
  const cupRound = s.season.cup.champion === 'player' ? 3 : (s.season.cupResult != null ? s.season.cupResult : 0);
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  const rankPrize = { 1: 30000, 2: 20000, 3: 15000, 4: 8000, 5: 8000, 6: 8000, 7: 4000, 8: 4000 }[rank] || 0;
  const cupPrize = cupRound === 3 ? rules.cupFinalPrize : (cupRound >= 1 ? rules.cupRoundPrize : 0);
  const nextLeague = promoteLeague(s.team.league, rank);
  return { rank, table, cupRound, rankPrize, cupPrize, nextLeague, promoted: nextLeague !== s.team.league, relegated: nextLeague !== s.team.league };
}

export function nextSeason() {
  const s = getState();
  const rep = seasonReport(s);
  const rules = LEAGUE_RULES[s.team.league] || LEAGUE_RULES['乙级'];
  s.team.bank += rep.rankPrize + rep.cupPrize;
  addLedger(s, 'income', rep.rankPrize, '赛季排名奖金：第' + rep.rank + '名');
  if (rep.cupPrize) addLedger(s, 'income', rep.cupPrize, '杯赛奖金');
  settleBoard(s, rep.rank, rep.cupRound);
  s.history.push({ seasonId: s.season.id, league: s.team.league, rank: rep.rank, cupRound: rep.cupRound, prize: rep.rankPrize + rep.cupPrize });
  if (rep.rank < s.records.bestSeasonRank) s.records.bestSeasonRank = rep.rank;
  s.records.totalPrize += rep.rankPrize + rep.cupPrize;
  if (rep.cupRound === 3) s.records.cupChampions++;
  // 潜力兑现（青训）
  for (const p of s.team.roster) {
    if (p.age <= 24 && rng() < 0.35) {
      const gain = Math.min(3, 100 - p.rating);
      p.rating = clamp(p.rating + gain, 40, 99);
      p.attrs[p.role === '狙击' ? 'aim' : 'aim'] = clamp(p.attrs.aim + Math.min(3, 100 - p.attrs.aim), 0, 100);
    }
    p.contractYears--;
    if (p.contractYears < 0) { p.contractYears = 0; }
  }
  s.team.league = rep.nextLeague;
  s.team.bank = Math.max(3000, s.team.bank + (LEAGUE_RULES[s.team.league].budgetBase - rules.budgetBase));
  s.manager.seasonStats = { played: 0, w: 0, l: 0, prizeEarned: 0 };
  s.season.id++;
  buildNewSeason(s);
  s.team.transfersLeft = 2;
  s.team.trainingLeft = 2;
  s.team.pool = null;
  s.team.stressSum = 0;
  for (const p of s.team.roster) { p.fatigue = 0; }
  save();
  return s;
}
```

- [ ] **Step 3: 写测试（推进整个赛季到结算）**

在 test/manager.mjs 末尾追加：

```js
import { settlePlayerMatch, seasonReport, nextSeason, advanceSeason } from '../src/manager.js';

s = newManagerCareer();
// 打完联赛（模拟玩家场次 + 自动推进 AI 场次到杯赛）
let guard = 0;
while (s.season.round <= s.season.totalRounds && guard++ < 200) {
  const f = nextFixture(s);
  if (!f) break;
  settlePlayerMatch(s, rng() < 0.5, 15, 10);
}
ok('league reached cup', s.season.cup.phase === 'active' || s.season.cup.phase === 'finished');
// 打杯赛直到结束
guard = 0;
while (s.season.cup.phase === 'active' && guard++ < 30) {
  settlePlayerMatch(s, rng() < 0.5, 15, 10);
}
ok('cup finished', s.season.cup.phase === 'finished');
const rep = seasonReport(s);
ok('report rank 1-8', rep.rank >= 1 && rep.rank <= 8);
ok('report has league', ['甲级', '乙级', '丙级'].includes(rep.nextLeague));
const prevId = s.season.id;
s = nextSeason();
ok('season advanced', s.season.id === prevId + 1);
ok('new season teams', s.season.teams.length === 8);
ok('new fixtures', s.season.fixtures.length === 56);
```

- [ ] **Step 4: 跑测试 + 回归**

Run: `node test/manager.mjs; node scripts/check-syntax.mjs`

如果赛季循环死循环或有断言失败，检查 `settlePlayerMatch` 里 `advanceSeason` 的推进逻辑（重点：杯赛 phase 变化、round 递增、`nextFixture` 在杯赛期返回 null 的情况）。

- [ ] **Step 5: Commit**

```bash
git add src/manager.js test/manager.mjs
git commit -m "feat(manager): 赛季推进与结算 - 联赛/杯赛/升降级/潜力兑现/下赛季"
```

---

### Task 10: manager-match.js —— 实机观战（核心差异化）

**Files:**
- Create: `src/manager-match.js`
- Modify: `src/manager.js`（导出 pendingMatch 相关）
- Test: `test/manager-match.mjs`

- [ ] **Step 1: 实现选手→aiParams 映射 + 观战模式注册**

```js
// src/manager-match.js
import { registerMode, MODE_MAPS } from './registry.js';
import { setupMatchEntities, startRound, endRound } from './game.js';
import { teamDiffParams } from './modes.js';
import { ROLE_ARCHE, ATTRS } from './manager.js';
import { clamp } from './utils.js';
import { getState, settlePlayerMatch, save, nextFixture, teamProfile } from './manager.js';
import { ctx, seedWorld } from './ctx.js';

function emit(evt, p) { ctx.bus.emit(evt, p); }

export function mapManagerRosterToBots(roster, bots, state, side) {
  const base = teamDiffParams({ rating: Math.round(roster.reduce((a, p) => a + p.rating, 0) / Math.max(1, roster.length)) });
  const bonus = state && state.team ? sameTeamBonus(state) : null;
  for (let i = 0; i < bots.length; i++) {
    const p = roster[i % roster.length];
    const a = p.attrs || {};
    const morale = (p.morale != null ? p.morale : 50) - 50;
    const fatigue = (p.fatigue != null ? p.fatigue : 0) - 50;
    const formScore = (p.form || []).reduce((sum, f) => sum + (f === 'W' ? 1 : -1), 0);
    const e = bots[i];
    e.name = p.name;
    e.persona = ROLE_ARCHE[p.role] || 'rifler';
    const params = {
      ...base,
      react: clamp(0.22 - (a.react || 70) / 625, 0.06, 0.22),
      aimSpeed: 40 + (a.react || 70) * 0.9,
      spreadMult: clamp(1.1 - (a.aim || 70) / 200, 0.5, 1.05),
      prefireChance: clamp((a.aim || 70) / 800, 0, 0.12),
      strafe: clamp(0.6 - (a.movement || 70) / 400, 0.36, 0.6),
      counterStrafe: clamp(1.1 - (a.movement || 70) / 500, 0.8, 1.1),
      saveChance: clamp(0.75 - (a.clutch || 70) / 400, 0.3, 0.75),
      riskT: clamp(0.6 + (a.clutch || 70) / 250 + (a.aggression || 50) / 800 + (a.gameIQ || 50) / 1500, 0.3, 1.5),
      nadeUse: clamp(0.6 + (a.nade || 70) / 250, 0.25, 1.2),
      ecoDiscipline: clamp(0.8 + (a.discipline || 50) / 400, 0.5, 1.2),
      rotateChance: clamp(0.5 + (a.gameIQ || 50) / 250, 0.2, 0.9),
      rushChance: clamp(0.3 + (a.aggression || 50) / 300, 0.05, 0.9),
      spreadCtrl: clamp(0.9 + (a.discipline || 50) / 800, 0.8, 1.15),
      tradeSpeed: p.role === '补枪' ? 1.5 : 1.1
    };
    if (a.composure != null && a.composure < 50) params.riskT *= 0.85;
    const moraleMul = 1 + morale / 1000;
    const fatigueMul = 1 - clamp(fatigue, -50, 40) / 400;
    const formMul = 1 + formScore * 0.015;
    const m = clamp(moraleMul * fatigueMul * formMul, 0.85, 1.15);
    params.spreadMult = clamp(params.spreadMult * (1 + (1 - m) * 0.3), 0.5, 1.1);
    params.strafe = clamp(params.strafe * (1 + (1 - m) * 0.25), 0.36, 0.65);
    params.react = clamp(params.react * (1 + (1 - m) * 0.15), 0.05, 0.24);
    if (bonus) { params.react *= (1 + bonus.react); params.spreadMult *= (1 + bonus.spreadMult); }
    e.aiParams = params;
  }
}
```

- [ ] **Step 2: 导入 sameTeamBonus 并在 manager.js 导出**

在 manager.js 的 export 中确认 `sameTeamBonus` 已导出（Task 8 已写）。在 manager-match.js 顶部 import 行补：

```js
import { ROLE_ARCHE, sameTeamBonus } from './manager.js';
```

（把 Step1 代码里 manager.js 的 import 合并为 `import { ROLE_ARCHE, sameTeamBonus, getState, settlePlayerMatch, save, nextFixture } from './manager.js';`）

- [ ] **Step 3: 实现 managerStart / managerUpdate / managerOnFinish**

```js
let pending = null;

export function startManagerMatch(game, oppId, venue, isCup) {
  const s = getState();
  pending = { oppId, venue, isCup, seed: Math.floor(Math.random() * 0x7fffffff) };
  game.seed = pending.seed;
  game.opts.mode = 'manager';
  game.opts.team = 'ct';
  game.opts.bots = 5;
  game.opts.mapId = 'dust2';
  game.opts.diff = 'hard';
  game.opts.diffParams = null;
  return startMatch(game);
}

export function managerStart(game) {
  for (const k of ['cyber', 'major']) delete game[k];
  const s = getState();
  const f = nextFixture(s);
  if (!f) { emit('toast', { text: '没有待进行的比赛' }); return; }
  const oppId = f.home === 'player' ? f.away : f.home;
  const isHome = f.home === 'player';
  const opp = s.season.teams.find((t) => t.id === oppId);
  game.opts.mapId = f.mapId || 'dust2';
  game.entities = [];
  setupMatchEntities(game);
  game.entities = game.entities.filter((e) => e.bot);
  game.player = { dead: true, kills: 0, deaths: 0, assists: 0, team: 'ct', name: '经理', x: 0, y: 0, vx: 0, vy: 0, angle: 0, height: 0, weapons: {}, ammoMap: {}, reserveMap: {}, wKills: {}, stats: { hits: 0, shots: 0, headshots: 0 } };
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  const myRoster = s.team.roster.slice().sort((a, b) => a.role === '指挥' ? -1 : b.role === '指挥' ? 1 : 0);
  mapManagerRosterToBots(isHome ? myRoster : opp.roster, tBots, s, 't');
  mapManagerRosterToBots(isHome ? opp.roster : myRoster, cBots, s, 'ct');
  game.manager = {
    oppId, oppName: opp.name, oppTag: opp.tag, oppRating: opp.rating,
    isHome, isCup: false, scoreLimit: 5, speed: 1, skip: false, ended: false,
    events: [], settled: false
  };
  startRound(game);
  emit('toast', { text: '我的战队 vs ' + opp.name + ' 开赛' });
}

function managerPanelHtml(game) {
  const g = game.manager;
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  const tKills = tBots.reduce((sum, e) => sum + (e.kills || 0), 0);
  const cKills = cBots.reduce((sum, e) => sum + (e.kills || 0), 0);
  const leader = game.entities.filter((e) => e.bot && !e.dead).sort((a, b) => b.kills - a.kills)[0];
  const mapId = game.opts.mapId || 'dust2';
  return '<div class="cyber-panel">' +
    '<div class="cyber-card c-left"><b>我方</b><span>' + g.oppTag + ' 对手</span><i>' + g.oppRating + '</i><em>' + game.score.T + ' · ' + tKills + ' 击杀</em></div>' +
    '<div class="cyber-mid"><b>' + game.score.T + ' : ' + game.score.CT + '</b><span>R' + game.round + ' · ' + mapId + '</span>' +
    '<em>' + (game.manager.isHome ? '主场' : '客场') + ' · 比分</em></div>' +
    '<div class="cyber-card c-right"><b>' + g.oppName + '</b><span>对手</span><i>' + g.oppRating + '</i><em>' + game.score.CT + ' · ' + cKills + ' 击杀</em></div>' +
    '<div class="cyber-controls"><button data-m-speed="1" class="cyber-speed' + (g.speed === 1 ? ' on' : '') + '">1x</button><button data-m-speed="2" class="cyber-speed' + (g.speed === 2 ? ' on' : '') + '">2x</button><button data-m-speed="4" class="cyber-speed' + (g.speed === 4 ? ' on' : '') + '">4x</button><button data-m-speed="8" class="cyber-speed' + (g.speed === 8 ? ' on' : '') + '">8x</button><button data-m-skip="1" class="cyber-skip">跳过本回合</button></div>' +
    (leader ? '<div class="cyber-mvp">MVP ' + leader.name + ' · ' + leader.kills + ' 击杀</div>' : '') +
    '</div>';
}

export function managerUpdate(game, dt) {
  const g = game.manager;
  if (!g || g.ended || game.over) return;
  if (g.skip) {
    g.skip = false;
    if (game.state !== 'END') endRound(game, null, '本回合跳过', 'skip');
    game.endedT = 0.05;
    return;
  }
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (g._panelT || 0) > 150) {
    g._panelT = now;
    const el = typeof document !== 'undefined' ? document.getElementById('managerMatchPanel') : null;
    if (el) { el.style.display = 'block'; el.innerHTML = managerPanelHtml(game); if (!el._mBound) { el.addEventListener('click', (e) => { const b = e.target && e.target.closest ? e.target.closest('[data-m-speed],[data-m-skip]') : null; if (!b || !game.manager) return; if (b.hasAttribute('data-m-speed')) game.manager.speed = Number(b.getAttribute('data-m-speed')) || 1; else if (b.hasAttribute('data-m-skip')) game.manager.skip = true; }, false); el._mBound = true; } }
  }
  const limit = 5;
  const afterLimit = game.round > 9;
  const tWon = game.score.T >= limit || (afterLimit && game.score.T > game.score.CT);
  const cWon = game.score.CT >= limit || (afterLimit && game.score.CT > game.score.T);
  if (tWon || cWon) { g.ended = true; finishManagerMatch(game, tWon); }
}

export function managerOnFinish(game) {
  const g = game.manager;
  if (!g || g.settled) return;
  const s = getState();
  const win = (game.score.T >= 5 && game.player.team === 't') || (game.score.CT >= 5 && game.player.team === 'ct');
  const opp = s.season.teams.find((t) => t.id === g.oppId);
  const winAt = game.ot ? (game.otWin || 8) : 5;
  const myWon = (game.score.T >= winAt && game.player.team === 't') || (game.score.CT >= winAt && game.player.team === 'ct');
  // 真实比分由经理侧决定：managerUpdate 已在胜利时置 ended；此处若已被 managerUpdate 结算则跳过
  g.settled = true;
  const result = settlePlayerMatch(s, myWon, 0, 0, { mvp: null });
  const el = typeof document !== 'undefined' ? document.getElementById('managerMatchPanel') : null;
  if (el) el.style.display = 'none';
  if (result && result.ok) {
    if (typeof window !== 'undefined' && window.__managerEndMatch) window.__managerEndMatch(game);
  }
}
```

- [ ] **Step 4: 实现 finishManagerMatch（由 managerUpdate 在比分达到时结算）**

```js
export function finishManagerMatch(game, tWon) {
  const g = game.manager;
  if (g.settled) return;
  g.settled = true;
  const s = getState();
  const myWon = g.isHome ? tWon : !tWon;
  const result = settlePlayerMatch(s, myWon, 0, 0, { mvp: null });
  const el = typeof document !== 'undefined' ? document.getElementById('managerMatchPanel') : null;
  if (el) el.style.display = 'none';
  game.over = true;
  game.state = 'END';
  game.noRoundEnd = true;
  emit('banner', { t1: myWon ? '获胜' : '落败', t2: '比分 ' + game.score.T + ':' + game.score.CT, col: myWon ? '#ffd27a' : '#ff4d4d' });
  if (myWon) emit('sfx', { name: 'win', vol: 0.9, game });
  else emit('sfx', { name: 'lose', vol: 0.8, game });
  if (typeof window !== 'undefined' && window.__managerEndMatch) window.__managerEndMatch(game);
}
```

- [ ] **Step 5: 注册模式**

```js
registerMode({
  id: 'manager', name: '电竞经理', desc: '管理战队·实机观战', customBots: false,
  start: managerStart, update: managerUpdate, onFinish: managerOnFinish
});
```

- [ ] **Step 6: 写测试**

```js
// test/manager-match.mjs
import { setStorage, setRng, newManagerCareer, getState } from '../src/manager.js';
import { registerMode, getMode } from '../src/registry.js';
import { createGame, startMatch } from '../src/game.js';
import { mapManagerRosterToBots } from '../src/manager-match.js';
import './../src/manager-match.js';  // 副作用注册

const ok = (name, cond) => { if (!cond) throw new Error('manager-match: ' + name + ' FAIL'); console.log('manager-match: ' + name + ' PASS'); };

function fakeStorage() { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map }; }
setStorage(fakeStorage());
setRng(() => 0.5);

ok('mode registered', getMode('manager') && getMode('manager').id === 'manager');

let s = newManagerCareer();
const testBots = [ { aiParams: {} }, { aiParams: {} }, { aiParams: {} }, { aiParams: {} }, { aiParams: {} } ];
const strong = s.team.roster.map((p) => ({ ...p, attrs: { ...p.attrs, aim: 99, react: 99 } }));
mapManagerRosterToBots(strong, testBots, s, 't');
ok('bots get aiParams', testBots.every((b) => b.aiParams && b.aiParams.react));
ok('strong aim -> tight spread', testBots[0].aiParams.spreadMult < 0.7);
ok('persona mapped', testBots[0].persona === 'breacher' || testBots[0].persona === 'sniper' || testBots[0].persona === 'support' || testBots[0].persona === 'rifler' || testBots[0].persona === 'lurk');
ok('names applied', testBots.every((b) => typeof b.name === 'string'));

const game = createGame({ mode: 'manager', team: 'ct', bots: 5, mapId: 'dust2', diff: 'hard' });
game.ui = null;
startMatch(game);
ok('manager match started', game.manager && game.entities.filter((e) => e.bot).length === 10);
ok('player is spectator', game.player && game.player.dead === true);
ok('state BUY', game.state === 'BUY');
```

- [ ] **Step 7: 跑测试**

Run: `node test/manager-match.mjs`
Expected: 全部 PASS。若 `mapManagerRosterToBots` 报 `sameTeamBonus is not a function`，检查 manager.js 是否导出。

- [ ] **Step 8: 全量回归 + Commit**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs`

```bash
git add src/manager-match.js test/manager-match.mjs
git commit -m "feat(manager): 实机观战引擎 - 选手9维能力→aiParams映射 + 观战模式注册"
```

---

### Task 11: manager-ui.js —— 经理面板（Tab 渲染 + 事件委托）

**Files:**
- Create: `src/manager-ui.js`
- Test: `test/manager.mjs`（追加 UI 段）

- [ ] **Step 1: 实现 UI 骨架（init/open/render + tab 分发）**

```js
import {
  getState, newManagerCareer, resetManager, save, loadManager, isStorageAvailable,
  nextFixture, teamProfile, seasonReport, teamHealth, boardTrust, seasonGoalProgress,
  settlePlayerMatch, simulateManagerMatch, nextSeason,
  rosterContribution, transferWindowOpen, candidates, scoutedView, scoutingNoise,
  filterCandidates, buyPlayer, sellPlayer, sellPreview, renewPlayer,
  trainPlayer, restPlayer, trainingPreview, facilityStatus, upgradeFacility,
  sponsorIncome, homeTicketIncome, cashflowForecast, seasonBudget, financialRisk,
  ledgerRecent, transferProfit, computeChemistry, sameTeamBonus, accumulateStress,
  pendingEvents, respondEvent, TRAIN_TIERS, ATTRS, PERSONALITY_CN, ROLE_WEIGHTS
} from './manager.js';
import { startManagerMatch } from './manager-match.js';

let doc = null;
let game = null;
let tab = 'dash';
let transferRole = '';
let transferSort = 'rating';

function el(id) { return doc ? doc.getElementById(id) : null; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(t) { if (game && game.ui) game.ui.showToast(t); }
function money(n) { return Number(n || 0).toLocaleString('zh-CN'); }
function league() { return getState().team.league; }
function healthColor(c) { return c === 'green' ? '#4ade80' : c === 'yellow' ? '#facc15' : '#f87171'; }

export function initManagerUi(documentRef, gameRef) {
  doc = documentRef;
  game = gameRef;
  const panel = el('managerPanel');
  if (!panel) return;
  panel.addEventListener('click', onClick, false);
  panel.addEventListener('change', onChange, false);
  window.__openManager = openManager;
  window.__managerEndMatch = (g) => { openManager(); };
}

export function openManager() {
  const s = getState();
  if (!isStorageAvailable()) toast('经理进度不会保存');
  const panel = el('managerPanel');
  if (!panel) return;
  panel.style.display = 'block';
  if (el('menu')) el('menu').classList.remove('show');
  if (el('end')) el('end').classList.remove('show');
  tab = 'dash';
  render();
}
```

- [ ] **Step 2: 实现 render 总入口 + 顶部条 + tab 条**

```js
const TABS = [
  ['dash', '总览'], ['schedule', '赛程'], ['roster', '阵容'], ['transfer', '转会'],
  ['training', '训练'], ['standings', '排名'], ['cup', '杯赛'], ['finance', '财务'], ['stats', '数据']
];

function render() {
  const s = getState();
  const panel = el('managerPanel');
  if (!panel) return;
  let html = '<div class="career-top">' +
    '<span class="ct-mode">电竞经理</span>' +
    '<span class="ct-season">第 ' + s.season.id + ' 赛季 · 第 ' + s.season.round + '/' + s.season.totalRounds + ' 轮 · ' + esc(s.team.league) + '联赛' + (s.season.cup.phase !== 'idle' ? ' · 杯赛' : '') + '</span>' +
    '<span class="ct-bank">资金 ¥' + money(s.team.bank) + '</span>' +
    '<button data-act="menu">←主菜单</button></div>';
  html += '<div class="career-tabs">';
  for (const [id, label] of TABS) html += '<button class="career-tab' + (tab === id ? ' sel' : '') + '" data-act="tab" data-tab="' + id + '">' + label + '</button>';
  html += '</div><div class="career-body">';
  const rr = { dash: renderDash, schedule: renderSchedule, roster: renderRoster, transfer: renderTransfer, training: renderTraining, standings: renderStandings, cup: renderCup, finance: renderFinance, stats: renderStats }[tab] || renderDash;
  html += rr(s);
  html += '</div>';
  panel.innerHTML = html;
}
```

- [ ] **Step 3: 实现 renderDash（体检红绿灯 + 下一场 + 目标 + 事件流）**

```js
function renderDash(s) {
  const h = teamHealth(s);
  const f = nextFixture(s);
  const goal = seasonGoalProgress(s);
  let html = '<div class="career-card"><h4>战队体检</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.money) + '">' + (h.money === 'green' ? '资金健康' : h.money === 'yellow' ? '资金吃紧' : '资金告急') + '</b><span>' + money(s.team.bank) + '</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.morale) + '">' + (h.morale === 'green' ? '士气高昂' : h.morale === 'yellow' ? '士气平平' : '士气低迷') + '</b><span>' + s.team.morale + '</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.fatigue) + '">' + (h.fatigue === 'green' ? '体力充沛' : h.fatigue === 'yellow' ? '略有疲劳' : '疲劳过高') + '</b><span>团队疲劳</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.roster) + '">' + (h.roster === 'green' ? '阵容完整' : '有位置空缺') + '</b><span>' + (h.gaps.length ? h.gaps.join('、') : '五位置齐备') + '</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.stress) + '">' + (h.stress === 'green' ? '更衣室平静' : h.stress === 'yellow' ? '有小矛盾' : '更衣室紧张') + '</b><span>压力值 ' + s.team.stressSum + '</span></div>' +
    '</div>' + (h.advice.length ? '<div class="career-stats"><span>建议：' + h.advice.map(esc).join('；') + '</span></div>' : '') + '</div>';
  if (f) {
    const opp = s.season.teams.find((t) => t.id === (f.home === 'player' ? f.away : f.home));
    const isHome = f.home === 'player';
    html += '<div class="career-card"><h4>下一场 · 第 ' + f.round + ' 轮</h4>' +
      '<div class="career-stats"><b>' + esc(opp.name) + '</b> (' + opp.rating + ' 评 · ' + esc(opp.style || '未知') + ') · ' + (isHome ? '主场' : '客场') + ' · 地图 ' + esc(f.mapId) + '</div>' +
      '<div class="career-actions"><button data-act="play">开始比赛（实机观战）</button><button data-act="sim">模拟本场</button></div></div>';
  } else if (s.season.cup.phase === 'active') {
    html += '<div class="career-card"><h4>杯赛进行中</h4><div class="career-actions"><button data-act="play-cup">打杯赛</button></div></div>';
  }
  html += '<div class="career-card"><h4>赛季目标 · 董事会信任 ' + s.board.trust + '</h4>' +
    '<div class="career-stats"><span>排名目标 前 ' + goal.rank + '（当前 ' + (goal.rank || '-') + ' 名）· 杯赛目标 ' + (goal.cupRound >= 1 ? '进淘汰赛' : '无') + ' · 奖励 ' + money(goal.reward) + '</span></div>' +
    '<div class="career-stats"><span>' + (s.board.fired ? '⚠ 你已被解雇' : '董事会信任 ' + s.board.trust + '/100') + '</span></div></div>';
  const pe = pendingEvents(s);
  if (pe.length) {
    html += '<div class="career-card"><h4>待处理事件</h4>';
    for (const ev of pe) {
      html += '<div class="career-stats"><span>' + esc(ev.text) + '</span></div>';
      if (ev.playerId) {
        html += '<div class="career-actions">' +
          '<button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="soothe">安抚</button>' +
          '<button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="promise">承诺上场</button>' +
          '<button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="ignore">放任</button></div>';
      }
    }
    html += '</div>';
  }
  html += '<div class="career-card"><h4>事件流</h4>' + (s.news || []).slice(0, 8).map((n) => '<div class="career-news ' + (n.type === 'win' ? 'win' : n.type === 'lose' ? 'lose' : '') + '">' + esc(n.text) + '</div>').join('') + '</div>';
  return html;
}
```

- [ ] **Step 4: 实现 renderSchedule / renderStandings / renderCup**

```js
function renderSchedule(s) {
  let html = '<div class="career-card"><h4>联赛规则 · ' + esc(s.team.league) + '</h4>' +
    '<div class="career-stats"><span>8 队双循环 14 轮 · 胜 3 分 · 甲级前6保级 · 乙级前2升级后2降级 · 丙级前2升级</span></div></div>';
  html += '<div class="career-grid2">';
  const byRound = {};
  for (const f of s.season.fixtures) (byRound[f.round] = byRound[f.round] || []).push(f);
  for (let r = 1; r <= s.season.totalRounds; r++) {
    const fs = byRound[r] || [];
    html += '<div class="career-card"><div class="career-round' + (r === s.season.round ? ' cur' : '') + '">第 ' + r + ' 轮</div>';
    for (const f of fs) {
      const h = s.season.teams.find((t) => t.id === f.home);
      const a = s.season.teams.find((t) => t.id === f.away);
      const mine = f.home === 'player' || f.away === 'player';
      const label = (f.played ? (h ? h.tag : '') + ' ' + (f.score ? f.score.join(':') : '') + ' ' + (a ? a.tag : '') : (mine ? '我的战队 vs ' + (a ? a.tag : '') : (h ? h.tag : '') + ' vs ' + (a ? a.tag : '')));
      html += '<div class="career-fixture' + (mine ? ' mine' : '') + '"><span>' + esc(label) + '</span>' + (mine && !f.played ? '<button data-act="play" data-fixture="1">打</button>' : '') + (mine && f.played ? '<span>· ' + (f.winner === 'player' ? '胜' : '负') + '</span>' : '') + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderStandings(s) {
  const table = [...s.season.standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
  let html = '<div class="career-card"><h4>积分榜</h4><div class="career-table"><table><tr><th>#</th><th>队伍</th><th>场</th><th>胜</th><th>负</th><th>分</th></tr>';
  table.forEach((row, i) => {
    const t = s.season.teams.find((x) => x.id === row.teamId);
    const cls = row.teamId === 'player' ? ' class="mine"' : '';
    html += '<tr' + cls + '><td>' + (i + 1) + '</td><td>' + esc(t ? t.name : row.teamId) + '</td><td>' + row.played + '</td><td>' + row.w + '</td><td>' + row.l + '</td><td>' + row.pts + '</td></tr>';
  });
  html += '</table></div></div>';
  return html;
}

function renderCup(s) {
  if (s.season.cup.phase === 'idle') return '<div class="career-card"><h4>杯赛</h4><div class="career-stats"><span>联赛结束后开始</span></div></div>';
  const b = s.season.cup.bracket;
  let html = '<div class="career-card"><h4>淘汰赛</h4>';
  for (const m of b) {
    const ha = m.a ? s.season.teams.find((t) => t.id === m.a) : null;
    const hb = m.b ? s.season.teams.find((t) => t.id === m.b) : null;
    const mine = m.a === 'player' || m.b === 'player';
    const label = m.played ? (ha ? ha.tag : '') + ' ' + (m.score ? m.score.join(':') : '') + ' ' + (hb ? hb.tag : '') : (ha ? ha.tag : '待定') + ' vs ' + (hb ? hb.tag : '待定');
    html += '<div class="career-cup-match' + (mine ? ' mine' : '') + '"><span>' + m.round + ' · ' + esc(label) + '</span>' + (mine && !m.played ? '<button data-act="play-cup">打</button>' : '') + '</div>';
  }
  if (s.season.cup.champion) html += '<div class="career-stats"><b>冠军：' + esc(s.season.cup.champion) + '</b></div>';
  html += '</div>';
  return html;
}
```

- [ ] **Step 5: 实现 renderRoster / renderTransfer / renderTraining / renderFinance / renderStats**

```js
function renderRoster(s) {
  let html = '<div class="career-card"><h4>阵容（' + s.team.roster.length + '/6）· 化学 ' + s.team.chemistry + '</h4><div class="career-roster">';
  for (const p of s.team.roster) {
    html += '<div class="career-player-card">' +
      '<b>' + esc(p.name) + '</b><span>' + esc(p.role) + ' · ' + p.rating + ' 评 · 潜力 ' + '★'.repeat(Math.max(1, Math.round(p.potential / 20))) + '</span>' +
      '<span>身价 ¥' + money(p.price) + ' · 合同 ' + p.contractYears + ' 年 · ' + p.age + ' 岁</span>' +
      '<span>士气 ' + p.morale + ' · 疲劳 ' + p.fatigue + ' · 压力 ' + p.stress + '</span>' +
      '<span>性格：' + (PERSONALITY_CN[p.personality] || p.personality) + '</span>' +
      '<div class="career-actions"><button data-act="rest" data-pid="' + p.id + '">休息</button>' +
      (p.contractYears <= 1 ? '<button data-act="renew" data-pid="' + p.id + '">续约</button>' : '') +
      (transferWindowOpen(s) ? '<button data-act="sell" data-pid="' + p.id + '">卖出</button>' : '') + '</div></div>';
  }
  html += '</div></div>';
  return html;
}

function renderTransfer(s) {
  const windowOpen = transferWindowOpen(s);
  let html = '<div class="career-card"><h4>转会窗' + (windowOpen ? '（开放中，剩余 ' + s.team.transfersLeft + ' 次）' : '（第 5-8 轮开放）') + '</h4>';
  html += '<div class="career-stats"><span>球探噪声 ±' + scoutingNoise(s) + ' · 深度球探可看精确潜力</span></div></div>';
  if (!windowOpen) return html;
  const pool = candidates(s);
  const filtered = filterCandidates(pool, { role: transferRole, sort: transferSort });
  html += '<div class="career-card"><h4>候选池</h4><div class="career-stats">' +
    '<select data-filter="role"><option value="">全部位置</option>' + ['突破', '狙击', '指挥', '步枪', '自由人', '补枪'].map((r) => '<option value="' + r + '"' + (transferRole === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
    '<select data-filter="sort"><option value="rating" ' + (transferSort === 'rating' ? 'selected' : '') + '>按评级</option><option value="price" ' + (transferSort === 'price' ? 'selected' : '') + '>按身价</option></select></div><div class="career-pool">';
  for (const c of filtered) {
    const v = scoutedView(c, scoutingNoise(s));
    html += '<div class="career-player-card">' +
      '<b>' + esc(c.name) + '</b><span>' + esc(c.role) + ' · 评级 ' + v.rating + ' ±' + scoutingNoise(s) + ' · 潜力 ' + '★'.repeat(v.potentialStars) + '</span>' +
      '<span>身价 ¥' + money(c.price) + ' · 年龄 ' + c.age + ' · 出身 ' + esc(c.teamOfOrigin || '自由') + '</span>' +
      '<span>性格：' + (PERSONALITY_CN[c.personality] || c.personality) + '</span>' +
      '<div class="career-actions"><button data-act="buy" data-cid="' + c.id + '">买入 ¥' + money(c.price) + '</button></div></div>';
  }
  html += '</div></div>';
  return html;
}

function renderTraining(s) {
  const rules = TRAIN_TIERS;
  let html = '<div class="career-card"><h4>训练（剩余 ' + s.team.trainingLeft + ' 次）</h4><div class="career-stats"><span>提升选手单维属性</span></div></div>';
  for (const p of s.team.roster) {
    html += '<div class="career-card"><h4>' + esc(p.name) + ' · ' + esc(p.role) + '</h4><div class="career-stats">' +
      ATTRS.map((a) => '<span>' + esc(a) + ' ' + p.attrs[a] + '</span>').join('') + '</div><div class="career-actions">';
    for (const tier of rules) {
      const prev = trainingPreview(s, p, tier.key);
      html += '<button data-act="train" data-pid="' + p.id + '" data-attr="aim" data-tier="' + tier.key + '">' + tier.label + ' aim ¥' + money(prev.cost) + '</button>';
    }
    html += '</div></div>';
  }
  html += '<div class="career-card"><h4>设施</h4>';
  for (const f of facilityStatus(s)) {
    html += '<div class="career-stats"><span>' + f.label + ' Lv.' + f.level + '/' + f.max + ' · ' + esc(f.desc) + '</span>' +
      (f.cost ? '<button data-act="upgrade" data-fac="' + f.key + '">升级 ¥' + money(f.cost) + '</button>' : '') + '</div>';
  }
  html += '</div>';
  return html;
}

function renderFinance(s) {
  const cf = cashflowForecast(s);
  const sb = seasonBudget(s);
  const fr = financialRisk(s);
  const tp = transferProfit(s);
  let html = '<div class="career-card"><h4>财务概览 · ' + fr.level + '</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>¥' + money(s.team.bank) + '</b><span>现金</span></div>' +
    '<div class="career-kpi"><b>¥' + money(cf.projected) + '</b><span>预测赛季末</span></div>' +
    '<div class="career-kpi"><b>¥' + money(sb.budget) + '</b><span>赛季预算</span></div>' +
    '<div class="career-kpi"><b>¥' + money(sponsorIncome(s)) + '</b><span>本季赞助</span></div>' +
    '</div>' + (fr.reasons.length ? '<div class="career-stats"><span>风险：' + fr.reasons.join('；') + '</span></div>' : '') + '</div>';
  html += '<div class="career-card"><h4>资金流水</h4>' + ledgerRecent(s, 30).map((l) => '<div class="career-news">' + esc(l.label) + ' · ' + (l.amount > 0 ? '+' : '') + money(l.amount) + '</div>').join('') + '</div>';
  html += '<div class="career-card"><h4>转会盈亏</h4><div class="career-stats"><span>卖出 ¥' + money(tp.sellTotal) + ' · 买入 ¥' + money(tp.buyTotal) + '</span></div></div>';
  return html;
}

function renderStats(s) {
  const rep = seasonReport(s);
  let html = '<div class="career-card"><h4>赛季数据</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>' + s.manager.seasonStats.w + '胜</b><span>' + s.manager.seasonStats.l + ' 负</span></div>' +
    '<div class="career-kpi"><b>' + s.manager.seasonStats.played + '</b><span>场次</span></div>' +
    '<div class="career-kpi"><b>¥' + money(s.records.totalPrize) + '</b><span>生涯奖金</span></div>' +
    '<div class="career-kpi"><b>' + s.records.cupChampions + '</b><span>杯赛冠军</span></div>' +
    '</div></div>';
  html += '<div class="career-card"><h4>生涯</h4>' + s.history.map((h) => '<div class="career-news">第' + h.seasonId + '赛季 · ' + esc(h.league) + ' · 第' + h.rank + '名 · 奖金 ¥' + money(h.prize) + '</div>').join('') + '</div>';
  return html;
}
```

- [ ] **Step 6: 实现 onClick / onChange 事件委托**

```js
function onClick(e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!t) return;
  const act = t.getAttribute('data-act');
  const s = getState();
  if (act === 'tab') { tab = t.getAttribute('data-tab') || 'dash'; render(); }
  else if (act === 'menu') { el('managerPanel').style.display = 'none'; if (game.ui) game.ui.showMenu(); }
  else if (act === 'play') {
    el('managerPanel').style.display = 'none';
    startManagerMatch(game, null, null, false);
  } else if (act === 'sim') {
    const f = nextFixture(s);
    const opp = s.season.teams.find((x) => x.id === (f.home === 'player' ? f.away : f.home));
    const me = s.season.teams.find((x) => x.id === 'player');
    const r = simulateManagerMatch(s, me, opp, { mapId: f.mapId, league: s.team.league });
    const isHome = f.home === 'player';
    const score = r.winner === 'player' ? (isHome ? r.score : r.score.slice().reverse()) : r.score;
    settlePlayerMatch(s, r.winner === 'player', 0, 0, { mvp: null });
    toast('模拟结束：' + r.winner === 'player' ? '获胜' : '落败');
    render();
  } else if (act === 'play-cup') {
    el('managerPanel').style.display = 'none';
    startManagerMatch(game, null, null, true);
  } else if (act === 'buy') {
    const r = buyPlayer(s, t.getAttribute('data-cid'));
    toast(r.ok ? '买入成功' : (r.msg || '买入失败'));
    render();
  } else if (act === 'sell') {
    const r = sellPlayer(s, t.getAttribute('data-pid'));
    toast(r.ok ? '已卖出，回款 ' + r.refund : (r.msg || '卖出失败'));
    render();
  } else if (act === 'renew') {
    const r = renewPlayer(s, t.getAttribute('data-pid'));
    toast(r.ok ? '续约成功' : (r.msg || '续约失败'));
    render();
  } else if (act === 'rest') {
    const r = restPlayer(s, t.getAttribute('data-pid'));
    toast(r.ok ? '已休息' : (r.msg || '失败'));
    render();
  } else if (act === 'train') {
    const r = trainPlayer(s, t.getAttribute('data-pid'), t.getAttribute('data-attr'), t.getAttribute('data-tier'));
    toast(r.ok ? '训练完成 +' + r.gained : (r.msg || '训练失败'));
    render();
  } else if (act === 'upgrade') {
    const r = upgradeFacility(s, t.getAttribute('data-fac'));
    toast(r.ok ? '升级成功' : (r.msg || '升级失败'));
    render();
  } else if (act === 'evt') {
    respondEvent(s, t.getAttribute('data-evt'), t.getAttribute('data-pid'), t.getAttribute('data-choice'));
    render();
  }
}

function onChange(e) {
  const target = e && e.target;
  const filter = target && target.getAttribute ? target.getAttribute('data-filter') : null;
  if (!filter) return;
  if (filter === 'role') transferRole = target.value || '';
  else if (filter === 'sort') transferSort = target.value || 'rating';
  render();
}

export function __renderManagerTabForTest(name, stateRef) { tab = name; render(); }
```

- [ ] **Step 7: 处理「rosterContribution」未定义问题**

renderRoster 用到 `s.team.chemistry`（Task 8 的 computeChemistry 需在赛季初始化后调用）。在 `openManager` 开头加：

```js
export function openManager() {
  const s = getState();
  computeChemistry(s);
  ...
}
```

（`computeChemistry` 已在 Task 8 实现并导出。）

- [ ] **Step 8: 写 UI 测试（追加到 test/manager.mjs 末尾）**

```js
import { installStubs, registerDomIds } from './stubdom.js';
import { initManagerUi, openManager, __renderManagerTabForTest } from '../src/manager-ui.js';
import '../src/manager-match.js';

installStubs();
registerDomIds('managerPanel');
initManagerUi(globalThis.document, { ui: { showMenu() {}, showToast() {} } });
openManager();
ok('manager panel shown', globalThis.document.getElementById('managerPanel').style.display === 'block');
ok('manager panel has content', globalThis.document.getElementById('managerPanel').innerHTML.includes('电竞经理'));
```

- [ ] **Step 9: 跑测试**

Run: `node test/manager.mjs`
Expected: 全部 PASS。若 `renderRoster` 报 `p.potential` undefined 等，检查选手对象字段。

Run: `node scripts/check-syntax.mjs`

- [ ] **Step 10: Commit**

```bash
git add src/manager-ui.js test/manager.mjs
git commit -m "feat(manager): 经理面板 UI - 总览/赛程/阵容/转会/训练/排名/杯赛/财务/数据 Tab"
```

---

### Task 12: 接线（index.html / ui.js / main.js + 玻璃样式）

**Files:**
- Modify: `index.html`
- Modify: `src/ui.js`
- Modify: `src/main.js`
- Modify: `styles.css`
- Modify: `docs/MODES.md`

- [ ] **Step 1: index.html 加 managerPanel 容器 + 模式卡片**

在 `index.html` 的 careerPanel 行（约 20 行）后加：

```html
<div class="ov" id="managerPanel" style="display:none"></div>
```

在主菜单模式卡区（约 106 行 career 卡片后）加：

```html
<button class="mode-card" data-mode="manager"><b>电竞经理</b><small>管理 + 实机观战</small></button>
```

再在 `index.html` 的 cyberPanel 附近加观战面板容器（供实机观战 HUD 使用）：

```html
<div id="managerMatchPanel" style="display:none"></div>
```

- [ ] **Step 2: ui.js hideModePanels 加 managerPanel**

在 `src/ui.js:642-649` 的 hideModePanels 数组中加 `'managerPanel', 'managerMatchPanel'`：

```js
for (const id of ['majorPanel', 'lanPanel', 'editorOverlay', 'cyberPanel', 'careerPanel', 'rankedPanel', 'managerPanel', 'managerMatchPanel']) {
```

- [ ] **Step 3: ui.js startBtn 分流加 manager 分支**

在 `src/ui.js` startBtn.onclick 链中 career 分支（约 900-904 行）后加：

```js
} else if (game.opts.mode === 'manager') {
  if (window.__openManager) { window.__openManager(); return; }
```

- [ ] **Step 4: main.js boot 加 initManagerUi + manager-match 副作用 import**

在 `src/main.js` 顶部 import 区（约 19 行）加：

```js
import './manager-match.js';
import {initManagerUi} from './manager-ui.js';
```

在 boot 中 `initCareerUi(document, game)` 后加：

```js
initManagerUi(document, game);
```

- [ ] **Step 5: styles.css 加 managerMatchPanel 观战样式（复用 cyber 面板样式）**

在 styles.css 的 cyber 样式块后追加：

```css
#managerMatchPanel{position:fixed;left:50%;top:46px;transform:translateX(-50%);z-index:30;pointer-events:none;width:min(760px,94vw)}
#managerMatchPanel .cyber-controls{pointer-events:auto}
```

- [ ] **Step 6: docs/MODES.md 模式表加一行**

在 `docs/MODES.md` 模式表格加：

```
| 电竞经理 | 经营战队、转会/训练/财务、比赛 AI 实机观战 | src/manager.js + src/manager-match.js + src/manager-ui.js |
```

- [ ] **Step 7: 验证接线**

Run: `node scripts/check-syntax.mjs`
Expected: 无语法错误

Run: `node scripts/run-tests.mjs`
Expected: 全部通过（含 manager + manager-match）

启动游戏手动验证（可选）：
Run: `node server.js` 后浏览器打开 http://localhost:8080，主菜单点「电竞经理」→ 打开面板 → 点「开始比赛」→ 看实机观战 + 倍速/跳过。

- [ ] **Step 8: Commit**

```bash
git add index.html src/ui.js src/main.js styles.css docs/MODES.md
git commit -m "feat(manager): 主菜单接线 - managerPanel/观战面板/模式入口/样式"
```

---

### Task 13: 全量验收 + 文档收尾

**Files:**
- Modify: `docs/MODES.md`（完整说明）
- Test: 全量

- [ ] **Step 1: 跑全量测试与语法检查**

Run: `node scripts/check-syntax.mjs`
Expected: 无输出（全部通过）

Run: `node scripts/run-tests.mjs`
Expected: 全部测试 PASS，退出码 0

Run: `node scripts/check-cycles.mjs`
Expected: 无循环依赖报错（若有，检查 manager-match → manager 的 import 是否成环；manager-match import manager.js 是单向的，应无问题）

- [ ] **Step 2: 手动冒烟（服务器）**

Run: `node server.js`
浏览器访问 http://localhost:8080，验证：
1. 主菜单出现「电竞经理」卡片
2. 点开 → 面板正常显示（体检/赛程/阵容/转会/训练/财务等 Tab）
3. 点「开始比赛」→ 进入实机观战，1x/2x/4x/8x 生效，跳过本回合生效
4. 比赛结束 → 回到面板，积分榜/资金/选手状态更新
5. 打满一个赛季 → 升降级/老板结算/下一赛季

- [ ] **Step 3: docs/MODES.md 补完整电竞经理玩法说明**

在 `docs/MODES.md` 的生涯模式段后加「## 电竞经理」段：

```markdown
## 电竞经理

- 纯管理视角：经营一支 5 人 CS2 战队，不做选手本人。转会/训练/设施/财务/老板压力全覆盖。
- 比赛全程 AI 实机 5v5 观战（复用赛博斗蛐蛐引擎），支持 1x/2x/4x/8x 倍速与跳过本回合；也可「模拟本场」直接出结果。
- 选手能力 9 维（枪法/反应/身法/残局/道具/战术/指挥/冷静/冲击/纪律）× 6 位置权重，真实映射到 bot 实机参数——阵容强弱肉眼可见。
- 六个核心机制：老板目标与解雇、战队体检红绿灯、转会窗事件流、球探噪声与潜力模糊、战队羁绊与性格相性、选手状态入局。
- 存档自动写入 localStorage `cs2d_manager`，损坏或版本不匹配时备份重建。
- 验证：`npm run check && npm test`。
```

- [ ] **Step 4: 最终 Commit**

```bash
git add docs/MODES.md
git commit -m "docs(modes): 电竞经理模式玩法说明"
```

---

## 自审记录（对照 spec）

**Spec 覆盖检查：**
- §2 数据模型/选手对象 → Task 1+2 ✓
- §3 联赛赛程/杯赛 → Task 3 ✓
- §4.1 选手→aiParams 映射（位置×能力矩阵）→ Task 10 ✓
- §4.2 观战面板与倍速 → Task 10 ✓
- §5 转会/球探噪声 → Task 5 ✓
- §6.1 老板压力 → Task 8 ✓
- §6.2 战队体检 → Task 8 + Task 11 renderDash ✓
- §6.3 状态入局 → Task 10 ✓
- §6.4 事件流 → Task 8 ✓
- §6.5 球探噪声 → Task 5 ✓
- §6.6 战队羁绊 → Task 8 ✓
- §7 培养系统 → Task 6 ✓
- §8 财务 → Task 7 ✓
- §9 UI → Task 11 + Task 12 ✓
- §10 存档版本 → Task 1 ✓
- §11 测试计划 → Task 1-13 全程 ✓

**占位符扫描：** 无 TBD/TODO；所有步骤含具体代码与预期输出 ✓

**类型一致性：** `mapManagerRosterToBots(roster, bots, state, side)` 在 Task 10 定义与 Task 10 测试一致；`settlePlayerMatch(s, win, kills, deaths, opts)` 在 Task 9 定义、Task 10/11 调用签名一致；`nextFixture(s)` 返回 null 的处理在 Task 11 renderDash 与 Task 10 managerStart 均已覆盖 ✓

**潜在实现风险提示（执行时注意）：**
1. `manager-match.js` 的 `managerUpdate` 会在比分达到 5 时调 `finishManagerMatch` 直接结算并 `game.over=true`；此时 `game.js` 的 `finishMatch`（含 `onFinish`）不会再触发——因为 game.over 已置位。这是有意设计（结算由 manager 侧完成），`managerOnFinish` 作为兜底仅处理 `game.over` 由引擎侧触发的情况。两路结算都有 `settled` 防重复。
2. `startManagerMatch(game, oppId, venue, isCup)` 中 `game.seed` 在 `startMatch` 内会被保留复用（`game.js:194-212` callerSeed 逻辑），保证同 seed 可复现。
3. `managerStart` 里 `sameTeamBonus` 从 manager.js 导入需在 Task 8 完成后才可用——Task 10 依赖 Task 8 已合并，执行顺序按 Task 编号。
4. `renderTraining` 只渲染 aim 训练按钮，后续如需全属性可在 Step 5 扩展循环（YAGNI，MVP 先只练 aim）。
5. `hideModePanels` 数组加 `managerMatchPanel` 防止观战面板残留。
