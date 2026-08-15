# 全局 UI 深色毛玻璃 + 扁平风重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 CS2D 全局 UI（主菜单/HUD/购买/记分板/结算/设置/辅助浮层/模式面板）统一为「深色毛玻璃 + 扁平风」，零逻辑改动。

**Architecture:** 视觉层重构。新增玻璃/扁平设计令牌与 `.glass`/`.flat-btn` 基类；`.panel` 全局玻璃化；主菜单 HTML 重排为全屏横三区 + 地图名签；`ui.js` 地图渲染从卡片网格改为名签 + 单一大预览 canvas；其余界面仅改 `styles.css` 与个别 canvas 配色。DOM 全毛玻璃，Canvas（hud.js 绘制）只做配色/描边适配。

**Tech Stack:** 纯 HTML/CSS/ES Modules（无框架）。`backdrop-filter` + 不支持时的降级。测试 = `node scripts/run-tests.mjs`（`audit/cdp/diag/cover/timing` 前缀默认跳过）。

**依据:** `docs/superpowers/specs/2026-08-15-global-ui-glass-design.md`（设计规格，用户已确认）。

**验证命令（每个 Task 完成后都跑）：**
- `node scripts/check-syntax.mjs` → 期望 `check-syntax: N files PASS`
- `node scripts/check-cycles.mjs` → 期望 `无新增循环依赖，通过`
- `node scripts/run-tests.mjs <filter>` → 期望全部 PASS（filter 见各 Task）
- 手动浏览器走查（Task 1 之后每次改完）：`node server.js` → http://localhost:8080

**工作目录：** `D:\Claudeworkspace\CS2D`。文件编辑用 UTF-8 无 BOM。

---

## Task 0: 设计令牌与基础类

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 `:root` 末尾（第 38 行 `}` 之前）追加玻璃令牌**

```css
  /* 毛玻璃 + 扁平 */
  --glass:rgba(255,255,255,.09);
  --glass-hi:rgba(255,255,255,.14);
  --glass-border:rgba(255,255,255,.16);
  --glass-border-hi:rgba(255,255,255,.28);
  --glass-blur:18px;
  --glass-r:14px;
  --glass-inset:0 2px 0 rgba(255,255,255,.03) inset;
```

- [ ] **Step 2: 在文件末尾追加玻璃/扁平基类与降级**

```css
/* ===== 毛玻璃 + 扁平 基类 ===== */
.glass{background:var(--glass);border:1px solid var(--glass-border);border-radius:var(--glass-r);backdrop-filter:blur(var(--glass-blur)) saturate(150%);-webkit-backdrop-filter:blur(var(--glass-blur)) saturate(150%);box-shadow:var(--glass-inset)}
@supports not (backdrop-filter:blur(1px)){.glass{background:rgba(20,26,34,.92)}}
/* 所有 .panel 统一玻璃化（购买/记分板/结算/设置/帮助/暂停/生涯/排位/Major/LAN/编辑共用） */
.panel{background:var(--glass);border:1px solid var(--glass-border);border-radius:var(--glass-r);backdrop-filter:blur(var(--glass-blur)) saturate(150%);-webkit-backdrop-filter:blur(var(--glass-blur)) saturate(150%);box-shadow:var(--glass-inset)}
@supports not (backdrop-filter:blur(1px)){.panel{background:rgba(20,26,34,.94)}}
/* 扁平按钮：去掉渐变与重投影 */
.btn{background:rgba(255,255,255,.06);background-image:none;border:1px solid var(--glass-border);box-shadow:none}
.btn:hover{background:var(--glass-hi);border-color:var(--glass-border-hi)}
.btn.primary{background:var(--accent);background-image:none;border:1px solid var(--accent-hi);color:#fff;box-shadow:none}
.btn.primary:hover{background:var(--accent-hi);filter:none}
.btn.sel{border-color:var(--accent);color:#ffb066}
/* 阵营/难度扁平纯色（去渐变） */
.btn.team-wide.ct,.btn.team.ct{background:#2a5ba0;background-image:none;border-color:#3e7fd4}
.btn.team-wide.t,.btn.team.t{background:#a86a1e;background-image:none;border-color:#c97a2e}
```

- [ ] **Step 3: 跑验证**

Run: `node scripts/check-syntax.mjs`
Expected: `check-syntax: N files PASS`

- [ ] **Step 4: 手动浏览器确认基类没破坏其它页面**

Run: `node server.js`，打开 http://localhost:8080，确认主菜单/购买/设置仍可打开，`.btn` 变扁平、无破版。
Expected: 界面可交互，按钮由渐变变纯色。

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "style(ui): 新增玻璃/扁平设计令牌与 .panel/.btn 基础类"
```

---

## Task 0b: 玻璃动效基类

> 用户明确要求：玻璃化相关动效必须做好。本任务提供全局动效层，后续所有界面继承。

**Files:**
- Modify: `styles.css`（文件末尾追加）

- [ ] **Step 1: 追加玻璃动效层**

```css
/* ===== 玻璃动效 ===== */
/* 面板入场：用独立 scale/opacity 动画，不覆盖 .panel 的 translate(-50%,-50%) 居中 */
@keyframes glass-in{from{opacity:0;scale:.965}to{opacity:1;scale:1}}
.panel{animation:glass-in .3s var(--ease) both}
/* 玻璃/面板状态过渡（hover/开关时背景与描边平滑） */
.glass,.panel{transition:background-color .2s var(--ease),border-color .2s var(--ease),box-shadow .2s var(--ease)}
/* 可交互玻璃卡的 hover 微交互（上浮 + 描边亮起） */
.mode-card,.map-chips .map-card,.career-card,.ranked-card,.eg-cell,.bi,.kf{transition:background-color .18s var(--ease),border-color .18s var(--ease),transform .18s var(--ease),box-shadow .18s var(--ease)}
.mode-card:hover,.map-chips .map-card:hover,.career-card:hover,.ranked-card:hover,.eg-cell:hover,.bi:hover{transform:translateY(-2px)}
/* 按钮按下反馈 */
.btn:active{transform:scale(.98)}
```

- [ ] **Step 2: 验证**

Run: `node scripts/check-syntax.mjs; node scripts/check-cycles.mjs`
Expected: PASS。浏览器打开确认：打开任意面板（购买/设置/记分板）有淡入上浮入场；玻璃卡 hover 上浮；按钮按下有缩放反馈。
Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(ui): 玻璃动效基类 - 面板入场/玻璃卡 hover/按钮按压反馈"
```

---

## Task 1: 主菜单 HTML 重排（全屏横三区）

**Files:**
- Modify: `index.html:91-167`（`#menu` 整个块替换）

- [ ] **Step 1: 替换 `#menu` 块**

把 `index.html` 中 `<div class="ov" id="menu">...</div>`（第 91–167 行，含 `.menu-hero`/`.menu-body`）整体替换为：

```html
  <div class="ov" id="menu">
    <div class="menu-stage">
      <header class="menu-topbar">
        <h1 class="menu-title">CS2D<span>.</span></h1>
        <p class="menu-tag">平面反恐精英 · 5V5 战术竞技</p>
        <span class="menu-ver" id="menuVersion">v2.0.0</span>
      </header>
      <div class="menu-row">
        <section class="glass menu-col modes-col">
          <h2 class="menu-sec">选 择 模 式</h2>
          <div id="modeSel" class="mode-list">
            <button class="mode-card sel" data-mode="classic"><b>经典爆破</b><small>5v5 拆包</small></button>
            <button class="mode-card" data-mode="retake"><b>回防模式</b><small>CT 回防拆弹</small></button>
            <button class="mode-card" data-mode="ranked"><b>排位赛</b><small>定级 + MMR 天梯</small></button>
            <button class="mode-card" data-mode="career"><b>生涯模式</b><small>个人 + 战队</small></button>
            <button class="mode-card" data-mode="cyber"><b>赛博斗蛐蛐</b><small>下注观战</small></button>
            <details class="mode-more" id="modeMore">
              <summary>娱乐模式</summary>
              <div class="mode-more-grid">
                <button class="mode-card" data-mode="duel"><b>单挑模式</b><small>1v1 MR9</small></button>
                <button class="mode-card" data-mode="major"><b>Major 锦标赛</b><small>48 队冲冠</small></button>
                <button class="mode-card" data-mode="lan"><b>局域网对战</b><small>双人同图</small></button>
                <button class="mode-card" data-mode="editor"><b>地图编辑</b><small>绘制自定义图</small></button>
              </div>
            </details>
          </div>
          <div id="modeSettings" class="mode-settings"></div>
        </section>
        <section class="menu-col center-col">
          <div class="glass map-zone">
            <h2 class="menu-sec">地 图 预 览</h2>
            <div class="map-preview-box">
              <canvas id="mapPreview" width="640" height="360"></canvas>
              <span class="map-preview-name" id="mapPreviewName">DUST2 · 沙二</span>
            </div>
            <div id="mapSel" class="map-chips"></div>
          </div>
        </section>
        <aside class="glass menu-col settings-col">
          <h2 class="menu-sec">对 战 设 置</h2>
          <div class="field"><label>你的阵营</label>
            <div class="seg">
              <button class="btn team-wide ct sel" id="teamCt">CT 反恐</button>
              <button class="btn team-wide t" id="teamT">T 恐怖</button>
            </div>
          </div>
          <div class="field"><label>AI 难度</label>
            <div class="seg">
              <button class="btn diff n sel" id="diffN">普通</button>
              <button class="btn diff e" id="diffE">简单</button>
              <button class="btn diff h" id="diffH">困难</button>
              <button class="btn diff hell" id="diffHell">地狱</button>
            </div>
          </div>
          <div class="field" id="hellRow" style="display:none"><label>地狱等级</label>
            <div class="hell-slider">
              <input type="range" id="hellSlider" min="1" max="12" value="3" step="1">
              <span class="hell-val" id="hellVal">H3</span>
            </div>
          </div>
          <div class="field"><label>每队机器人</label>
            <div class="stepper">
              <button class="step-btn" id="botMinus">−</button>
              <span class="step-val" id="botVal">4</span>
              <button class="step-btn" id="botPlus">＋</button>
            </div>
          </div>
          <div class="menu-util-row">
            <button class="btn small" id="muteBtn"><span id="muteLabel">声音开</span></button>
            <button class="btn small" id="settingsBtn">设 置</button>
            <label class="check-row"><input type="checkbox" id="tutCheck" checked> 新手提示</label>
            <label class="check-row"><input type="checkbox" id="fogCheck"> 迷雾</label>
          </div>
          <button class="btn primary" id="startBtn">开 始 比 赛</button>
        </aside>
      </div>
      <button class="help-btn" id="helpBtn" title="操作说明">?</button>
    </div>
  </div>
```

注意：所有 `id`（`modeSel`/`modeMore`/`modeSettings`/`mapSel`/`teamCt`/`teamT`/`diffN`/`diffE`/`diffH`/`diffHell`/`hellRow`/`hellSlider`/`hellVal`/`botMinus`/`botPlus`/`botVal`/`muteBtn`/`muteLabel`/`settingsBtn`/`tutCheck`/`fogCheck`/`startBtn`/`helpBtn`/`menuVersion`）与原版完全一致，JS 事件绑定不受影响。

- [ ] **Step 2: 语法/运行验证**

Run: `node scripts/check-syntax.mjs`
Expected: PASS。随后 `node server.js` 打开页面，控制台无报错，主菜单能显示（此时样式还没改，布局会乱，属预期）。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(menu): 主菜单 HTML 重排为全屏横三区（地图预览大卡 + 名签容器）"
```

---

## Task 2: 主菜单 CSS（全屏玻璃横三区）

**Files:**
- Modify: `styles.css`（文件末尾追加；并给旧 `.menu-panel/.menu-body/.menu-hero/.mode-grid` 规则加覆盖）

- [ ] **Step 1: 追加主菜单 v3 样式**

```css
/* ===== 主菜单 v3 · 全屏玻璃扁平 ===== */
.menu-stage{position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;gap:18px;padding:22px 26px 26px}
.menu-topbar{display:flex;align-items:baseline;justify-content:space-between;gap:20px;position:relative;z-index:1}
.menu-title{font-size:32px;font-weight:800;letter-spacing:6px;color:var(--txt-0)}
.menu-title span{color:var(--accent)}
.menu-tag{font-size:12px;letter-spacing:3px;color:var(--txt-2)}
.menu-ver{font-size:11px;color:var(--txt-3);letter-spacing:2px}
.menu-row{flex:1;display:flex;gap:16px;position:relative;z-index:1;min-height:0}
.menu-col{display:flex;flex-direction:column;gap:12px;padding:16px;min-height:0;min-width:0}
.modes-col{width:21%;min-width:200px}
.center-col{flex:1;display:flex;min-width:0}
.settings-col{width:23%;min-width:210px}
.map-zone{flex:1;display:flex;flex-direction:column;gap:12px;min-height:0;padding:16px}
.menu-sec{font-size:12px;color:rgba(242,245,248,.66);letter-spacing:3px;font-weight:600;margin:0}
.mode-list{flex:1;display:flex;flex-direction:column;gap:8px;overflow-y:auto;min-height:0}
.mode-card{flex:1;min-height:44px;display:flex;flex-direction:column;justify-content:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--txt-1);text-align:left;padding:0 14px;font-family:var(--f-cn);cursor:pointer;transition:all var(--dur-s) var(--ease);margin:0}
.mode-card b{font-size:14px;font-weight:600;color:#e6ecf3}
.mode-card small{font-size:10px;color:rgba(230,236,243,.5)}
.mode-card:hover{border-color:var(--glass-border-hi);background:rgba(255,255,255,.09)}
.mode-card.sel{border-color:var(--accent);background:rgba(255,138,42,.14)}
.mode-card.sel b{color:#ffb066}
.mode-more summary{font-size:13px;color:var(--txt-2);cursor:pointer;padding:4px 2px;letter-spacing:1px}
.mode-more-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.mode-more-grid .mode-card{flex:none}
.mode-settings{margin-top:2px}
.map-preview-box{position:relative;flex:1;min-height:0;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.09);border-radius:11px;overflow:hidden}
#mapPreview{position:absolute;inset:0;width:100%;height:100%}
.map-preview-name{position:absolute;left:12px;bottom:10px;font-size:12px;letter-spacing:3px;color:rgba(242,245,248,.75);text-shadow:0 1px 8px rgba(0,0,0,.7);pointer-events:none}
.map-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:0;overflow-y:auto;max-height:92px}
.map-group-title{width:100%;font-size:10px;color:rgba(242,245,248,.4);letter-spacing:2px;margin-top:4px}
/* 覆盖旧 .map-subgrid 的 grid≥210px 排版，改回弹性名签行 */
.map-subgrid{display:flex;flex-wrap:wrap;gap:6px}
.map-chips .map-card{flex:none;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.05);border:1px solid transparent;border-radius:7px;padding:5px 12px;font-size:12px;letter-spacing:1px;color:rgba(242,245,248,.55);cursor:pointer;font-family:var(--f-cn);transition:all var(--dur-s) var(--ease)}
.map-chips .map-card:hover{border-color:var(--glass-border-hi);color:var(--txt-1)}
.map-chips .map-card.sel{color:#ffb066;background:rgba(255,138,42,.14);border-color:var(--accent)}
.map-chips .map-card .mc-name{font-weight:500}
.map-chips .map-card .mc-edit{font-size:10px;color:var(--txt-3);cursor:pointer}
.map-chips .map-card .mc-edit:hover{color:var(--accent)}
/* 隐藏旧地图卡片残留（编辑器按钮/勾选） */
.map-chips .map-card .mc-accent,.map-chips .map-card .map-prev,.map-chips .map-card .mc-check,.map-chips .map-card .mc-desc{display:none}
/* 旧 .menu-panel/.menu-body/.menu-hero 一律隐藏，防残留布局 */
.menu-panel{display:none!important}
```

- [ ] **Step 2: 跑语法 + 相关测试**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs official-maps`
Expected: PASS。

- [ ] **Step 3: 手动浏览器走查主菜单**

Run: `node server.js` → 打开页面。确认：横三区铺满全屏、毛玻璃、地图区显示预览 + 名签、模式可切换、开始按钮可点。
Expected: 与设计 mockup 一致。

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style(menu): 主菜单全屏玻璃横三区 + 扁平控件样式"
```

---

## Task 3: 地图名签 + 大预览（ui.js）

**Files:**
- Modify: `src/ui.js`（`syncMapCards` 1487-1566、`drawMapPreview` 1455-1472、`refreshMapPreviews` 1470-1472）

- [ ] **Step 1: 改写 `drawMapPreview` / `refreshMapPreviews`**

把 `ui.js` 中 `drawMapPreview(mapId)`（第 1455–1468 行）整体替换为：

```js
function drawMapPreview(mapId) {
  const cv = doc && doc.getElementById('mapPreview');
  const src = menuBgLayerCache[mapId];
  if (!cv || !src) return;
  try {
    const c2d = cv.getContext('2d');
    c2d.clearRect(0, 0, cv.width, cv.height);
    c2d.drawImage(src.layer, 0, 0, src.w, src.h, 0, 0, cv.width, cv.height);
    const nameEl = doc.getElementById('mapPreviewName');
    if (nameEl) {
      const m = MAPS.find((x) => x && x.id === mapId);
      nameEl.textContent = (m && m.name ? m.name : mapId) + ' · ' + mapCardDescription(m);
    }
  } catch (err) { /* 忽略 */ }
}

export function refreshMapPreviews() {
  const sel = game && game.opts && game.opts.mapId;
  if (sel) drawMapPreview(sel);
}
```

- [ ] **Step 2: 改写 `syncMapCards` 为名签渲染**

把 `ui.js` 中 `syncMapCards()`（第 1487–1567 行）整体替换为：

```js
export function syncMapCards() {
  if (!doc) return;
  const mapSel = doc.getElementById('mapSel');
  if (!mapSel) return;
  const savedMap = (() => { try { return localStorage.getItem('cs2d_map'); } catch (err) { return null; } })();
  let selected = game && game.opts && game.opts.mapId ? game.opts.mapId : (savedMap || 'dust2');
  const maps = MAPS.filter((m) => m && m.rows && Array.isArray(m.rows) && m.rows.length);
  const groups = [
    { key: 'bomb5v5', label: '5v5 爆破', test: (m) => m.category === 'bomb5v5' },
    { key: 'duel', label: '单挑竞技', test: (m) => m.category === 'duel' },
    { key: 'custom', label: '自定义地图', test: (m) => m.category === 'custom' || m.id === 'custom-map' }
  ];
  const available = maps.filter((m) => groups.some((g) => g.test(m)));
  if (!available.some((m) => m.id === selected)) {
    const firstBomb = available.find((m) => m.category === 'bomb5v5');
    selected = firstBomb ? firstBomb.id : (available[0] ? available[0].id : 'dust2');
  }
  mapSel.innerHTML = '';
  for (const group of groups) {
    const groupMaps = maps.filter(group.test);
    if (!groupMaps.length) continue;
    const title = doc.createElement('div');
    title.className = 'map-group-title';
    title.textContent = group.label;
    mapSel.appendChild(title);
    for (const m of groupMaps) {
      const btn = doc.createElement('button');
      btn.className = 'map-card' + (m.id === selected ? ' sel' : '');
      btn.setAttribute('data-map', m.id);
      const name = doc.createElement('span');
      name.className = 'mc-name';
      name.textContent = m.name || m.id;
      btn.appendChild(name);
      if (m.category === 'custom' || m.id === 'custom-map') {
        const edit = doc.createElement('span');
        edit.className = 'mc-edit';
        edit.textContent = '编辑';
        edit.title = '在编辑器中修改此地图';
        edit.setAttribute('role', 'button');
        edit.tabIndex = 0;
        edit.onclick = (e) => {
          e.stopPropagation();
          if (window.__openMapEditor) window.__openMapEditor(game, m.id);
        };
        btn.appendChild(edit);
      }
      btn.onclick = (e) => {
        if (game) game.opts.mapId = m.id;
        for (const cc of mapSel.querySelectorAll('.map-card')) cc.classList.remove('sel');
        btn.classList.add('sel');
        try { localStorage.setItem('cs2d_map', m.id); } catch (err) { /* 无存储环境 */ }
        refreshMapPreviews();
        if (btn.blur) btn.blur();
      };
      mapSel.appendChild(btn);
    }
  }
  if (game && game.opts && game.opts.mapId !== selected) game.opts.mapId = selected;
  refreshMapPreviews();
}
```

- [ ] **Step 3: 验证语法与相关测试**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs official-maps; node scripts/run-tests.mjs map-editor`
Expected: 全部 PASS（`map-editor.mjs` 会调用 `syncMapCards` 相关路径，确认无 `map-prev` 崩溃）。

- [ ] **Step 4: 手动浏览器验证地图名签**

Run: `node server.js`。确认：主菜单地图区显示 5v5/单挑/自定义 分组名签，点选高亮并更新大预览图，自定义图显示「编辑」，开始比赛能带选中图开局。
Expected: 功能正常，无控制台报错。

- [ ] **Step 5: Commit**

```bash
git add src/ui.js
git commit -m "feat(menu): 地图选择改为名签 + 单一大预览 canvas"
```

---

## Task 4: 局内 HUD 玻璃化（DOM + Canvas 适配）

**Files:**
- Modify: `styles.css`（追加）
- Modify: `src/hud.js:207`（minimap 底色）、`src/hud.js:605`、`src/hud.js:681`（镜头/后座面板底色）

- [ ] **Step 1: 追加 HUD 玻璃样式**

```css
/* ===== DOM HUD 玻璃化 ===== */
.ht-main{background:rgba(10,13,17,.72);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}
#hud-left{background:rgba(10,13,17,.72);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}
#hud-bomb{background:rgba(10,13,17,.72);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}
#hud-spectate{background:rgba(10,13,17,.72)}
.nade{background:rgba(10,13,17,.6)}
.ht-sub{background:rgba(10,13,17,.6)}
#fpsHint{background:rgba(10,13,17,.72)}
#perfMonitor{background:rgba(10,13,17,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
```

- [ ] **Step 2: Canvas HUD 底色统一（3 处）**

- `src/hud.js:207`：`mctx.fillStyle = 'rgba(10,13,17,.8)';` → `'rgba(10,13,17,.72)'`
- `src/hud.js:605`：`ctx.fillStyle = 'rgba(4,8,12,0.52)';` → `'rgba(10,13,17,.72)'`
- `src/hud.js:681`：`ctx.fillStyle = 'rgba(4,8,12,0.55)';` → `'rgba(10,13,17,.72)'`

- [ ] **Step 3: 验证**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs hud; node scripts/run-tests.mjs crosshair; node scripts/run-tests.mjs minimap`
Expected: 全部 PASS。

- [ ] **Step 4: 手动浏览器走查**

Run: `node server.js`。开始一局，切三种视角，确认 HUD 玻璃质感、小地图/镜头面板半透明深底，血条/弹药数字清晰。
Expected: 无破版，HUD 统一玻璃风。

- [ ] **Step 5: Commit**

```bash
git add styles.css src/hud.js
git commit -m "style(hud): 局内 HUD 玻璃化 + canvas 面板底色统一"
```

---

## Task 5: 购买面板玻璃化

**Files:**
- Modify: `styles.css`（追加）

- [ ] **Step 1: 追加购买面板样式**

```css
/* ===== 购买面板 玻璃扁平 ===== */
#buy .buy-head,#buy .buy-eco,#buy .buy-foot{background:rgba(10,13,17,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.buy-cats{background:rgba(255,255,255,.03)}
.buy-cat{background:transparent}
.buy-cat:hover{background:rgba(255,255,255,.07)}
.buy-cat.sel{background:rgba(255,138,42,.14);border-color:rgba(255,138,42,.5)}
.bi{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.bi:hover{background:rgba(255,255,255,.09);border-color:var(--glass-border-hi)}
.bi.flash{background:rgba(94,207,106,.12);border-color:var(--ok)}
.bi.disabled:hover{background:rgba(255,255,255,.05)}
```

- [ ] **Step 2: 验证 + 手动走查**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs economy; node scripts/run-tests.mjs recoil`
Expected: PASS。浏览器进局内按 B 打开购买面板，确认玻璃卡片、选中橙色高亮、禁用态清晰。
Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(buy): 购买面板玻璃扁平化"
```

---

## Task 6: 记分板玻璃化

**Files:**
- Modify: `styles.css`（追加）

- [ ] **Step 1: 追加记分板样式**

```css
/* ===== 记分板 玻璃扁平 ===== */
table.sb th,table.sb td{border-bottom:1px solid rgba(255,255,255,.07)}
table.sb tr.self td{background:rgba(255,138,42,.12);box-shadow:inset 2px 0 0 var(--accent)}
table.sb tr.mvp td{background:rgba(255,210,122,.07)}
```

- [ ] **Step 2: 验证 + 手动走查**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs scoreboard`
Expected: PASS。浏览器 Tab 打开记分板确认半透明底、细分隔线、自高亮橙色。
Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(scoreboard): 记分板玻璃扁平化"
```

---

## Task 7: 结算页玻璃化

**Files:**
- Modify: `styles.css`（追加）

- [ ] **Step 1: 追加结算页样式**

```css
/* ===== 结算页 玻璃扁平 ===== */
.eg-cell{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.eb-track{background:rgba(255,255,255,.06)}
```

- [ ] **Step 2: 验证 + 手动走查**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs game-spectate; node scripts/run-tests.mjs career`
Expected: PASS。打一局后到结算页确认四宫格玻璃、比分条正常。
Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(end): 结算页玻璃扁平化"
```

---

## Task 8: 设置面板玻璃化

**Files:**
- Modify: `styles.css`（追加）

- [ ] **Step 1: 追加设置面板样式**

```css
/* ===== 设置面板 玻璃扁平 ===== */
.settings-sec{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.settings-search{background:rgba(10,13,17,.72);border:1px solid rgba(255,255,255,.14)}
.set-btn,.kb-btn{background:rgba(255,255,255,.06);border:1px solid var(--glass-border);box-shadow:none}
.set-btn:hover,.kb-btn:hover{background:rgba(255,255,255,.11);border-color:var(--glass-border-hi)}
```

- [ ] **Step 2: 验证 + 手动走查**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs settings; node scripts/run-tests.mjs keymap`
Expected: PASS。浏览器打开设置，确认分区玻璃卡、搜索框/滑杆/按钮扁平一致，搜索与重绑功能正常。
Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(settings): 设置面板玻璃扁平化"
```

---

## Task 9: 辅助浮层玻璃化

**Files:**
- Modify: `styles.css`（追加）

- [ ] **Step 1: 追加浮层样式**

```css
/* ===== 局内浮层 玻璃化 ===== */
#banner{background:rgba(10,13,17,.6);border:1px solid var(--glass-border);box-shadow:none}
#streak{background:rgba(10,13,17,.6);border:1px solid rgba(255,190,70,.35);box-shadow:none}
.kf{background:rgba(10,13,17,.6);border:1px solid rgba(255,255,255,.08)}
#toast,#dmgreport{background:rgba(10,13,17,.6);border:1px solid var(--glass-border)}
#objtext .sub{color:rgba(242,245,248,.55)}
#holdbar{background:rgba(10,13,17,.6)}
/* 帮助/新手/暂停 面板已由 .panel 玻璃基类覆盖，此处仅补圆角一致 */
#helpOverlay .panel,#tutorialOverlay .panel,#pause .panel{border-radius:var(--glass-r)}
```

- [ ] **Step 2: 验证 + 手动走查**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs help; node scripts/run-tests.mjs shell-landing`
Expected: PASS。浏览器依次触发帮助/新手提示/暂停/回合横幅/连杀横幅/killfeed/toast，确认玻璃底 + 细描边、动画正常。
Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(fx): 局内浮层（banner/killfeed/toast/streak/帮助/暂停）玻璃化"
```

---

## Task 10: 模式面板玻璃化（生涯/排位/Major/LAN/编辑）

**Files:**
- Modify: `styles.css`（追加）
- 前置盘点：先跑 `Select-String`/grep 确认 `career-ui.js`/`ranked-ui.js` 使用但未在 CSS 里覆盖的容器类

- [ ] **Step 1: 盘点模式面板容器类**

Run:
```powershell
Select-String -Path "src\career-ui.js" -Pattern "class='career-|class=\"career-" | Out-Null
Select-String -Path "src\ranked-ui.js" -Pattern "class='[a-z]+" | ForEach-Object { $_.Line.Trim() } | Select-Object -First 5
```
Expected: 确认 `career-*` / `ranked-*` 容器类清单（核心为 `.career-card`、`.career-top`、`.career-tab`、`.career-body`、`.career-player-card`、`.career-pool`）。

- [ ] **Step 2: 追加模式面板玻璃覆盖**

```css
/* ===== 模式面板 玻璃扁平（career/ranked/major/lan/editor） ===== */
#careerPanel .panel,#rankedPanel .panel,#majorPanel .panel,#lanPanel .panel,#editorOverlay .panel{background:var(--glass);border:1px solid var(--glass-border);backdrop-filter:blur(var(--glass-blur)) saturate(150%);-webkit-backdrop-filter:blur(var(--glass-blur)) saturate(150%)}
.career-top,.career-body{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px}
.career-card,.ranked-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px}
.career-tab,.ranked-tab{background:rgba(255,255,255,.06);border:1px solid var(--glass-border);border-radius:8px}
.career-tab.sel,.ranked-tab.sel{background:rgba(255,138,42,.14);border-color:var(--accent);color:#ffb066}
.career-player-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px}
```

- [ ] **Step 3: 验证 + 手动走查**

Run: `node scripts/check-syntax.mjs; node scripts/run-tests.mjs career; node scripts/run-tests.mjs ranked`
Expected: PASS。浏览器分别打开 生涯 / 排位 / Major / 局域网 / 编辑器 面板，确认玻璃卡、tabs、列表正常，操作可用。
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style(panels): 模式面板（生涯/排位/Major/LAN/编辑）玻璃扁平化"
```

---

## Task 11: 全量回归

**Files:**
- 无代码改动，仅验证

- [ ] **Step 1: 全量检查 + 测试**

Run: `node scripts/check-syntax.mjs; node scripts/check-cycles.mjs; npm test; node train/smoke-test.mjs`
Expected: 语法 PASS、循环依赖无新增、`npm test` 全部 PASS、train 冒烟 PASS。

- [ ] **Step 2: 全界面手动走查**

Run: `node server.js` → 主菜单选图开赛 → 三视角 HUD → B 购买 → Tab 记分板 → 结算 → 设置（搜索/重绑/滑杆）→ 帮助/暂停 → 排位/生涯/Major/LAN/编辑器面板。同时逐界面确认动效：面板打开有玻璃淡入上浮、玻璃卡 hover 上浮描边亮起、按钮按下缩放反馈、菜单背景切换模糊过渡平滑。
Expected: 全部界面玻璃扁平一致、可操作、无破版、无控制台报错、动效流畅不卡顿。

- [ ] **Step 3: 提交剩余改动（若有）**

```bash
git status --short
git add -A
git commit -m "chore(ui): 全局玻璃扁平化收尾"
```

---

## 自查

- **Spec 覆盖**：spec §3.1 主菜单 → Task 1/2/3；§3.2 HUD → Task 4；§3.3 购买 → Task 5；§3.4 记分板 → Task 6；§3.5 结算 → Task 7；§3.6 设置 → Task 8；§3.7 辅助浮层 → Task 9；§3.8 模式面板 → Task 10；§4 验证 → Task 11。动效层 → Task 0b。
- **占位符扫描**：无 TBD/TODO；每步含完整代码或精确行号替换。
- **类型一致性**：`drawMapPreview`/`refreshMapPreviews`/`syncMapCards` 导出与 `main.js`/`map-editor.js` 引用保持同名；`#mapPreview`/`#mapPreviewName` id 在 index.html 与 ui.js 中一致；`.map-card`/`.mc-name`/`data-map` 保留以兼容 cdp 测试。
