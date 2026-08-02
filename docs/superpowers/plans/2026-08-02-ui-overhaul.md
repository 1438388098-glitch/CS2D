# CS2D UI 与音效现代化改造 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec 将 CS2D 全部界面 tokens 化 + DOM 化 HUD + 五面板升级 + 音效混音/音色重构，全程回归全绿。

**Architecture:** 设计 tokens 落 `styles.css :root` → 主菜单重构 → HUD 从 Canvas（hud.js）迁移到 DOM（ui-dom.js，准星/小地图保留 Canvas）→ 面板类升级（icons.svg 精灵表）→ audio.js 拆 audio/ 目录（core/patches/master）+ 四总线混音 → 动效与响应式收尾。

**Tech Stack:** 原生 HTML/CSS/JS（ES modules）、Canvas 2D、WebAudio API、node test（selftest/simulate/hell-battle/smoke-test/balance）。

**Spec:** `docs/superpowers/specs/2026-08-02-ui-overhaul-design.md`

---

## Phase 1 — 设计系统 + 主菜单（地基）

### Task 1.1: tokens 落地 + 全局色值替换

**Files:**
- Modify: `styles.css`（顶部加 :root tokens，全部组件色值换变量）

- [ ] **Step 1**: styles.css 顶部插入 §4 tokens 块（--bg-* / --line-* / --txt-* / --ct / --t / --danger / --gold / --ok / --accent / --f-num / --f-cn / --f-mono / --r-s/m/l / --sp-1..5 / --hud-edge / --ease* / --dur-*）
- [ ] **Step 2**: 全文件替换硬编码色值为变量（#ff8a2a→var(--accent)、#ffb545→var(--t)、#5ab0ff→var(--ct)、#ffd27a→var(--gold)、#0b0c0e/#0d0f12→var(--bg-0)、面板背景→var(--bg-1)、文字色→var(--txt-*)等）；字体栈统一用 var(--f-cn)/var(--f-num)
- [ ] **Step 3**: 打开页面主菜单视觉无回归；`git diff styles.css` 检查无遗漏硬编码（白名单：#fff、rgba(255,255,255,…)、纯透明值可留）

### Task 1.2: 主菜单重构

**Files:**
- Modify: `index.html`（menu 面板结构重写）
- Modify: `styles.css`（menu 相关样式重写）
- Modify: `src/ui.js`（菜单绑定逻辑，id 尽量不变）

- [ ] **Step 1**: index.html 菜单改为左右分栏：左=地图卡片区（3 张卡片：canvas 缩略图容器 `<canvas class="map-prev" data-map>` + 名称 + 风格描述 + 选中✓），右=阵营两横条大按钮 + 难度四宫格卡片 + hellRow + botSel + 声音 + 设置/开始；操作说明折叠为 `?` 按钮 + 弹出层
- [ ] **Step 2**: styles.css：卡片 hover 描边高亮 var(--accent)、选中 ✓ 角标、阵营选中外描边+内发光、难度卡片 hover 上浮；背景三图轮播 class（.bg1/.bg2/.bg3 opacity 交叉）
- [ ] **Step 3**: ui.js：`setMenuBackgroundFromLayer` 扩展为三图缓存轮播（每图生成一次 canvas 快照，6s 轮换）；地图卡片点击复用现有 mapSel 逻辑（新 id 映射）；`?` 说明折叠开合
- [ ] **Step 4**: 验证：菜单无溢出、卡片可切换地图、难度/阵营选择生效、说明可折叠

### Task 1.3: icons.svg 精灵表 v1

**Files:**
- Create: `assets/icons.svg`（symbol 精灵表）

- [ ] **Step 1**: 创建精灵表：`<svg><defs><symbol id="ic-ct"><symbol id="ic-t"><symbol id="ic-gear"><symbol id="ic-volume"><symbol id="ic-volume-off"><symbol id="ic-kbd"><symbol id="ic-map"><symbol id="ic-check"><symbol id="ic-close">`（24×24 viewBox、1.5px 描边、fill=none stroke=currentColor）
- [ ] **Step 2**: 主菜单使用 `<svg class="ic"><use href="assets/icons.svg#ic-ct">` 引入阵营图标、设置齿轮、音量、地图
- [ ] **Step 3**: 页面无 404 图标报错，图标随 color 变色

---

## Phase 2 — HUD 核心 DOM 化

### Task 2.1: hud-root 骨架 + ui-dom.js 框架

**Files:**
- Modify: `index.html`（#ui 内加 hud-root）
- Create: `src/ui-dom.js`（HUD 更新器）
- Modify: `src/main.js`（loop 中调用 ui-dom 更新器）

- [ ] **Step 1**: index.html 加骨架（全部 hidden 默认）：
  - `#hud-top`（计时条：`#hudScoreT` `#hudTime` `#hudScoreC` + 下层 `#hudBuyTip` `#hudHellTip` `#hudBombTimer`）
  - `#hud-left`（状态面板：`#hudWeaponIcon` `#hudWeaponName` `#hudHp` `#hudHpBar` `#hudArmorBar` `#hudMoney` `#hudStateRow`）
  - `#hud-right`（弹药：`#hudAmmoMag` `#hudAmmoRes` `#hudAmmoName` `#hudNades`（3 格）+ 换弹环 `#hudReloadRing`）
  - `#hud-bomb`（底部炸弹卡：图标+`#hudBombSecs`）
  - `#hud-spectate`（左下观战条）
- [ ] **Step 2**: ui-dom.js：`initUiDom(gameRef)` 缓存 DOM 引用；导出 `updateHudDom(game, dt)`（帧级：血量/护甲/金钱/弹药/状态行）+ `updateTopBar(game)`（100ms 节流：计时/比分/买枪/炸弹）+ 事件订阅（killfeed/banner 仍走 ui.js 不动）
- [ ] **Step 3**: main.js loop：`updateHudDom(game, dt)` 每帧；`updateTopBar` 由内部节流；init 时调用 `initUiDom`
- [ ] **Step 4**: 骨架全 hidden，游戏视觉无变化

### Task 2.2: 状态面板 + 弹药区实现

**Files:**
- Modify: `src/ui-dom.js`（面板填充逻辑）
- Modify: `styles.css`（面板样式）
- Modify: `index.html`（hud-root 细部）

- [ ] **Step 1**: 状态面板：血量大字（--f-num 28px）、分段血条（repeating-linear-gradient 每 25px 档）、护甲蓝条、金钱金色；低血（≤25）面板 class `low`（血条变红+1.2s 呼吸动画）；武器图标（Phase 3 精灵表，先占位文字）
- [ ] **Step 2**: 状态行：换弹（橙色+旋转弧线 conic-gradient 环）、开镜、静步、水中图标（先 CSS 字符占位）；死亡时面板淡出 + 观战条显示（观战对象+提示）
- [ ] **Step 3**: 弹药区：弹夹 --f-num 28px 大字 + 备弹 12px + 武器名；空仓红色闪；投掷物 3 格（HE/闪/烟，持有时高亮、空 40% 透明）；换弹时 conic-gradient 进度环
- [ ] **Step 4**: 手测：血/甲/钱/弹药实时正确；买枪掉钱、射击消耗、换弹环、空仓提示全部联动

### Task 2.3: 顶部条 + 买枪 + 炸弹卡

**Files:**
- Modify: `src/ui-dom.js`（updateTopBar）
- Modify: `styles.css`

- [ ] **Step 1**: 顶部计时条：`T 比分 -- 计时 -- CT 比分`（阵营色、--f-mono 计时）；买枪剩余秒（金）显示在计时条下方；HELL 提示带火图标；观战模式显示当前观战对象
- [ ] **Step 2**: 炸弹卡：底部中央 DOM 卡片（图标+秒数 --f-mono）；<10s class `urgent`（红色+每秒脉冲 scale）；plant/defuse 进度条复用现有 holdbar 视觉但套玻璃样式
- [ ] **Step 3**: 手测：计时走秒、买枪倒计时、炸弹倒数加速闪烁、拆除进度条

### Task 2.4: hud.js 瘦身 + 小地图皮肤

**Files:**
- Modify: `src/hud.js`（删除 renderHud 的迁移部分：状态面板/弹药/顶部条/炸弹卡/观战/买枪/HELL 提示；保留 renderCrosshair/renderMinimap/受击箭头）
- Modify: `src/ui-dom.js`（受击方向改 DOM 或用游戏 bus；见 Step 3）
- Modify: `src/render.js`（若受击箭头在 render 层）

- [ ] **Step 1**: renderHud 删除已迁移部分（左下/右下/顶部/炸弹/买枪/观战/HELL）；保留：受击箭头 + 命中标记（hitMark 保留 Canvas，或迁移）
- [ ] **Step 2**: 小地图皮肤：玻璃底（圆角 8px+细边+暗角）、右上 +/− 缩放按钮（DOM 绝对定位覆盖，pointer-events:auto，点击调 toggleMiniZoom）、底部地图名小字、站点圆角方块+发光、炸弹菱形、玩家描边三角
- [ ] **Step 3**: 受击方向保留 Canvas 绘制 + 加 shadowBlur 发光
- [ ] **Step 4**: 手测 5 分钟对局：黑块 HUD 全消失；小地图按钮可用；受击方向正常

### Task 2.5: 准星升级

**Files:**
- Modify: `src/hud.js`（renderCrosshair）

- [ ] **Step 1**: 开火回弹：gap 随 recoil 衰减回弹（recoil>0 时 gap 额外 +recoil×6，recoil 消散 60ms 回位）；爆头命中（game.headshotT>0 0.25s）四臂外圈加双点；低血（hp≤25）gap 整体内收 2px
- [ ] **Step 2**: 手测：连续射击准星张开-回弹流畅；爆头标记出现；低血内收

---

## Phase 3 — 面板类

### Task 3.1: 记分板

**Files:**
- Modify: `index.html`（scoreboard 表格列扩展）
- Modify: `styles.css`
- Modify: `src/ui.js`（renderScoreboard 填充）

- [ ] **Step 1**: 表格加"武器"列（图标：先用文字缩写，精灵表落地后换 SVG）；击杀列加骷髅 SVG；MVP 行金星 + 微底色；自己行 bg-2 + 2px 阵营竖条
- [ ] **Step 2**: 头部回合指示条：12 格方块×2 段（赢=实心阵营色/输=空心）；底部加当前地图名
- [ ] **Step 3**: 手测：Tab 开合、数据正确、MVP 标记、回合块更新

### Task 3.2: 购买菜单

**Files:**
- Modify: `index.html`（buy 结构：分类竖列 + 卡片网格）
- Modify: `styles.css`
- Modify: `src/ui.js`（renderBuyMenu 重写填充 + 分类切换）
- Create: `assets/icons.svg`（武器 symbol 补充 15 个）

- [ ] **Step 1**: icons.svg 补武器符号（ak/rifle/smg/sniper/pistol/shotgun/knife/awp 等 15 个：侧视轮廓+1.5px 描边）
- [ ] **Step 2**: 布局改左侧分类标签竖列（步枪/手枪/霰弹/狙击/冲锋/投掷/装备）+ 右侧网格；卡片：SVG 图标+名字+类型+价格金；买不起 40% 饱和+锁图标；已拥有绿边"已购"；购买成功 60ms 绿闪
- [ ] **Step 3**: 数字 1-7 切分类、回车购买保持；`drawWeaponIcon` 删除，ui.js 改 SVG 生成
- [ ] **Step 4**: 手测：分类切换、购买/禁用态、键盘操作

### Task 3.3: 设置页

**Files:**
- Modify: `index.html`（settings：两段卡片）
- Modify: `styles.css`
- Modify: `src/ui.js`（键位冲突检测）
- Modify: `src/audio.js`（暴露 setBusVolume——Phase 4 才实现总线，此任务只做滑杆骨架+localStorage）

- [ ] **Step 1**: 设置页分两段：按键绑定（现有 keybindList + 冲突检测：绑定同键两行红边+提示条）+ 偏好（音量 4 滑杆骨架 + 小地图缩放默认 + 准星动态开关）
- [ ] **Step 2**: 音量滑杆写 `localStorage['cs2d_audio']`（Phase 4 生效）；冲突检测在 keymap set 时检查重复
- [ ] **Step 3**: 手测：键位重绑定/冲突提示/滑杆持久化

### Task 3.4: 结算画面

**Files:**
- Modify: `index.html`（end：数据小结 + 柱状图）
- Modify: `styles.css`
- Modify: `src/ui.js`（结算填充：数据统计）

- [ ] **Step 1**: 加数据小结四格（击杀/爆头%/伤害/助攻 图标+数值）；比分柱状图（13 格刻度、T/CT 双色柱）；MVP 金星+放大
- [ ] **Step 2**: 数据来源：game.stats（若无累计则从 killfeed/entities 汇总——检查 main.js 结算现有数据）
- [ ] **Step 3**: 手测：结束一场模拟赛，数值正确

---

## Phase 4 — 音效系统打磨

### Task 4.1: audio 拆 core + 总线 + 生命周期

**Files:**
- Create: `src/audio/core.js`
- Create: `src/audio/patches.js`
- Modify: `src/audio.js` → 迁移为 `src/audio/master.js`（公开 API 不变）
- Create: `src/audio/index.js`（重导出）

- [ ] **Step 1**: core.js：`initAudioCore(factory)`（bus 构建：master→compressor→dest；sfx/ui/amb/mus 四个 GainNode 子总线；compressor 参数 threshold -18/knee 24/ratio 8/attack .01/release .25）；`setBusVolume(bus, v)`；`makeNode()` 工厂；voice 计数（同帧 >24 丢弃最低音量）
- [ ] **Step 2**: master.js 重写原 audio.js：公开 API（initAudio/setMuted/isMuted/setAudioContext/bindToGame/sfx）不变；sfx 内部改为：查 patches 表 → 路由到对应 bus → onended 自动 disconnect（替换 setTimeout）
- [ ] **Step 3**: index.js 重导出；main.js import 不变（`from './audio/index.js'` 或保留 `./audio.js` 路径兼容——采用**保留原文件路径**：audio.js 改名 audio/master.js，新建 audio/index.js 由 main.js 引用；若改 import 有风险则直接原地重构 audio.js）
- [ ] **Step 4**: 对局实测：所有现有音效（枪/脚步/爆炸/命中/买枪/回合）全部正常

### Task 4.2: 武器音色 7 类 + 距离低通 + 混响

**Files:**
- Modify: `src/audio/patches.js`

- [ ] **Step 1**: patches 表按 spec §6.2.1 参数实现 7 类（rifle/ak/smg/sniper/pistol/shotgun/knife）；每枪 playbackRate 0.96-1.04 随机
- [ ] **Step 2**: 距离衰减：低通 cutoff = 3000×(0.3+0.7×dv)；dist>1300 额外 -6dB
- [ ] **Step 3**: 混响：boom/awp/shotgun 串 DelayNode(0.16s/feedback .22/wet .18)；按 mapId 参数表（metro 0.32/.3/.26、canal 0.24/.25/.22、dust2 0.16/.22/.18）
- [ ] **Step 4**: 脚步材质：tileAt 地表——平地 500-800、金属 1500-2200、薄墙 900、深水→splash、静步 ×0.35+1200 低通
- [ ] **Step 5**: 实测：AK/MP5/AWP/喷子可辨识；远处枪声闷；地铁回声明显

### Task 4.3: 事件音效补齐

**Files:**
- Modify: `src/audio/patches.js`
- Modify: `src/game.js` 或事件源（心跳/倒计时/装弹完成/空仓/plant-defuse 脉冲在现有 emit 点补 sfx 调用——优先在已 emit 处挂接，不新增逻辑耦合）

- [ ] **Step 1**: 心跳：hp≤25 每 0.8s 双拍（66Hz×2，音量随 hp 0.1→0.4）——在 hud 或 game 的低血检测点 emit('sfx')
- [ ] **Step 2**: 炸弹倒计时 beep 加速（1s/0.5s/0.25s+1600Hz）；装弹完成卡嗒；空仓双 click；爆头音改 1.8kHz sine+噪声尖刺；plant/defuse 240Hz 脉冲
- [ ] **Step 3**: win/lose 升级（win：C5-E5-G5-C6+和弦 0.8s；lose：下行+130Hz 长衰减）；开局 whistle 第三声 1568Hz
- [ ] **Step 4**: 实测：逐事件触发验证

### Task 4.4: UI 音效集 + 音量滑杆生效

**Files:**
- Modify: `src/audio/master.js`（uiSfx 入口）
- Modify: `src/ui.js`（hover/click/confirm/error/panel 挂接）
- Modify: `src/ui-dom.js`（Tab 开合音）

- [ ] **Step 1**: master.js 加 `uiSfx(name)`（走 ui bus，panner=0）；5 种：hover(2.2kHz 6ms .12)/click(1.5k+900 tick .3)/confirm(三连 .6)/error(200Hz 方波 80ms+180Hz)/panel(500Hz noise 扫频 10ms)
- [ ] **Step 2**: ui.js 全局事件委托：`.btn` mouseenter→hover、click→click；开始/购买/保存→confirm；买不起/冲突/空仓→error；Tab/面板开合→panel
- [ ] **Step 3**: 设置页音量 4 滑杆接 setBusVolume + localStorage 初始化
- [ ] **Step 4**: 实测：五种场景音 + 音量独立调节即时生效

### Task 4.5: audio-patch 测试

**Files:**
- Create: `test/audio-patch.js`

- [ ] **Step 1**: 写测试：mock AudioContext（记录节点创建/连接调用）→ 逐 patch 触发 sfx → 断言无异常、节点图有 bus 路由、voice 上限生效、onended 清理调用
- [ ] **Step 2**: 跑通 `node test/audio-patch.js`；与 selftest 同批跑

---

## Phase 5 — 动效打磨 + 响应式 + 全局验收

### Task 5.1: 回合 banner/连杀/死亡/低血动效

**Files:**
- Modify: `styles.css`（banner/streak/deathinfo/lowhp）
- Modify: `src/ui.js`（showBanner/showKillStreak 类名微调）

- [ ] **Step 1**: banner 玻璃条 + clip-path 切角；胜利金/失败灰；进场 scale .9→1 0.18s；streak 图标+大字 tokens 化
- [ ] **Step 2**: 死亡：红角闪 0.25s CSS；低血 vignette 透明度随 hp 线性（js 设 opacity=clamp((30-hp)/30,.0,.55)）
- [ ] **Step 3**: 手测动效流畅无闪烁

### Task 5.2: 响应式断点

**Files:**
- Modify: `styles.css`

- [ ] **Step 1**: ≥1280 完整；900-1279 HUD 收窄（弹药区省投掷物行、状态面板紧凑）；<900 菜单单列滚动、顶部条缩小
- [ ] **Step 2**: 720p/1080p 手测无溢出

### Task 5.3: 全局动效走查

**Files:**
- Modify: `styles.css`（残留 transition 修正）

- [ ] **Step 1**: 全部动画 ≤250ms、transform/opacity only；搜 transition/animation 检查时长与属性
- [ ] **Step 2**: 修出问题项

### Task 5.4: 全量回归

- [ ] **Step 1**: `node --check` 全部 src/**/*.js
- [ ] **Step 2**: `node test/selftest.js` PASS；`node test/simulate.js dust2 normal` 通过；`node test/hell-battle.mjs` PASS；`node train/smoke-test.mjs` PASS；`node test/audio-patch.js` PASS
- [ ] **Step 3**: `node test/balance.mjs` 抽查记录（改动只表现层，预期无大偏移）
- [ ] **Step 4**: 最终验收清单（spec §9）逐项打勾确认

---
