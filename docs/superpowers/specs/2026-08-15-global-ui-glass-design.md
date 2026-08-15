# 全局 UI · 深色毛玻璃 + 扁平风重构（设计规格）

> 日期：2026-08-15 · 项目：CS2D · 状态：已与用户视觉对齐（浏览器 mockup 逐项确认）

## 1. 目标

把全局 UI（主菜单 / 局内 HUD / 购买 / 记分板 / 结算 / 设置 / 辅助浮层 / 模式面板 / 局内浮层）统一为「**深色毛玻璃 + 扁平风**」，只做视觉层，不动任何游戏逻辑、不改变交互流程、不碰 Canvas 游戏画面本身。

## 2. 设计系统（新增/调整的令牌）

在 `styles.css` 的 `:root` 新增玻璃令牌，扁平化按钮/面板：

```
--glass: rgba(255,255,255,.09);          /* 玻璃底 */
--glass-hi: rgba(255,255,255,.14);       /* 玻璃高亮底（hover/选中） */
--glass-border: rgba(255,255,255,.16);   /* 玻璃描边 */
--glass-border-hi: rgba(255,255,255,.28);
--glass-blur: 18px;                      /* blur(18px) saturate(150%) */
--glass-r: 14px;                         /* 面板圆角（10–14px） */
--flat-shadow: 0 2px 0 rgba(255,255,255,.03) inset;  /* 唯一允许的“阴影” */
```

- `.panel` 基类改造成玻璃：`background:var(--glass); border:1px solid var(--glass-border); backdrop-filter:blur(var(--glass-blur)) saturate(150%); box-shadow:var(--flat-shadow);`
- 新增通用类 `.glass`（供面板内子容器复用）、`.flat-btn`（纯色无渐变按钮，主按钮用纯 `#ff8a2a`）。
- **降级策略**：`@supports not (backdrop-filter: blur(1px))` 时，玻璃底提为近实色 `rgba(20,26,34,.92)`，保证可读性。
- **性能**：backdrop-filter 只用于静态/低频刷新面板（菜单、购买、记分板、结算、设置、浮层）。HUD 高频元素（血条/弹药/计时）用半透明实色 `rgba(10,13,17,.72)` + 细描边，不挂 blur，避免每帧重采样开销。

## 3. 界面改造清单

### 3.1 主菜单（index.html + styles.css + ui.js）
- 布局改为**全宽横三区**（顶栏 + 模式列 + 地图区 + 设置列），替换现 `.menu-panel`（960px 居中弹窗）。
- 顶栏：左 `CS2D.` 大标题 · 中 标语「平面反恐精英 · 5V5 战术竞技」· 右 版本号。
- **模式列**（~20%）：经典爆破/回防/排位/生涯 + 「娱乐模式」折叠（Major/单挑/LAN/编辑），扁平毛玻璃 tile，选中橙色描边。
- **地图区**（弹性）：大地图预览卡 + 底部**一行地图名签**（纯文字 chips，无缩略图卡片）。选中橙色高亮。地图数据仍走 `MAPS`/registry，预览图沿用现有 `setMenuBackgroundFromLayer`/`refreshMapPreviews` 机制。
- **设置列**（~22%）：阵营/难度/地狱滑块/机器人/声音/新手提示 + 扁平橙色「开始比赛」按钮。
- `ui.js`：`renderMapCards` 从卡片网格改为名签列表；`bindModeMenu` 保持模式语义不变。

### 3.2 局内 HUD
- **DOM 部分（ui-dom.js + styles.css）**：`#hud-top`/`#hud-left`/`#hud-right`/`#hud-bomb`/`#hud-spectate`/`.nade` 全部改玻璃（半透明实色 + 细描边 + 微 blur，见 §2 性能节）；血条/弹药数字/金币保持原配色。
- **Canvas 部分（hud.js）**：小地图底框、准星、受击弧、狙击镜等 canvas 绘制**只做配色/描边适配**（透明深底、细亮边、与玻璃描边一致），不引入 backdrop-filter（canvas 画不了）。保持图形结构与动画不变。

### 3.3 购买面板
- `.buy-panel`、`.buy-head`(sticky)、`.buy-eco`、`.buy-foot`(sticky)、`.bi` 卡片、`.buy-cat` 侧栏 → 玻璃扁平。禁用/拥有/高亮状态配色保留。

### 3.4 记分板
- `.sb-head`、`.sb-rounds`、`table.sb`、自高亮行 `.self`/`.mvp` → 玻璃底 + 细分隔线 + 扁平。

### 3.5 结算页
- `#end .panel`、`.eg-cell` 四宫格、`.eb-track` 比分条 → 玻璃扁平；金色 WIN 强调保留。

### 3.6 设置面板
- `#settings .panel`、`.settings-sec`、`.settings-search`、`.set-btn`/`.kb-btn` → 玻璃扁平；滑杆 accent 色保留。

### 3.7 辅助浮层
- `#helpOverlay`/`#tutorialOverlay`/`#pause` 面板 → 玻璃。
- 局内浮层：`#banner`、`#streak`、`#deathinfo`、`#dmgreport`、`#toast`、`#killfeed`、`#objtext`、`#holdbar`、`#fpsHint`、`#perfMonitor` → 统一半透明实色/玻璃底 + 细描边（clip-path 斜切形状保留，这是现有视觉语言的一部分，仅材质变玻璃）。

### 3.8 模式面板
- 生涯 `career-ui.js`、排位 `ranked-ui.js`、Major `#majorPanel`、局域网 `#lanPanel`、编辑器 `#editorOverlay`：全部走 `.panel` 玻璃基类 + 各自内联生成 DOM 的样式覆盖。
- **前置盘点**（实施阶段第一步）：grep `career-ui.js`/`ranked-ui.js` 内 `innerHTML` 使用的类名，确保玻璃基类能覆盖，遗漏类名补 `.glass` 适配。

### 3.9 局内浮层（归入 3.7 与 Canvas 适配）

## 4. 不变式（什么不能坏）

1. **零逻辑改动**：`ui.js`/`ui-dom.js`/`hud.js`/各面板 JS 的 DOM id、事件绑定、数据流不变；只允许改 `styles.css`、`index.html`（仅主菜单结构）及 UI 渲染字符串的 class 拼装。
2. **Canvas 游戏画面**（render.js/render3d*）完全不动。
3. **确定性/性能**：不影响游戏模拟步长与渲染循环；blur 不挂高频元素（§2）。
4. **现有测试全绿**：`npm run check`、`npm run check:arch`、`npm test`（`audit/cdp/diag/cover/timing` 除外）、`node train/smoke-test.mjs`。
5. **无 BOM/编码问题**：styles.css/index.html 用 UTF-8 无 BOM 保存（沿用 `交接文档` 第 9 条纪律）。

## 5. 验收

- 手动走查：启动 server → 主菜单（选图/换模式/选难度/开始）→ 局内三视角 HUD → 购买 → Tab 记分板 → 结算 → 设置（搜索/重绑/滑杆）→ 帮助/暂停 → 排位/生涯/Major/LAN/编辑器面板。全部可操作、样式统一、无破版。
- 自动：§4.4 测试命令全绿。
- 低配/不支持 blur 的浏览器：走 §2 降级路径仍可读。

## 6. 实施阶段（供写计划）

- **P0 设计令牌**：styles.css `:root` 玻璃令牌 + `.panel`/`.glass`/`.flat-btn` 基类 + blur 降级。
- **P1 主菜单**：index.html 主菜单区重排 + styles.css 横三区样式 + ui.js 地图名签。
- **P2 局内 HUD**：DOM HUD 玻璃化 + hud.js Canvas 配色适配。
- **P3 面板**：购买 / 记分板 / 结算 / 设置。
- **P4 辅助浮层**：banner/killfeed/toast/streak/deathinfo/dmgreport/objtext/holdbar/help/tutorial/pause/fpsHint/perfMonitor。
- **P5 模式面板**：career/ranked/major/lan/editor（先盘点内联 DOM 类名再适配）。

每阶段独立提交、跑一遍 §4.4 测试，确认绿再进下一阶段。

## 7. 边界（不做）

- 不做任何玩法/数值/逻辑改动。
- 不重做 Canvas 游戏画面、不做 3D 渲染美化。
- 不引入第三方 UI 库/框架/字体（保持零依赖）。
- 不移动/重构 JS 文件结构（属于上一轮结构优化的范围）。
