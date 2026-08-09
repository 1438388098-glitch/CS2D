# 三图深化 · 多维度地图设计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 5 图缩减为 3 图（dust2/canal/metro），为引擎加入薄墙穿射、高台、水深浅水、油桶四大机制并全量 AI 适配，保持每图 T 胜率 45-55%。

**Architecture:** 瓦片语义扩展（`=`薄墙/`^`高台/`≈`深水/`o`油桶）→ 战斗/物理/视线层机制 → AI 行为适配 → 三图重做 → 渲染表现 → 测试与平衡回归。机制测试基于运行时注册的专用测试图 `mech-test`（利用 registry 能力）。

**Tech Stack:** Node.js ESM，无依赖。测试入口 `node test/selftest.js`、`node test/simulate.js <mapId>`、`node test/balance.mjs`、`node --check`。

**验证基线（每任务结束时必须保持）：** `node --check src/*.js` 全过；`node test/selftest.js` 全用例 PASS。

**注意：** 项目当前无 git 仓库（未初始化），本计划的 commit 步骤为可选——若执行时发现 `git` 不可用则跳过提交，仅保留代码改动。所有 `console.log` 中文输出在 PowerShell 下会乱码，属正常现象，判断成败以 `PASS/FAIL/模拟通过` 等 ASCII 输出为准。

---

## Task 1: 瓦片语义重构 + 机制测试图 fixture

**Files:**
- Modify: `src/map-gen.js`（createBuilder 加 `tile(x,y,ch)`）
- Modify: `src/map.js`（walkable/pathable/tileAt/walkableTile/scanTiles 新语义 + aStar 高台目标特例 + 诊断扩展）
- Create: `test/map-fixture.js`
- Modify: `test/selftest.js`（安装 mech-test 图）

### Step 1: 写失败测试（fixture 地图存在 + 新瓦片语义）

- [x] 创建 `test/map-fixture.js`：

```js
export const MECH_TEST_ROWS = (() => {
  const rows = [];
  rows.push('#'.repeat(31));
  const upper = '#ttttttt....=..........#......#';
  for (let i = 0; i < 10; i++) rows.push(upper);
  rows.push('#'.repeat(31));
  const water = '#~~~~~~~~~....≈≈≈≈≈≈≈.........#';
  for (let i = 0; i < 6; i++) rows.push(water);
  rows.push('#'.repeat(31));
  rows.push('#........^....o....#..........#');
  for (let i = 0; i < 8; i++) rows.push('#........^.........#..........#');
  rows.push('#'.repeat(31));
  return rows;
})();

export function installMechTestMap() {
  registerMap({ id: 'mech-test', name: 'mech', accent: '#aaa', rows: MECH_TEST_ROWS });
}
```

（`registerMap` 从 `../src/registry.js` import；本图布局：x1-7 T 区 / x12 竖薄墙 / x13-18 靶区 / y12-17 浅水深水带（x1-9 浅水、x14-20 深水）/ x9 高台竖列 / x14 油桶。）

- [x] `test/selftest.js` 顶部（import 区后、`const game = createGame();` 前）加：

```js
import { installMechTestMap } from './map-fixture.js';
import { loadMap, findMapById, walkable, pathable, tileAt } from '../src/map.js';
installMechTestMap();
```

### Step 2: 跑测试确认失败

Run: `node --check test/map-fixture.js`
Expected: FAIL（`registerMap` undefined——fixture 还没 import registry；`walkable/pathable/tileAt` 未导出）

### Step 3: 实现 map-gen.js + map.js

- [x] `src/map-gen.js` 的 createBuilder api 里加（`spawn` 方法之后、`rows()` 之前）：

```js
    tile(x, y, ch) {
      if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = ch;
    },
```

- [x] `src/map.js`：
  - `walkableTile(rows, tx, ty)`（82-85 行）返回条件追加 `c === '~' || c === '≈' || c === '^'`。
  - `walkable(tx, ty)`（158-163 行）追加同样条件。
  - `walkable` 之后新增：

```js
// 寻路可用（^ 高台可站不可越，排除在寻路外）
export function pathable(tx, ty) {
  if (!MAP) return false;
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return false;
  const c = MAP.grid[ty][tx];
  return c === '.' || c === 'a' || c === 'b' || c === 't' || c === 'c' || c === '~' || c === '≈';
}

// 像素坐标 -> 瓦片字符
export function tileAt(x, y) {
  if (!MAP) return '#';
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return '#';
  return MAP.grid[ty][tx];
}
```

  - `aStar` 内邻居检查（291-296 行附近）`if (!walkable(nx, ny)) continue;` 之后加一行：

```js
      if (!pathable(nx, ny) && !(nx === tx && ny === ty)) continue;
```

  - `scanTiles` 的 spawns 扫描不变（`t`/`c` 仍只从 t/c 瓦片采）。
  - 地图诊断扩展：`loadMap` 里 `diag` 之后、构造 `MAP` 对象时加：

```js
    barrels: (() => {
      const list = [];
      for (let ty = 0; ty < rows.length; ty++) {
        for (let tx = 0; tx < rows[ty].length; tx++) {
          if (rows[ty][tx] === 'o') list.push({ tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, hp: 2 });
        }
      }
      return list;
    })(),
    penPoints: mapDef.penPoints || [],
    highPoints: mapDef.highPoints || [],
```

### Step 4: 跑测试确认通过

Run: `node --check src/map-gen.js; node --check src/map.js; node --check test/map-fixture.js`
Expected: 无输出（全部通过）

- [x] 在 `test/selftest.js` 的测试区块（`const errors = []` 之后）加机制基础用例（**先写测试**）：

```js
{
  loadMap(findMapById('mech-test'));
  const g = createGame();
  if (!tileAt(40, 40)) throw new Error('tileAt 未导出');
  if (!walkable(6, 1)) throw new Error('T 区应可走');
  if (walkable(12, 5)) throw new Error('薄墙不可走');
  if (!walkable(3, 13)) throw new Error('浅水可走');
  if (!walkable(9, 19)) throw new Error('高台可站');
  if (pathable(9, 19)) throw new Error('高台不可寻路');
  if (!pathable(3, 13)) throw new Error('浅水可寻路');
  loadMap(findMapById('dust2'));
}
```

Run: `node test/selftest.js`
Expected: FAIL（`pathable is not a function` 或 tileAt 未导出——在实现前）

- [x] 实现 Step 3 后重跑：`node test/selftest.js` Expected: PASS（全部用例含新基础用例）

### Step 5: 提交（如 git 可用）

```bash
git add src/map-gen.js src/map.js test/map-fixture.js test/selftest.js
git commit -m "feat(map): 瓦片语义拆分 walkable/pathable + 新增薄墙/高台/深水/油桶瓦片 + 机制测试图"
```

---

## Task 2: 薄墙穿射（`=`）

**Files:**
- Modify: `src/combat.js`（fireRay 穿透 + 衰减 + 弹孔 + 音效）
- Modify: `src/audio.js`（`penetrate` 音效 case）
- Test: `test/selftest.js`（thin-wall 用例）

### Step 1: 写失败测试

- [x] `test/selftest.js` 基础用例之后加：

```js
{
  // 薄墙穿射：T 射手 x1-7 区，CT 靶 x13-18 区（中间 x12 竖薄墙）
  loadMap(findMapById('mech-test'));
  const g = createGame();
  startMatch(g);
  const shooter = g.player;
  shooter.team = 't'; shooter.x = 140; shooter.y = 200; shooter.dead = false;
  shooter.weapons.primary = 'ak';
  shooter.slot = 'primary';
  shooter.ammoMap.ak = 30;
  const target = g.entities.find((e) => e.bot && e.team === 'ct');
  target.x = 580; target.y = 200; target.dead = false; target.hp = 100;
  target.vx = 0; target.vy = 0;
  shooter.angle = 0;
  fireWeapon(shooter, g);
  const dmgWall = 100 - target.hp;
  // 对照：无墙直射
  target.hp = 100;
  const g2 = createGame();
  startMatch(g2);
  const t2 = g2.player;
  t2.team = 't'; t2.x = 140; t2.y = 200; t2.dead = false;
  t2.weapons.primary = 'ak'; t2.slot = 'primary'; t2.ammoMap.ak = 30;
  const tgt2 = g2.entities.find((e) => e.bot && e.team === 'ct');
  tgt2.x = 580; tgt2.y = 200; tgt2.dead = false; tgt2.hp = 100;
  t2.angle = 0;
  fireWeapon(t2, g2);
  const dmgPlain = 100 - tgt2.hp;
  if (!(dmgWall > 0 && Math.abs(dmgWall - dmgPlain * 0.7) < 1.5)) {
    throw new Error('薄墙穿射伤害应为 0.7x: wall=' + dmgWall + ' plain=' + dmgPlain);
  }
  loadMap(findMapById('dust2'));
}
```

Run: `node test/selftest.js` Expected: FAIL（子弹被薄墙完全阻挡，dmgWall=0）

### Step 2: 实现 combat.js fireRay 穿透

- [x] `src/combat.js` fireRay（139-156 行）的墙扫描循环改为：

```js
  let wallT = range;
  let penMult = 1;
  const steps = Math.ceil(range / 6);
  for (let s = 1; s <= steps; s++) {
    const px = ox + cos * s * 6, py = oy + sin * s * 6;
    const c = tileAt(px, py);
    if (c === '=') {
      penMult *= 0.7;
      if (penMult < 0.49) { wallT = s * 6; break; }
      addDecal(game, px, py, 'bullet');
      emit('sfx', { name: 'penetrate', vol: 0.5, x: px, y: py, game });
      continue;
    }
    if (c === 'C' && e.height === 1) continue;
    if (!passableTolerant(px, py)) {
      if (c === 'o') hitBarrelByShot(game, px, py, e);
      wallT = s * 6;
      break;
    }
  }
```

- [x] 命中伤害（167-178 行之间）加穿透衰减——`let finalDmg = dmg;` 之后加：

```js
    finalDmg *= penMult;
```

- [x] `src/combat.js` 顶部 import 区确认有 `tileAt`（从 `./map.js`），`addDecal` 与 `emit` 已在本文件存在（applyDamage/registerShot 用），`hitBarrelByShot` 在 Task 5 实现——先加空壳（本任务先通过穿射测试，Task 5 填实）：

```js
// 占位：Task 5 实现
export function hitBarrelByShot(game, px, py, shooter) {}
```

- [x] `src/audio.js` switch 内加（仿 `case 'hit'` 风格）：

```js
      case 'penetrate': {
        const op = c.createOscillator(); op.type = 'square';
        op.frequency.setValueAtTime(rand(700, 900), t); op.frequency.exponentialRampToValueAtTime(150, t + 0.1);
        const gp = c.createGain(); gp.gain.value = v * 0.4; gp.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        op.connect(gp); gp.connect(out); __tails.push(gp); op.start(t); op.stop(t + 0.14);
        break;
      }
```

### Step 3: 跑测试确认通过

Run: `node test/selftest.js` Expected: PASS（thin-wall 用例通过；穿墙 0.7×，2 面墙后 0.49 截止）

### Step 4: 提交

```bash
git add src/combat.js src/audio.js test/selftest.js
git commit -m "feat(combat): 薄墙穿射 - 穿透衰减0.7/面 + 弹孔 + 穿射音效"
```

---

## Task 3: 高台物理（`^`）

**Files:**
- Modify: `src/entities.js`（height/stunT 字段）
- Modify: `src/game.js`（实体循环高度状态/落台硬直/涉水减速预留 + createGame lastSplash 字段）
- Modify: `src/combat.js`（fireWeapon stun 拦截 + 低打高 spread + los 高度参数传递）
- Modify: `src/map.js`（los 增加 optH 参数：薄墙看穿/高台无视矮掩体/深水隐蔽）
- Modify: `src/ai.js`（los 调用点传高度）
- Modify: `src/game.js` 玩家 aim los 调用（433 行）
- Test: `test/selftest.js`（high-ground 用例）

### Step 1: 写失败测试

- [x] `test/selftest.js` 加：

```js
{
  loadMap(findMapById('mech-test'));
  const g = createGame();
  startMatch(g);
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.x = 380; b.y = 800; b.dead = false;
  update(g, 1 / 30);
  if (b.height !== 1) throw new Error('站高台应 height=1, got ' + b.height);
  b.x = 340; b.y = 800;           // 跳下到 x8 地面格
  update(g, 1 / 30);
  if (b.stunT <= 0) throw new Error('落台应有硬直');
  const ammoBefore = b.ammoMap.ak || 0;
  b.weapons.primary = 'ak'; b.slot = 'primary'; b.ammoMap.ak = 5;
  b.angle = 0;
  fireWeapon(b, g);
  if (b.ammoMap.ak !== 5) throw new Error('硬直期间不能开火');
  loadMap(findMapById('dust2'));
}
```

Run: `node test/selftest.js` Expected: FAIL（`b.height` undefined、无 stun 字段）

### Step 2: 实现

- [x] `src/entities.js` createEntity 返回值加字段（`decT: 0` 之后）：

```js
    height: 0, stunT: 0, splashCd: 0, highPointT: 0, highIdx: 0,
    prefireT: 0, prefireX: 0, prefireY: 0, prefireCount: 0, barrelT: 0, botThreatT: 0,
```

- [x] `src/game.js` 实体移动循环（247-254 行 `e.vy += e.vy * dt;` 之后、`collideCircle(e);` 之后）插入：

```js
    const curTile = tileAt(e.x, e.y);
    const prevH = e.height;
    e.height = curTile === '^' ? 1 : 0;
    if (prevH === 1 && e.height === 0) e.stunT = 0.4;
    if (e.stunT > 0) e.stunT = Math.max(0, e.stunT - dt);
    if (e.stunT > 0) { e.vx *= 0.3; e.vy *= 0.3; }
    if ((curTile === '~' || curTile === '≈') && Math.hypot(e.vx, e.vy) > 60) {
      e.splashCd -= dt;
      if (e.splashCd <= 0) {
        e.splashCd = 0.5;
        game.lastSplash = { x: e.x, y: e.y, t: game.time, team: e.team };
        emit('sfx', { name: 'splash', vol: 0.5, x: e.x, y: e.y, game });
        for (let i = 0; i < 4; i++) {
          game.particles.push({ kind: 'splash', x: e.x + rand(-8, 8), y: e.y + rand(-6, 6), vx: rand(-60, 60), vy: rand(-120, -40), life: 0.4, size: 3 });
        }
      }
    }
```

（注意：`game.js` 需确认 import `tileAt`、`rand`；`rand` 已在 game.js 使用则确认 import 来源；`createGame` 加 `lastSplash: null` 字段。）

- [x] `src/game.js` 顶部 import 从 `./map.js` 补 `tileAt`（`getMap, loadMap, findMapById, collideCircle, los, pathTo` 已有则并列追加）。

- [x] `src/combat.js`：
  - `fireWeapon`（45 行）开头加：

```js
  if (e.stunT > 0) return;
```

  - spread 计算（68 行 `let spread = effectiveSpread(w, e);`）之后加：

```js
  if (e.aimTarget && e.aimTarget.height === 1 && e.height === 0) spread *= 1.25;
```

- [x] `src/map.js` `los(game, ax, ay, bx, by)` 签名加第 6 参数 `optH`，墙采样判定（216 行 `if (!passableTolerant(x, y)) return false;`）改为：

```js
    if (losBlocked(x, y, optH)) return false;
```

并在 los 函数前新增：

```js
// 视线阻挡：薄墙可看穿；高台观察者无视矮掩体(C)；深水/实墙/油桶阻挡
function losBlocked(x, y, optH) {
  if (passableTolerant(x, y)) return false;
  const c = tileAt(x, y);
  if (c === '=') return false;
  if (c === 'C' && optH === 1) return false;
  return true;
}
```

los 末尾（烟雾检查循环之后、`return true;` 之前）加深水隐蔽：

```js
  const obsw = tileAt(ax, ay) === '≈';
  const tgtw = tileAt(bx, by) === '≈';
  if (tgtw && !obsw) return false;
```

- [x] los 调用点全部传观察者高度：
  - `src/ai.js` 506、533、580 行的 `los(game, e.x, e.y, o.x, o.y)` → `los(game, e.x, e.y, o.x, o.y, e.height)`（580 行在 findVisibleEnemy）
  - `src/game.js` 433 行玩家 aim → `los(game, p.x, p.y, o.x, o.y, p.height)`
  - `src/ai.js` 其他 los 调用点（grep `los(game,` 全量确认后逐一传 `e.height`；combat.js 106 行 expRad 暴露检查**不传**——声音暴露不受高度影响）
  - grep 命令：`Select-String -Path src/*.js -Pattern "los\(game,"`

### Step 3: 跑测试确认通过

Run: `node --check src/game.js; node --check src/combat.js; node --check src/map.js; node --check src/ai.js; node --check src/entities.js`
Expected: 全过
Run: `node test/selftest.js` Expected: PASS（high-ground 用例）

### Step 4: 提交

```bash
git add src/entities.js src/game.js src/combat.js src/map.js src/ai.js test/selftest.js
git commit -m "feat(map): 高台物理 height/落台硬直/低打高惩罚/高处无视矮掩体 + 视线扩展"
```

---

## Task 4: 水机制（`~` 浅水 / `≈` 深水）

**Files:**
- Modify: `src/game.js`（涉水减速——实体循环内）
- Modify: `src/audio.js`（`splash` 音效）
- Modify: `src/map.js`（深水已在 los 处理；水瓦片阻挡弹丸由 combat fireRay 瓦片分类自然生效——验证）
- Test: `test/selftest.js`（water 用例）

### Step 1: 写失败测试

- [x] `test/selftest.js` 加：

```js
{
  loadMap(findMapById('mech-test'));
  const g = createGame();
  startMatch(g);
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.weapons.primary = null; b.weapons.secondary = null;   // 空手速度 235
  // 浅水减速：涉水 0.5s 位移 vs 干燥地
  b.x = 100; b.y = 540; b.dead = false; b.vx = 235; b.vy = 0;
  for (let i = 0; i < 15; i++) update(g, 1 / 30);
  const waterDist = b.x - 100;
  b.x = 100; b.y = 60; b.vx = 235; b.vy = 0;
  for (let i = 0; i < 15; i++) update(g, 1 / 30);
  const dryDist = b.x - 100;
  if (!(waterDist < dryDist * 0.85)) throw new Error('涉水应减速: water=' + waterDist + ' dry=' + dryDist);
  // 溅水声广播
  b.x = 100; b.y = 540; b.vx = 235; b.vy = 0;
  update(g, 1 / 30);
  if (!g.lastSplash || g.lastSplash.team !== 't') throw new Error('涉水应产生溅水声广播');
  // 深水隐蔽：岸上 CT 看不见深水里的 T
  const ct = g.entities.find((e) => e.bot && e.team === 'ct');
  ct.x = 60; ct.y = 60; ct.dead = false;
  const tb = g.entities.find((e) => e.bot && e.team === 't');
  tb.x = 640; tb.y = 560;   // 深水 x14-20, y12-17 内
  tb.vx = 0; tb.vy = 0; tb.dead = false;
  if (los(g, ct.x, ct.y, tb.x, tb.y)) throw new Error('岸上看深水目标应不可见');
  // 深水中开火：弹丸被水阻挡（靶无伤）
  const tgt = g.entities.find((e) => e.bot && e.team === 'ct' && e !== ct);
  tgt.x = 1160; tgt.y = 560; tgt.dead = false; tgt.hp = 100;
  tb.weapons.primary = 'ak'; tb.slot = 'primary'; tb.ammoMap.ak = 5; tb.angle = 0;
  fireWeapon(tb, g);
  if (tgt.hp < 100) throw new Error('深水中开火弹丸应被水阻挡');
  loadMap(findMapById('dust2'));
}
```

Run: `node test/selftest.js` Expected: FAIL（lastSplash 未定义；减速未生效）

### Step 2: 实现

- [x] 涉水减速——`src/game.js` 实体循环（Task 3 插入的溅水块之前）加：

```js
    if (curTile === '~' || curTile === '≈') { e.vx *= 0.6; e.vy *= 0.6; }
```

（Task 3 的溅水块已广播 lastSplash + splash 音效 + 粒子；`splashCd` 字段已在 entities.js 加。）

- [x] `src/audio.js` 加 `splash` case（仿 `case 'step'` 风格，更亮）：

```js
      case 'splash': {
        const ss = c.createBufferSource(); ss.buffer = buffer;
        const fs = c.createBiquadFilter(); fs.type = 'bandpass'; fs.frequency.value = rand(1200, 1800); fs.Q.value = 2;
        const gs = c.createGain(); gs.gain.value = v * 0.5; gs.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        ss.connect(fs); fs.connect(gs); gs.connect(out); __tails.push(gs); ss.start(t); ss.stop(t + 0.22);
        break;
      }
```

- [x] 深水挡弹验证：fireRay 瓦片分类中 `≈` 不在放行集（`.` `a` `b` `t` `c` `~` `^`）→ 进阻挡分支——无需额外代码；跑测试确认即可。

### Step 3: 跑测试确认通过

Run: `node test/selftest.js` Expected: PASS（water 用例；注意深水开火用例：tb 在深水中 fireWeapon 时弹丸第一采样点 6px 处仍在深水 `≈` → 阻挡 → 靶无伤）

### Step 4: 提交

```bash
git add src/game.js src/audio.js test/selftest.js
git commit -m "feat(map): 水机制 - 涉水减速/溅水声广播/深水隐蔽与挡弹"
```

---

## Task 5: 油桶系统（`o`）

**Files:**
- Modify: `src/combat.js`（hitBarrelByShot 实装 + explodeBarrel + barrelAt）
- Modify: `src/game.js`（createGame 初始化 `game.barrels`）
- Modify: `src/map.js`（已扫描 barrels——Task 1）
- Test: `test/selftest.js`（barrel 用例）

### Step 1: 写失败测试

- [x] `test/selftest.js` 加：

```js
{
  loadMap(findMapById('mech-test'));
  const g = createGame();
  startMatch(g);
  if (!g.barrels || g.barrels.length !== 1) throw new Error('油桶应初始化为 1 个');
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.weapons.primary = 'ak'; b.slot = 'primary'; b.ammoMap.ak = 5;
  b.x = 500; b.y = 800; b.dead = false;
  const tgt = g.entities.find((e) => e.bot && e.team === 'ct');
  tgt.x = 560; tgt.y = 820; tgt.dead = false; tgt.hp = 100;
  b.angle = 0;
  fireWeapon(b, g);      // 第一发：桶 hp 2 -> 1
  fireWeapon(b, g);      // 第二发：引爆
  if (g.barrels.length !== 0) throw new Error('油桶应被引爆移除');
  if (tgt.hp === 100) throw new Error('油桶爆炸应造成 AOE 伤害');
  loadMap(findMapById('dust2'));
}
```

Run: `node test/selftest.js` Expected: FAIL（hitBarrelByShot 是空壳，桶不爆）

### Step 2: 实现

- [x] `src/combat.js` 把 Task 2 的空壳替换为：

```js
export function barrelAt(game, px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  for (const b of game.barrels) if (b.tx === tx && b.ty === ty) return b;
  return null;
}

export function hitBarrelByShot(game, px, py, shooter) {
  const b = barrelAt(game, px, py);
  if (!b) return;
  b.hp--;
  emit('sfx', { name: 'hit', vol: 0.6, x: b.x, y: b.y, game });
  if (b.hp <= 0) explodeBarrel(game, b, shooter);
}

export function explodeBarrel(game, b, shooter) {
  game.barrels = game.barrels.filter((x) => x !== b);
  const grid = getGrid();
  grid[b.ty][b.tx] = '.';
  emit('sfx', { name: 'boom', vol: 1, x: b.x, y: b.y, game });
  game.shake = Math.max(game.shake, 8);
  for (let i = 0; i < 6; i++) {
    game.particles.push({ kind: 'boom', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.5, size: 160 });
    game.particles.push({ kind: 'fire', x: b.x + rand(-40, 40), y: b.y + rand(-40, 40), vx: rand(-60, 60), vy: rand(-80, 0), life: 0.6, size: 18 });
  }
  for (const o of game.entities) {
    if (o.dead) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < 160) {
      const dmg = o.team === shooter.team ? 30 : 60;
      applyDamage(o, dmg, { killer: shooter, weapon: 'barrel', head: false }, game);
    }
  }
  for (const o of game.entities) {
    if (o.bot && !o.dead && o.team !== shooter.team) { o.lastKnown = { x: b.x, y: b.y }; o.lastKnownT = 0; }
  }
}
```

（import：`TILE` 从 `./config.js`、`getGrid` 从 `./map.js`——确认现有 import 区，缺则补。）

- [x] `src/game.js` createGame（`game.entities` 初始化附近）加：

```js
  game.barrels = (getMap() ? getMap().barrels : []).map((b) => ({ ...b }));
```

（getMap 已在 game.js import。）

### Step 3: 跑测试确认通过

Run: `node --check src/combat.js; node test/selftest.js` Expected: 全过（barrel 用例通过）

### Step 4: 提交

```bash
git add src/combat.js src/game.js test/selftest.js
git commit -m "feat(combat): 油桶系统 - 2发引爆/AOE伤害/爆炸巨响广播"
```

---

## Task 6: AI 全适配

**Files:**
- Modify: `src/ai.js`（hearSplash + prefire + highPoint 占位 + 油桶利用/规避）
- Modify: `src/combat.js`（applyDamage 受击削减 highPointT）
- Test: `test/selftest.js`（AI 行为冒烟）

### Step 1: 写失败测试（存在性 + 冒烟）

- [x] `test/selftest.js` 加：

```js
{
  // AI 机制字段存在性（prefire/highPoint/splash 字段在实体上初始化）
  const g = createGame();
  startMatch(g);
  const b = g.entities.find((e) => e.bot && e.team === 'ct');
  if (!('prefireCount' in b && 'highPointT' in b && 'splashCd' in b)) {
    throw new Error('AI 机制字段缺失');
  }
  // 溅水声让附近 AI 警觉（lastKnown 更新）
  loadMap(findMapById('mech-test'));
  const g2 = createGame();
  startMatch(g2);
  const tBot = g2.entities.find((e) => e.bot && e.team === 't');
  tBot.x = 100; tBot.y = 540; tBot.vx = 235; tBot.vy = 0; tBot.dead = false;
  update(g2, 1 / 30);
  const ctBot = g2.entities.find((e) => e.bot && e.team === 'ct');
  ctBot.x = 100; ctBot.y = 100; ctBot.dead = false;
  ctBot.lastKnown = null; ctBot.lastKnownT = 99;
  update(g2, 1 / 30);
  if (ctBot.lastKnown === null) throw new Error('AI 应听到溅水声并更新 lastKnown');
  loadMap(findMapById('dust2'));
}
```

Run: `node test/selftest.js` Expected: FAIL（字段存在但 hearSplash 未实现——lastKnown 未更新）

### Step 2: 实现 ai.js

- [x] `src/ai.js` 顶部（`botActions` 定义之前）加：

```js
function hearSplash(e, game) {
  const s = game.lastSplash;
  if (!s || s.team === e.team) return;
  if (game.time - s.t > 0.5) return;
  if (Math.hypot(e.x - s.x, e.y - s.y) < 700) {
    e.lastKnown = { x: s.x, y: s.y };
    e.lastKnownT = 0;
  }
}
```

- [x] `botActions(e, game, dt)` 开头（`if (e.dead) return;` 之后）加：

```js
  hearSplash(e, game);
  if (e.highPointT > 0) e.highPointT -= dt;
  if (e.barrelT > 0) e.barrelT -= dt;
  if (e.botThreatT > 0) e.botThreatT -= dt;
```

- [x] CT 预瞄穿射（botActions 中 `if (e.team === 'ct' && game.bomb && game.bomb.planted)` 块**之前**加）：

```js
  if (e.team === 'ct' && !(game.bomb && game.bomb.planted) && getMap().penPoints && getMap().penPoints.length && e.weapons.primary && !e.reloading) {
    e.prefireT -= dt;
    if (e.prefireT <= 0) {
      e.prefireT = 2 + Math.random() * 2;
      if (Math.random() < 0.3 && Math.hypot(e.x - getMap().penPoints[0].x, e.y - getMap().penPoints[0].y) < 900) {
        const pp = getMap().penPoints[Math.floor(Math.random() * getMap().penPoints.length)];
        e.prefireX = pp.x + (Math.random() - 0.5) * 60;
        e.prefireY = pp.y + (Math.random() - 0.5) * 60;
        e.prefireCount = 3;
      }
    }
  }
  if (e.prefireCount > 0 && e.aimTarget === null) {
    e.angle = angNorm(Math.atan2(e.prefireY - e.y, e.prefireX - e.x));
    e.trigger = true;
    e.prefireCount--;
  }
```

- [x] 高台占位——`botObjectiveRaw` 的 CT 分支（`if (e.role === 'a' || e.role === 'b')` 检查**之前**）加：

```js
    if (getMap().highPoints && getMap().highPoints.length && e.role === 'a' && !planted && e.highPointT <= 0 && Math.random() < 0.02) {
      const hp = getMap().highPoints[(e.highIdx = (e.highIdx || 0) + 1) % getMap().highPoints.length];
      e.highPointT = 8;
      return { x: hp.x, y: hp.y, face: hp.face };
    }
```

- [x] 油桶利用/规避——`botActions` 末尾（fire 循环之前）加：

```js
  if (e.aimTarget && e.barrelT <= 0 && Math.random() < 0.4 && (e.weapons.primary || e.weapons.secondary)) {
    const near = game.barrels.find((bl) =>
      Math.hypot(bl.x - e.aimTarget.x, bl.y - e.aimTarget.y) < 180 &&
      !game.entities.some((o) => o.bot && !o.dead && o.team === e.team && Math.hypot(o.x - bl.x, o.y - bl.y) < 200));
    if (near) {
      e.barrelT = 1.5;
      const dx = near.x - e.x, dy = near.y - e.y;
      e.angle = angNorm(Math.atan2(dy, dx));
      e.aimTarget = null;
      e.trigger = true;
    }
  }
  if (e.botThreatT <= 0) {
    const threat = game.barrels.find((bl) => bl.hp <= 1 && Math.hypot(bl.x - e.x, bl.y - e.y) < 200);
    if (threat) {
      e.botThreatT = 3;
      e.path = null;
      pathTo(e, threat.x - (e.x - threat.x) * 2.5, threat.y - (e.y - threat.y) * 2.5);
    }
  }
```

- [x] `src/combat.js` applyDamage 内（对 bot 的受击处理处，可放在函数末尾返回前）加：

```js
  if (v.bot && v.highPointT > 0) {
    v.highPointT -= 2;
    if (v.highPointT <= 0) { v.objCache = null; v.path = null; }
  }
```

（确认 `pathTo` 已在 ai.js import——ai.js 已用 pathTo/followPath。）

### Step 3: 跑测试确认通过

Run: `node --check src/ai.js; node --check src/combat.js; node test/selftest.js` Expected: 全过

### Step 4: 全量冒烟（AI 行为回归）

Run: `node test/simulate.js dust2 normal` Expected: 模拟通过（T 胜率 30-70%）
Run: `node train/smoke-test.mjs` Expected: PASS
Run: `node test/hell-battle.mjs` Expected: PASS

### Step 5: 提交

```bash
git add src/ai.js src/combat.js test/selftest.js
git commit -m "feat(ai): 全机制适配 - 溅水声警觉/薄墙预瞄/高台占位换位/油桶利用与规避"
```

---

## Task 7: 三图重做 + 删除 snow/depot

**Files:**
- Modify: `src/map-gen.js`（buildDust2/buildCanal/buildMetro 重写）
- Modify: `src/config.js`（import 与注册：只留三图 + penPoints/highPoints）
- Test: `test/selftest.js`（三图诊断断言）+ `test/simulate.js`（三图平衡）

### Step 1: 写失败测试（三图注册 + 诊断）

- [x] `test/selftest.js` 加：

```js
{
  // 三图注册 + 连通性诊断
  for (const id of ['dust2', 'canal', 'metro']) {
    const def = findMapById(id);
    if (!def) throw new Error('缺少地图 ' + id);
    const diag = loadMap(def);
    if (diag.unreachable.length > 0) throw new Error(id + ' 存在不可达格: ' + diag.unreachable.length);
    if (!getMap().sites.A || !getMap().sites.B) throw new Error(id + ' 缺站点');
    if (!getMap().spawns.t.length || !getMap().spawns.ct.length) throw new Error(id + ' 缺出生点');
  }
  const snowDef = MAPS.find((m) => m.id === 'snow');
  if (snowDef) throw new Error('snow 应已删除');
  loadMap(findMapById('dust2'));
}
```

（`MAPS` 从 `../src/config.js` import——selftest 已 import WEAPONS，并列追加。）

Run: `node test/selftest.js` Expected: FAIL（snow 仍在）

### Step 2: 实现三图

- [x] `src/map-gen.js` 删除 buildSnow/buildDepot，重写 buildDust2/buildCanal/buildMetro 为以下实现（已含连通性与机制分布设计，实施时用 Task 1 的连通性诊断校验，若有 unreachable 格微调门洞）：

```js
export function buildDust2() {
  const b = createBuilder(60, 42);
  border(b);
  b.corridor(1, 1, 29, 3);          // 顶排 T 走廊
  b.spawn('t', 3, 1, 6, 2);
  b.corridor(29, 2, 4, 39);         // 中路纵贯
  b.corridor(1, 14, 58, 14);        // 中央大厅
  b.corridor(36, 4, 23, 11);        // A 区（含大厅入口）
  b.site('A', 44, 5, 15, 6);
  for (let x = 49; x <= 52; x++) { b.tile(x, 5, '^'); b.tile(x, 6, '^'); }  // A 高台
  for (let y = 5; y <= 11; y++) b.tile(38, y, '=');                          // A 入口薄墙
  b.boxes(41, 7, 2, 2); b.boxes(55, 8, 2, 2);
  b.corridor(2, 28, 20, 14);        // B 区
  b.site('B', 3, 33, 17, 8);
  for (let x = 2; x <= 21; x++) if (x < 6 || x > 16) b.tile(x, 28, '#');     // B 入口收窄（门 x6-16）
  for (let y = 31; y <= 37; y++) b.tile(8, y, '=');                          // B 内薄墙
  b.boxes(15, 35, 2, 2); b.boxes(11, 38, 2, 2);
  for (let y = 18; y <= 24; y++) b.tile(45, y, '=');                         // 大厅薄墙
  b.tile(26, 20, '^'); b.tile(27, 20, '^'); b.tile(26, 21, '^'); b.tile(27, 21, '^');  // 中台
  b.corridor(33, 35, 26, 6);        // CT 区
  for (let y = 28; y <= 34; y++) { b.tile(53, y, '.'); b.tile(54, y, '.'); } // CT 竖通道
  b.spawn('c', 52, 36, 4, 3);
  b.boxes(50, 39, 2, 1);
  return b;
}

export function buildCanal() {
  const b = createBuilder(64, 46);
  border(b);
  for (let x = 2; x < 62; x++) for (let y = 22; y <= 27; y++) b.tile(x, y, '~');
  for (let x = 16; x <= 21; x++) for (let y = 22; y <= 27; y++) b.tile(x, y, '≈');
  for (let x = 42; x <= 47; x++) for (let y = 22; y <= 27; y++) b.tile(x, y, '≈');
  for (let y = 19; y <= 30; y++) { b.tile(44, y, '~'); b.tile(45, y, '~'); }  // 深水北端暗道出口
  for (const bx of [10, 30, 50]) {
    for (let y = 19; y <= 30; y++) { b.tile(bx, y, '.'); b.tile(bx + 1, y, '.'); }
  }
  b.corridor(1, 1, 62, 18);         // 北岸
  b.site('A', 40, 4, 14, 6);
  for (let x = 36; x <= 58; x++) for (let y = 14; y <= 17; y++) b.tile(x, y, '~');  // A 临水滩
  for (let y = 6; y <= 14; y++) b.tile(34, y, '=');                               // A 观水薄墙
  b.boxes(44, 6, 2, 2); b.boxes(52, 7, 2, 2); b.boxes(38, 8, 1, 3);
  b.tile(31, 16, '^'); b.tile(32, 16, '^');                                       // 桥北守桥台
  b.corridor(1, 30, 62, 16);        // 南岸
  b.site('B', 10, 34, 14, 8);
  b.tile(18, 33, '^'); b.tile(19, 33, '^'); b.tile(18, 34, '^'); b.tile(19, 34, '^');  // B 高台
  for (let y = 34; y <= 41; y++) b.tile(28, y, '=');                               // B 薄墙
  for (let x = 24; x <= 47; x++) for (let y = 28; y <= 29; y++) b.tile(x, y, '≈'); // B 水岸（水下暗道入水）
  b.boxes(8, 37, 2, 2); b.boxes(21, 36, 2, 2); b.boxes(13, 40, 2, 2);
  b.boxes(8, 24, 2, 2); b.boxes(28, 24, 2, 2); b.boxes(48, 23, 2, 2);             // 桥下阴影箱
  b.spawn('t', 2, 41, 5, 3);
  b.spawn('c', 57, 3, 5, 4);
  return b;
}

export function buildMetro() {
  const b = createBuilder(58, 42);
  border(b);
  b.corridor(1, 6, 56, 5);          // 上走廊
  b.corridor(1, 18, 56, 5);         // 中走廊
  b.corridor(1, 30, 56, 5);         // 下走廊
  b.corridor(8, 6, 4, 29);          // 左竖
  b.corridor(27, 6, 4, 29);         // 中竖
  b.corridor(46, 6, 4, 29);         // 右竖
  b.spawn('t', 2, 7, 4, 2);
  b.spawn('c', 52, 7, 4, 2);
  b.corridor(24, 11, 11, 6);        // B 站台
  b.site('B', 25, 12, 9, 4);
  b.tile(24, 13, '^'); b.tile(25, 13, '^'); b.tile(24, 14, '^'); b.tile(25, 14, '^');
  b.tile(32, 13, '^'); b.tile(33, 13, '^'); b.tile(32, 14, '^'); b.tile(33, 14, '^');
  for (let x = 24; x <= 34; x++) b.tile(x, 17, '.');
  b.boxes(28, 13, 2, 2);
  b.corridor(24, 24, 11, 6);        // A 站台
  b.site('A', 25, 25, 9, 4);
  for (let x = 24; x <= 34; x++) b.tile(x, 23, '.');
  b.boxes(27, 25, 2, 2); b.boxes(31, 27, 2, 2);
  for (let y = 18; y <= 22; y++) { b.tile(20, y, '='); b.tile(37, y, '='); }  // 隧道薄墙
  b.tile(24, 20, 'o'); b.tile(33, 20, 'o'); b.tile(27, 24, 'o');             // 枢纽油桶
  b.boxes(6, 19, 1, 3); b.boxes(50, 19, 1, 3);
  b.boxes(6, 31, 1, 3); b.boxes(50, 31, 1, 3);
  return b;
}
```

- [x] `src/config.js`：
  - import 改为 `import { buildDust2, buildCanal, buildMetro } from './map-gen.js';`
  - 注册块改为三图（删 snow/depot 两行）+ 机制数据：

```js
registerMap({ id: 'dust2', name: '沙漠遗址', accent: '#ff8a2a', rows: buildDust2().rows(),
  penPoints: [{ x: 1500, y: 300 }, { x: 640, y: 1340 }, { x: 1700, y: 900 }],
  highPoints: [{ x: 2020, y: 230, face: Math.PI }, { x: 1070, y: 820, face: 0 }] });
registerMap({ id: 'canal', name: '运河小镇', accent: '#6ad1a8', rows: buildCanal().rows(),
  penPoints: [{ x: 1240, y: 620 }, { x: 1040, y: 1460 }],
  highPoints: [{ x: 740, y: 1340, face: -Math.PI / 2 }, { x: 1270, y: 660, face: 0 }] });
registerMap({ id: 'metro', name: '地铁枢纽', accent: '#b08aff', rows: buildMetro().rows(),
  penPoints: [{ x: 840, y: 800 }, { x: 1560, y: 800 }],
  highPoints: [{ x: 980, y: 550, face: Math.PI }, { x: 1300, y: 550, face: 0 }] });
```

（`DUST2_SEGMENTS`/`segmentsToRows` 相关代码一并删除——若 `segmentsToRows` 不再被引用则删除该函数，避免 lint 死代码。）

### Step 3: 跑测试确认通过 + 三图连通性验证

Run: `node --check src/map-gen.js; node --check src/config.js; node test/selftest.js`
Expected: 全过（三图诊断用例 + 现有用例）

- [x] 三图逐个跑模拟确认 AI 可在新图完整对局：

Run: `node test/simulate.js dust2 normal; node test/simulate.js canal normal; node test/simulate.js metro normal`
Expected: 三图均"模拟通过"（T 胜率 30-70%）

### Step 4: 提交

```bash
git add src/map-gen.js src/config.js test/selftest.js
git commit -m "feat(maps): 三图重做 dust2/canal/metro + 机制点位数据 + 删除 snow/depot"
```

---

## Task 8: 渲染表现

**Files:**
- Modify: `src/textures.js`（`=`薄墙/`≈`深水/`^`高台/`o`油桶 纹理 + drawGround 分支 + 小地图分支）
- Modify: `src/render.js`（drawParticles 加 `splash` 分支）
- Test: 手动验证（node --check + 启动游戏截图目检——无法自动断言渲染，以 `node --check` + selftest 回归为准）

### Step 1: 实现纹理

- [x] `src/textures.js`：现有 wallTex/crateTex/waterTex 生成代码之后，新增四个纹理生成（风格仿现有——色板函数）：

```js
  const thinWallTex = mk(64, 64);
  {
    const t = thinWallTex.getContext('2d');
    t.fillStyle = 'rgba(120,116,110,0.75)';
    t.fillRect(0, 0, 64, 64);
    t.strokeStyle = 'rgba(60,58,54,0.9)';
    t.lineWidth = 2;
    for (let i = 0; i < 3; i++) { t.beginPath(); t.moveTo(0, i * 24 + 8); t.lineTo(64, i * 24 + 8); t.stroke(); }
    for (let i = 0; i < 6; i++) { t.beginPath(); t.moveTo(i * 18 + 6, 0); t.lineTo(i * 18 + 6, 14); t.stroke(); }
    t.strokeStyle = 'rgba(40,38,36,0.7)';
    t.beginPath(); t.moveTo(0, 60); t.lineTo(30, 28); t.lineTo(52, 52); t.stroke();   // 裂痕
  }
  const deepWaterTex = mk(64, 64);
  {
    const t = deepWaterTex.getContext('2d');
    t.fillStyle = '#12304a';
    t.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) {
      t.fillStyle = 'rgba(' + (40 + Math.random() * 50) + ',' + (90 + Math.random() * 60) + ',' + (150 + Math.random() * 50) + ',0.35)';
      t.fillRect(Math.random() * 64, Math.random() * 64, 3, 1);
    }
  }
  const platformTex = mk(64, 64);
  {
    const t = platformTex.getContext('2d');
    t.fillStyle = '#3a3f46';
    t.fillRect(0, 0, 64, 64);
    t.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 6; i++) t.fillRect(0, i * 12, 64, 2);
    t.fillStyle = 'rgba(0,0,0,0.5)';
    t.fillRect(0, 60, 64, 4);                        // 台面投影
  }
  const barrelTex = mk(48, 48);
  {
    const t = barrelTex.getContext('2d');
    t.fillStyle = '#8a2f22';
    t.beginPath(); t.arc(24, 24, 18, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#b8462f';
    t.beginPath(); t.arc(24, 24, 13, 0, Math.PI * 2); t.fill();
    t.fillStyle = 'rgba(255,255,255,0.25)';
    t.fillRect(20, 8, 8, 4);
    t.strokeStyle = 'rgba(60,20,14,0.9)';
    t.lineWidth = 2;
    t.beginPath(); t.arc(24, 24, 18, 0, Math.PI * 2); t.stroke();
  }
```

- [x] drawGround 静态层瓦片分支（126 行 `if (c === '~') ...` 之后）加：

```js
        if (c === '=') t.drawImage(thinWallTex, px, py, TILE, TILE);
        if (c === '≈') t.drawImage(deepWaterTex, px, py, TILE, TILE);
        if (c === '^') {
          t.drawImage(platformTex, px, py, TILE, TILE);
          t.fillStyle = 'rgba(255,255,255,0.10)';
          t.fillRect(px + 2, py + 2, TILE - 4, 3);
        }
        if (c === 'o') t.drawImage(barrelTex, px + 8, py + 8, 24, 24);
```

- [x] 小地图分支（165-174 行附近 `} else if (c === '~')` 之后）加：

```js
        } else if (c === '=') {
          t.fillStyle = '#a8a29a';
        } else if (c === '≈') {
          t.fillStyle = '#0d2740';
        } else if (c === '^') {
          t.fillStyle = '#6a7280';
        } else if (c === 'o') {
          t.fillStyle = '#c05030';
```

- [x] `src/render.js` drawParticles（`else if (p.kind === 'boom')` 分支之后）加：

```js
    } else if (p.kind === 'splash') {
      ctx.fillStyle = 'rgba(120,190,235,' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
```

### Step 2: 验证

Run: `node --check src/textures.js; node --check src/render.js; node test/selftest.js`
Expected: 全过（渲染层无逻辑断言，以不崩为准）

### Step 3: 提交

```bash
git add src/textures.js src/render.js
git commit -m "feat(render): 薄墙/深水/高台/油桶纹理 + 水花粒子"
```

---

## Task 9: 平衡抽查脚本 + 全量回归

**Files:**
- Create: `test/balance.mjs`
- Verify: 全部测试入口

### Step 1: 写平衡抽查脚本

- [x] 创建 `test/balance.mjs`：

```js
import { createGame, startMatch, update } from '../src/game.js';

const MAPS = ['dust2', 'canal', 'metro'];
const RUNS = 3;
let ok = true;
for (const map of MAPS) {
  let t = 0, c = 0;
  for (let r = 0; r < RUNS; r++) {
    const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: map });
    g.ui = null;
    startMatch(g);
    g.player.dead = true;
    let prevR = g.round, done = 0;
    for (let i = 0; i < 40000; i++) {
      update(g, 1 / 30);
      if (g.state === 'BUY' && g.buyTime > 1) { g.buyTime = 0.8; g.freezeT = 0.3; }
      if (g.round !== prevR) { prevR = g.round; done++; if (done >= 8) break; }
    }
    t += g.score.T; c += g.score.CT;
  }
  const total = t + c;
  const rate = total ? Math.round((t / total) * 100) : 50;
  const pass = total >= 16 && rate >= 45 && rate <= 55;
  console.log(`balance [${map}] T ${t}:${c} 胜率 ${rate}% ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
```

### Step 2: 跑平衡抽查 + 全量回归

Run: `node test/balance.mjs`
Expected: 三图 PASS（T 胜率 45-55%；若单图偏离，微调该图布局——优先调整出生点相对距离/入口收窄宽度，然后重跑本脚本；平衡不达标不进入下一步）

Run: `node --check src/bus.js; node --check src/ctx.js; node --check src/registry.js; node --check src/config.js; node --check src/game.js; node --check src/combat.js; node --check src/bomb.js; node --check src/ai.js; node --check src/grenades.js; node --check src/economy.js; node --check src/ui.js; node --check src/audio.js; node --check src/main.js; node --check src/input.js; node --check src/map.js; node --check src/map-gen.js; node --check src/hud.js; node --check src/render.js; node --check src/entities.js; node --check src/ballistic.js; node --check src/textures.js; node --check test/selftest.js; node --check test/simulate.js; node --check test/balance.mjs`
Expected: 全部无输出（语法通过）

Run: `node test/selftest.js` Expected: 全部 PASS
Run: `node test/simulate.js dust2 normal` Expected: 模拟通过
Run: `node test/hell-battle.mjs` Expected: PASS
Run: `node train/smoke-test.mjs` Expected: PASS

### Step 3: 提交

```bash
git add test/balance.mjs
git commit -m "test: 三图平衡抽查脚本 + 全量回归"
```

---

## 自检说明（实施前已核对）

1. **Spec 覆盖**：薄墙穿射=Task2；高台=Task3；浅水/深水=Task4；油桶=Task5；AI 全适配（prefire/高台/听声/油桶）=Task6；三图重做+删图=Task7；渲染=Task8；测试/诊断/平衡=Task1(诊断)+Task7(三图诊断)+Task9。深水隐蔽/挡弹/静音在 Task3/4。无遗漏。
2. **类型一致性**：`tileAt`/`pathable`/`los(game,ax,ay,bx,by,optH)`/`hitBarrelByShot(game,px,py,shooter)`/`game.barrels`/`game.lastSplash` 均为首次定义并全文统一使用；entities 新字段（height/stunT/splashCd/highPointT/highIdx/prefireT/prefireX/prefireY/prefireCount/barrelT/botThreatT）在 Task 3 一次加入，后续任务直接引用。
3. **风险点**：canal 深水暗道连通性、dust2 B 入口收窄——实施时以 `node test/selftest.js` 的诊断断言为闸门，unreachable>0 时微调对应门洞（Task 7 Step 3）。
