# CS2D 全面优化建议报告

> 审查对象：D:\Claudeworkspace\CS2D（v2.0.0，52 文件，约 258 KB）
> 审查方式：全量源码阅读（src/ 23 个模块 + test/ + train/ + docs/ + server）
> 日期：2026-08-02

---

## 0. 总览与结论

CS2D 是一个完成度相当高的 HTML5 俯视角 5v5 战术射击游戏：模块化 ESM、零依赖、5 图、4 难度 AI、进化训练框架、CDP 浏览器全链路测试。底子很好，**优化重点不在"补功能"而在三个结构性命题**：

| 命题 | 现状 | 风险 |
|---|---|---|
| P1 架构单例化 | `map.js`/`render.js`/`hud.js`/`ui.js` 全部模块级可变状态 | 无法多开、热重载、写观战/回放/联机 |
| P2 逻辑双轨 | 玩家操作（game.js）与 bot（ai.js/bomb.js）各写一套 plant/defuse/购买逻辑 | 漂移出 bug，测试面翻倍 |
| P3 玩家-服务器无边界 | 纯客户端单机 | 阻断联机/反作弊/云存档等一切扩张 |

报告按「架构 → 逐模块 → 功能性拓展 → 设计 → 性能 → 质量 → 路线图」组织。优先级 P0（近期必做）/ P1（中期）/ P2（远期），并标注每项工作量与收益。

---

## 1. 架构设计优化（跨模块）

### 1.1 单例 → 实例上下文（P0，重构，收益高）

当前 `map.js` 用模块级 `let MAP`，`render.js`/`hud.js` 用模块级 `ctx/layers`，`ui.js` 用模块级 `doc/game`。后果：

- 无法同时存在两个对局（联机/观战/回放全被堵死）
- `main.js` 的 `reloadMapLayers` 只能靠 `game.onMapChanged` 回调打补丁式重绑

**建议**：引入 `createContext()`，把所有依赖显式注入：
```js
const ctx = createContext({ map: loadMap(def), game: createGame(), canvas, layers });
render(ctx); hud.render(ctx); // 不再读模块全局
```
或渐进式：至少先把 `map.js` 的 `MAP` 改为 `getMap(game)`，把 `hud.js`/`render.js` 的 ctx 改为参数。

### 1.2 事件总线解耦 combat/ui（P0，小，收益高）

现在 `combat.js` 直接 import `ui.js` 的 `showToast/addKillFeed/showHitMarker...`，`game.js` 也直连 `game.ui.xxx`。`ui` 缺失（测试/fitness 里 `g.ui = null`）时靠一堆 `if (game.ui)` 防御，极易漏写。

**建议**：加一个 20 行的 `events.js` 发布订阅：
```js
on('kill', {killer, victim, weapon, head});   // ui/audio/成就/统计各自订阅
on('roundend', ...); on('plant', ...); on('buy', ...);
```
依赖方向变为单向：逻辑 → 事件总线 → UI/音频。fitness.js 也可以订阅事件统计（不再自己轮询 kills）。

### 1.3 双轨逻辑合并（P0，中，防 bug 重灾区）

四处重复实现，同一规则两个入口：

| 功能 | 玩家路径 | bot 路径 |
|---|---|---|
| 装弹 | `game.js:updatePlayer`（E 键，3s，发钱/播报） | `bomb.js:plantBomb` + `ai.js:botActions` |
| 拆弹 | `game.js:updatePlayer`（E 键，kit 2.5s/5s） | `bomb.js:defuseBomb` |
| 拾取炸弹 | `game.js:updatePlayer`（40px） | `bomb.js:pickupBomb` |
| 购买决策 | `economy.js:buyItem`（校验+扣款+换枪掉落） | `ai.js:botBuyAll`（全套独立 if 链） |

**建议**：统一收敛到 `bomb.js`/`economy.js`。玩家侧 `updatePlayer` 只负责"输入→调用 `startPlant(e, game)`"，bot 侧也是同函数；bot 购买改为调用 `buyItem`（补一个 `teamBudget` 决策层）。消除后 **selftest 只需测一套规则**。

### 1.4 状态机显式化（P1，中）

`state`（MENU/BUY/LIVE/END）+ `updateTimers` 里的大 if 分支是隐式状态机，转移条件散落（`game.js:325-357`、`combat.checkRoundEnd`、`bomb.explodeBomb` 都在改 state）。加时、换边、暂停等扩展会让它更脆。

**建议**：`ROUND_STATES = { BUY: {onTime: LIVE}, LIVE: {onTimeout, onAllDead}, END: {onTimer} }` 表格化转移，或至少集中一个 `setState(g, next, reason)` 入口统一处理进入/退出钩子。

### 1.5 魔数集中（P0，小）

大量散落魔法数字，例如：`0.09` 瞄准锁定角差、`600/700/800/1000/1500` 各种感知半径、`260` 手雷伤害半径、`620` 炸弹爆炸半径、`3s` 装弹、`46/55/40` 拾取半径、`0.12` 爆头率、`7` 贴墙衰减、`2.5/5` 拆弹时间。`config.js` 已有良好聚集，把散落的都收进去，AI/平衡性调参将变成"改一行"。

### 1.6 工具函数去重（P0，小）

`clamp/rand/angDiff/angNorm` 在 7 个文件里复制粘贴（game/combat/ai/grenades/bomb/audio/hud/map...）。抽 `src/utils.js` 一行 import 解决，避免将来行为不一致。

---

## 2. 逐模块建议

### 2.1 game.js（主循环/回合机）
- **P0 逻辑双轨**：见 §1.3，E 键 plant/defuse 逻辑挪到 bomb.js。
- **P0 帧率**：`main.js` 注释声称"固定步长累加器"，实际是可变 dt + 0.05 截断。物理/冷却都按 dt 走基本可接受，但 `updateShotStreak` 用 `performance.now()` 的 `aimTarget` 计时与 dt 混用（`ai.js` 里 `performance.now()`/450 做走位摆动），低刷新率下 bot 行为会漂移。建议统一到 `game.time`。
- **P1 观战**：`spectateIdx` 已存在，可做自由视角（方向键平移、1/2/3 切队友），成本低。
- **P1 回放**：记录每帧输入（keys/mouse/seed），配确定性 RNG 可完整回放（见 §1.1 上下文化后可行）。
- **P2 加时/平局**：`ROUND.SIDE_SWAP_AFTER=12` 硬编码换边，13:13 无加时规则，补 MR12 加时（每队 3 回合）。

### 2.2 combat.js（战斗）
- **P0 后坐力只增扩散不抬枪口**：`fireRay` 的散布是纯随机角偏移，没有 CS 式"后座上跳/压枪"。建议把 `recoil` 拆成 `recoilX/recoilY`，连发时准星/弹道朝固定方向偏移，玩家可下压鼠标补偿——这是射击手感质变，且完全兼容现有 AI（bot 已有 recoil 恢复慢 1.2 的设定）。
- **P1 部位伤害模型**：目前爆头是 12% 随机。俯视视角可改为"朝向面 vs 背身"判定（背身 1.2x），或"距中心偏移→爆头概率"连续模型（越靠准星中心越容易爆头，与准星联动更自然）。
- **P1 子弹穿透**：墙薄（1 tile）时高穿武器（AWP）可穿透 1 格木箱，弹孔/火花已有，加一层 `penetrate` 属性即可，战术纵深大增。
- **P2 命中部位统计/伤害报告**：CS 式 "XXX 造成 87 伤害(1 爆头)"，数据已在 `lastDmgFrom`，只差 UI。

### 2.3 ai.js（AI）
- **P0 与玩家协作指令**：玩家可以按 F1/F2/F3 对 bot 下发"集合/进攻 A/进攻 B/守点"——代码已有一切（`game.tAttackSite`、`role`、`objective`），只差一个玩家→bot 目标覆盖层。这是"人机体验"最大单项提升。
- **P1 无线电指令（Radio Comms）**："Go Go Go / 守住这里 / 我需要支援"，纯音频（audio.js 合成）+ killfeed，成本低氛围感强。
- **P1 角色分型**：队伍内差异化（狙击手/步枪手/诱饵），用现有 `vanguard/role` 扩展。
- **P1 声音感知增强**：已有 `HEAR_RADIUS/lastShot` 但只用于 CT 守点回防；建议全角色使用（脚步/换弹/开门声级联），并加"听到枪声→预瞄该方向"行为，让 bot 更像人。
- **P1 路径平滑**：A* 输出是 tile 中心直角折线，bot 拐弯呈"走格子"。加视线剪枝（line-of-sight shortcut）+ 拐角预瞄，视觉与手感双提升。
- **P2 个体记忆/士气**：bot 记住"谁杀了队友"去复仇（DESIGN.md §6.5 已规划补枪行为，未实现），开局选点偏好记忆。
- **P2 自适应难度**：用训练框架反向：检测玩家胜率实时微调 `aiParams`（反应/精度），让"普通"永远在 45%~55% 胜率附近。

### 2.4 map.js / map-gen.js（地图）
- **P0 地图数据统一**：dust2 是 config.js 里手写 45 行 segment 数组，其余 4 图走 map-gen.js 程序化。两套格式、两套生成入口。建议 dust2 也迁移到 `createBuilder`（或全部改为 JSON 数据文件 `assets/maps/*.json`），地图编辑→数据→运行打通。
- **P1 地图编辑器**：浏览器内 tile 编辑器（点/画/导出 JSON，`mapgen` 的 API 已可复用），配合 §2.4 数据化，社区内容生态的起点。
- **P1 交互元素**：可开门（推门/自动门）、可破坏箱子（耐久度+碎片）、电梯/传送带（运河图可用）、窗口（不可走但可射击，子弹穿行判定需在 fireRay 加窗口采样）。这些是"功能拓展"里性价比最高的玩法增量。
- **P2 动态事件**：僵尸模式、昼夜循环（光照烘焙后处理 tint）、天气（雪地图下雪粒子）。
- **P2 双层地图**：地铁图天然的上下层潜力，需要 y-sort 渲染与 z 层寻路，工作量大，放最后。
- **P1 连通性自检升级**：现有 BFS 只报不可达格；建议加"站点可达性 + 出生点到双点路径必须存在"断言，杜绝"能玩但 T 到不了 A"的地图。

### 2.5 render.js / textures.js / hud.js（渲染）
- **P0 高分屏 DPR**：canvas 未乘 `devicePixelRatio`，4K/高分屏下整个画面发糊。`resizeCanvas` 加 `Math.round(w*dpr)` + `ctx.setTransform(dpr,...)` 即可。
- **P1 受击方向指示**：被击中时屏幕边缘显示伤害来源方向箭头（数据现成：`lastDmgFrom`），FPS 核心反馈。
- **P1 地图主题差异化**：5 图目前共用同一套 floor/wall/crate 纹理（只有 accent 色不同），雪地/地铁/仓库应该换色板/纹理族。给 `textures.js` 加 `theme` 参数（每图一组 baseColor），视觉辨识度立刻拉开。
- **P1 粒子上限与对象池**：`particles.push` 无上限；爆炸+霰弹瞬间可到数百。加 `MAX_PARTICLES` 淘汰 + 简单对象池，避免 GC 卡顿。
- **P1 小地图增强**：雷达迷雾目前是"敌人 300px 外+不可见则隐藏"，可做 CS 式单圈（视野圈内显示）；加 C4 图标与出生点标记、烟雾区域显示（雾中不可见已是）；当前 250ms 更新节流逻辑 `lastMiniUpdate` 与每帧渲染语义混乱，顺手理清。
- **P2 击杀播报图标**：武器图标 `drawWeaponIcon` 是矩形示意，可升级为每武器简笔轮廓（画在离屏 canvas 缓存）。
- **P2 菜单背景**：用地图 staticLayer 做菜单背景 + 慢速平移，观感立即高级（纯前端 10 行）。

### 2.6 ui.js / index.html / styles.css（UI/UX）
- **P0 按键重绑定**：所有键硬编码（WASD/R/B/1-6/E/Q/Tab）。加一个 `KEYMAP` 配置对象 + 设置面板，读取后 input.js 统一查表。玩家第一诉求，工程量小。
- **P0 灵敏度设置**：鼠标瞄准目前是"绝对映射"（鼠标在屏幕位置=准星位置），无灵敏度概念。加 `sensitivity` 系数（中心偏移×系数）或提供"相对瞄准"选项（pointer lock）。后者是俯视射击更常见的控制，值得做 switch。
- **P1 战绩持久化**：localStorage 记录历史比赛（胜率/KD/回合数/常用武器/单场最高连杀），主菜单"生涯"页。数据全在 `finishMatch`，只差存储与展示。
- **P1 成就系统**：首杀/连杀王/拆弹大师/百爆头/全图通关，事件总线就绪后是纯数据活。
- **P1 多语言**：目前中英混排（`addSysFeed('Bomb has been planted at A')` + 中文 UI）。建议 i18n 表先行（`t('bomb.planted', site)`），后面加 EN/JP 就是翻译活。
- **P2 伤害报告/经济概览**、**P2 色盲模式**（红绿→蓝黄，CSS filter 或调色板）、**P2 移动端触屏**（虚拟摇杆+按钮，触屏命中判定需改造 input）。
- **P1 无障碍**：`#killfeed` 等纯靠颜色区分阵营，加图标前缀。

### 2.7 input.js（输入）
- **P0** 键位查表化（§2.6）、灵敏度（§2.6）。
- **P1 手柄支持**：Gamepad API 双摇杆（左移动/右瞄准+扳机开火），俯视角射击天然适配手柄。
- **P1 快速投掷**：右键是"开镜"，但霰弹/步枪右键无定义；可加"右键=最近投掷物快速抛投"或滚轮选择（已有滚轮切枪）。另建议"按住 4/5/6 直接扔"（CS 手感），`switchNade+触发` 已具备。

### 2.8 audio.js（音频）
- **P1 分轨音量**：master 单 Gain。拆 SFX/UI/BGM 三轨，设置面板可调。
- **P1 环境/音乐**：回合状态机切 BGM（购买期/交火/胜利），合成节拍即可（seq 已有）；背景环境声（地图差异：水声/风声）。
- **P2 脚步方位增强**：pan 已有，加 HRTF 近似（左右耳音量差+低通），FPS 听觉定位。

### 2.9 economy.js / ballistic.js / entities.js / grenades.js / bomb.js
- **economy.js P1**：卖枪/退货按钮（半价退款）；团队经济显示（队友金钱，Tab 已显示）。
- **economy.js P2**：MVP 额外奖励、表现奖金细分（三杀+50/爆头+10），鼓励行为引导。
- **ballistic.js P0**：`recover` 参数定义了但从未使用（`updateShotStreak` 只按 0.5s 清空，`RECOIL_RECOVER` 管的是 recoil 不是弹道恢复）。要么实现（开火后恢复曲线）要么删除，防止"文档有、代码无"。
- **entities.js P0**：实体字段 40+ 平铺（AI 字段/战斗字段/道具字段混在一起），按 `combat/ai/inventory` 分组注释或拆子对象，可读性翻倍。
- **grenades.js P1**：手雷只有抛掷弧线示意，无"拉环延迟/弹跳方向可视化"；加落地提示圈（HE 爆炸半径 260 提前显示）教玩家判断；烟雾持续 12s 已好。
- **bomb.js P1**：拆弹进度被队友打断无提示（`defusing` 状态只在 AI 用）；加"拆弹中断"音效与播报；`defuseBomb` 里 `!e.bot` 才发钱——玩家拆弹在 game.js 双轨里发钱，合并时统一。

### 2.10 config.js（配置）
- **P0**：把 §1.5 魔数归位。
- **P1**：`DIFF` 的 4 难度可加"难度描述文案/图标"，菜单现在只有按钮无解释。
- **P2**：平衡性表（武器伤害/价格/弹道）抽出为 JSON，供训练框架直接读写调参。

### 2.11 server.js（服务器）
- **P1 缓存策略**：`no-cache` 全量无缓存。静态文件建议 `Cache-Control: max-age=3600` + 文件名 hash 防缓存穿透，首页 no-cache。
- **P1 安全头**：`X-Content-Type-Options: nosniff`、`Referrer-Policy`；压缩（gzip/br，Node 18 内置 zlib 即可）。
- **P1 目录浏览/上传**：无，保持；可加 `--readonly` 与 `PORT` 已支持。
- **P2 WebSocket 升级点**：为联机预留 `/ws` 路由与房间协议（§3.1）。

### 2.12 train/（AI 训练）
- **P0 多基线训练**：目前只打 normal 基线、dust2 单图（README 已自我声明 S2 未做）。先跑 `train-batch` 到 5 图 × 200 代（README S2 路径已写好，缺执行）。
- **P0 fitness 噪声**：`runEval` 单局 6 回合、`Math.random()` 未 seed，评估方差大。加可复现 RNG（`seedrandom` 替代 Math.random 的注入点），代内多局取均值。
- **P1 对抗梯度**（README S3）：把冠军写回基线再训，防过拟合当前基线。
- **P1 行为覆盖盲区**：当前 10 维基因不含"转点/保枪/投掷时机"——这些在 ai.js 里是硬编码常量（`rotateChance 0.75` 等）。把"是否转点、何时保枪"也基因化，训练空间更大。
- **P1 评估集扩展**：加"玩家替身"评估（把玩家控制的一个实体用随机人类轨迹模拟）比纯 bot vs bot 更接近真实难度。
- **P2 蒸馏到 4 难度**：目前 easy/normal/hard 是手调；可用同一框架训出四档。

### 2.13 test/（测试）
- **P0 框架升级**：`selftest.js` 是命令式 try/catch 长函数，断言失败语义不清（只能看到"name: msg"）。迁 `node:test`（Node 18+ 内置）+ `describe/it/assert`，输出与 CI 兼容性都好。
- **P1 覆盖缺口**：现有覆盖（回合机/经济购买/地图/A*/换弹/平局）不错，但缺：**投掷物**（弹道/反弹/闪盲判定）、**弹道恢复**（若实现）、**bot 目标切换**（转点/守弹）、**经济连锁**（连败奖金上限）、**掉枪拾取链**（换枪掉落 noPickT）。
- **P1 属性式测试**：对 `config.js` 武器表断言（price>0、rpm>0、mag≥0、无 NaN、ballistic 结构完整），防手滑改配置。
- **P1 性能回归**：加一个"1 秒 60 帧模拟耗时"断言（fitness 已有加速参数），防性能回归。
- **P2 CI 流水线**：项目无 git 仓库、无 CI。`git init` + GitHub Actions（check → test → train smoke → CDP）。

---

## 3. 功能性拓展总表（按价值/成本排序）

| 优先级 | 功能 | 模块 | 成本 | 价值 |
|---|---|---|---|---|
| P0 | 按键重绑定 + 灵敏度 | input/ui/config | 小 | 高（玩家基础诉求） |
| P0 | 高分屏 DPR 渲染 | input/render | 极小 | 高（画质即口碑） |
| P0 | 后座抬枪/压枪模型 | combat/ballistic | 中 | 高（手感质变） |
| P0 | 玩家→bot 战术指令 | ai/ui | 中 | 高（人机体验质变） |
| P0 | 事件总线 | 全局 | 小 | 高（解锁后续全部） |
| P0 | 双轨逻辑合并 | game/bomb/economy | 中 | 高（消灭 bug 源） |
| P1 | 联机（局域/在线） | server 协议 + 状态同步 | 大 | 极高（质变） |
| P1 | 地图编辑器 + 数据化 | map-gen/ui | 大 | 高（内容生态） |
| P1 | 可开门/可破坏/窗口 | map/combat | 中 | 高（战术纵深） |
| P1 | 手柄支持 | input | 中 | 中 |
| P1 | 战绩/成就/生涯页 | ui/localStorage | 小 | 中（留存） |
| P1 | 伤害报告 | combat/hud | 小 | 中 |
| P1 | 受击方向指示 | hud | 极小 | 中 |
| P1 | 主题化地图纹理 | textures | 小 | 中（辨识度） |
| P1 | 训练 S2 多图 + 可复现 RNG | train | 中 | 高（地狱 AI 兑现） |
| P1 | 快速投掷/右键投掷 | input/grenades | 极小 | 中 |
| P1 | 加时赛 MR12 | game/config | 小 | 中 |
| P2 | 回放系统 | main/input + 事件 | 大 | 中（分享传播） |
| P2 | 军备竞赛/死斗模式 | game/config | 中 | 中 |
| P2 | 动态昼夜/天气 | textures/render | 中 | 低-中 |
| P2 | 色盲模式/多语言 | ui/styles | 小 | 低-中 |
| P2 | 移动端触屏 | input/hud | 大 | 低-中 |

---

## 4. 性能热点（数据支撑）

| 热点 | 位置 | 量级 | 建议 |
|---|---|---|---|
| LOS 每帧 × 每 bot × 每敌人 × 6px 采样 × 每烟雾内循环 | ai.js findVisibleEnemy / map.js los | 11 bot × 11 敌 × ~200 步 ≈ 2.4 万次 passable/帧 | 空间网格分桶（40px tile 已是天然网格，按 3×3 tile 邻域过滤候选）|
| fireRay 墙体步进（每弹丸） | combat.js:150 | 霰弹 8 弹丸 × 187 步 = 1500 次/发 | 预烘焙"每 tile 到最近墙距离"表（距离场），一次采样 O(1) |
| A* 每次寻路 O(2700) | map.js:211 | 每 bot 每 0.8s，可接受 | 加 8 方向 + 节点压缩（走廊剪枝） |
| 弹道采样 × 烟雾 | combat.js:154-162 | 每发 × 每烟 × 12px 步 | 烟雾包围盒粗过滤 |
| 粒子无上限 | grenades/combat/bomb | 爆炸+霰弹峰值数百 | MAX 淘汰 + 对象池 |
| PATH_CACHE 清理逻辑 | map.js:288 | size>256 时仅清 >1s 旧条目 | 地图切换时已 clear，OK；可加 LRU |

其余（静态层烘焙、分层渲染、decals 增量重绘）设计良好，无需动。

---

## 5. 工程质量与文档

- **P0 引入 git**：项目目录不是 git 仓库。建议 `git init` + 首次提交 + `.gitignore`（checkpoints/、node_modules）。
- **P1 lint/format**：零 lint。加 ESLint（eslint-config-standard 级别）+ Prettier，`npm run check` 已是语法检查，可并入 lint。
- **P1 DESIGN.md 与实现对齐**：文档已多处过时（§2 架构图写的 genome.js/checkpoint.js 实际是 ai-genome.js + evolve.js 内联；§3.5 准星公式与 hud.js 实际公式不同；§6.3 POP=32 实际 16；main.js 注释"固定步长累加器"不存在）。补 CHANGELOG。
- **P1 错误恢复**：`main.js` 每帧 try/catch 吞错只 console.error，建议收集错误上报到 HUD（debug 面板）。
- **P1 CDP 测试健壮性**：`test/cdp.js` 硬编码 Edge 路径，加环境变量覆盖与优雅降级（无 Edge 时 skip）。
- **P2 插件化**：事件总线 + 数据化地图 + 配置表三件套就位后，可考虑 `window.CS2D.plugins` 注册机制（社区 Mod 入口）。

---

## 6. 性价比排序执行清单（核心：先做事情少、提升大的）

排序规则：**收益（用户可感知度 × 战略杠杆）÷ 成本（人时 × 风险）**。T0 全部 ≤ 半天/项，一周内做完；T1 ≤ 2 天/项，两周内；T2 逐项排期；T3 大项。

### T0 半天级（一周内清完，合计约 2~3 天工作量）

| # | 事项 | 成本 | 提升 | 说明/落点 |
|---|---|---|---|---|
| 1 | **DPR 高分屏渲染** | 0.5h | 全画面质变（4K/缩放屏不再发糊） | `input.js:resizeCanvas` 乘 `devicePixelRatio`，render 用 `setTransform(dpr,…)`；零风险 |
| 2 | **受击方向指示** | 2h | FPS 核心反馈缺失（被谁打的不知道） | 数据现成：`lastDmgFrom/lastDmgT`（combat.js:195）；hud 屏幕边缘画箭头 + 角度，纯增量 |
| 3 | **粒子上限 + 对象池** | 1h | 爆炸/霰弹峰值 GC 卡顿消失 | `game.particles` 各处 push 加 `MAX=600` 淘汰（combat/grenades/bomb） |
| 4 | **工具函数去重 + 魔数集中** | 3h | 后续所有改动的地基，风险极低 | 抽 `src/utils.js`（clamp/rand/angDiff/angNorm 7 处复制）；魔数归 config（§1.5）；`npm run check` 保底 |
| 5 | **快速投掷（按住 4/5/6 直接扔）** | 1h | 手感直追 CS，几乎零成本 | `input.js` keydown 里 switchNade 后立即 fireWeapon，松键切回 |
| 6 | **菜单背景（静态层做背景）** | 0.5h | 观感立即高级 | ui.js 把 menu 背景换成 map staticLayer + 慢速平移 |
| 7 | **拆弹中断提示 + 音效** | 2h | 明确规则（被打断需重拆） | bomb.js 增加"拆弹中断"分支与 sfx；顺带修 `defuseBomb` 玩家不发钱的双轨差异（§2.9） |

### T1 天级（两周内，合计约 1 周工作量）

| # | 事项 | 成本 | 提升 | 说明 |
|---|---|---|---|---|
| 8 | **事件总线** | 1d | 战略杠杆最大：解锁成就/伤害报告/回放/联机/统计，反转 combat→ui 依赖 | 20 行 `bus.on/emit`；先接 kill/roundEnd/plant/buy 四事件；fitness.js 同步改订阅 |
| 9 | **灵敏度设置 + 按键重绑定** | 2d | 玩家第一诉求；当前全硬编码 | `KEYMAP` 配置表 + 设置面板（菜单加一列）；input.js 全部查表；灵敏度即瞄准系数 |
| 10 | **玩家→bot 战术指令（F1 集合/F2 攻A/F3 攻B/F4 守点）** | 1d | 人机体验质变（现在 bot 无视玩家） | 已有 `game.tAttackSite/role/objective` 全套，只加玩家覆盖层 + HUD 提示；`ai.js:botObjectiveRaw` 一处插桩 |
| 11 | **主题化地图纹理** | 1d | 5 图辨识度（现在只有 accent 色不同） | textures.js 加每图色板参数（雪地蓝白/仓库灰褐/地铁深青），floor/wall/crate 三函数收色 |
| 12 | **伤害报告** | 1d | "XXX 造成 87 伤害(1 爆头)"，CS 标配 | 数据全在 `lastDmgFrom`；事件总线就绪后纯订阅+UI |
| 13 | **加时赛 MR12** | 1d | 规则完整性 | `ROUND` 加 OT_ROUNDS=3；`finishMatch` 判平后进 OT，已有换边逻辑复用 |
| 14 | **训练 RNG 可复现 + S2 多图跑批** | 1d | 地狱 AI 从"玩具"变"承诺兑现"（README S2 路径已写好只差执行） | `ai-genome` 注入 seedable rng；`node train/run-batch.mjs --par 4 --gens 200 --map <每图>` 后台挂机 |
| 15 | **git init + CI（check/test 流水线）** | 0.5d | 版本历史 + 回归保险，项目至今无 git | 首次提交 + `.gitignore`(checkpoints)；GitHub Actions: `npm run check && npm test && train smoke-test` |

### T2 逐项排期（3-5 天/项）

| # | 事项 | 提升 | 前置 |
|---|---|---|---|
| 16 | **后座压枪模型**（recoil 拆 X/Y + 弹道上跳，玩家可下压补偿） | 手感质变 | 事件总线（无关但先做小的） |
| 17 | **双轨逻辑合并**（plant/defuse/pickup/buy 收敛单一实现） | 消灭 bug 源 | 8 事件总线先行，fitness/测试同步 |
| 18 | **bot 声音感知 + 预瞄**（脚步/换弹触发预瞄，拐角预瞄） | AI 像人 | 独立 |
| 19 | **战绩持久化 + 生涯页 + 成就** | 留存提升 | 8 事件总线 |
| 20 | **bot 购买智能**（经济节奏：eco/force/买枪轮） | 对战质量 | 双轨合并时顺带 |
| 21 | **node:test 迁移 + 缺口测试**（投掷物/经济连锁/掉枪链） | 测试可维护性 | 独立 |

### T3 大项（1-2 周/项，各自独立，按兴趣挑）

手柄支持 → 可开门/可破坏/窗口 → 地图数据化+编辑器 → 联机（WebSocket）→ 回放 → 语音 → 插件注册表。

---

**为什么这个顺序**：T0 全是"几行代码换肉眼可见提升"的低风险改动，先攒体验分；T1 的 8（事件总线）是唯一"做了没用户可见变化但解锁一切"的项，必须尽早但不必最先——它排在其后是因为依赖它的功能（伤害报告/成就）也只需 1 天，总线本身一天内完成，净收益最早在第二周显现；T2 的 17（双轨合并）是 bug 最多但最不显眼的工作，放测试迁移之前压轴。

---

*报告完。所有改动点均已定位到 `file:line`，需要时可逐项落地。*
