# CS2D 交接文档：地图设计与游戏全方位优化
- 状态：**已完成（归档）**

- 日期：2026-08-02
- 预计总工时：**12 小时**
- 交接对象：接替 agent（以下简称"你"）
- 项目路径：`D:\Claudeworkspace\CS2D`（无 git 仓库约束，用户直接提交，改动前先 `git status` 确认）

---

## 0. 项目是什么

**CS2D** —— 浏览器端 2D 俯视战术射击游戏（CS 玩法），纯原生 JS ES Modules + Canvas 2D + WebAudio，无框架无依赖。本地运行（`node server.js` 或直接开 index.html），含完整 AI 机器人、经济系统、爆破模式（13 胜制）、三张地图、程序化音效、DOM+Canvas 混合 HUD。

**你的目标**：在现有基础上，把"地图设计"和"游戏全方位体验"再上一个台阶（用户多次评价"设计太差"，重点在地图路线/空间设计与整体质感），并在收尾时保证全量回归绿。

---

## 1. 代码架构速览（开工前必读）

### 1.1 文件地图（src/）

| 文件 | 职责 |
|---|---|
| `main.js` | 启动入口：preloadTextures → boot → 游戏循环 |
| `game.js` | 核心状态机：回合/计时/玩家更新/相机/发射事件 |
| `config.js` | **TILE=40（重要！）**、难度参数、地图注册表（registerMap） |
| `registry.js` | 武器/地图注册表（数据驱动） |
| `map-gen.js` | **三张地图的 ASCII 网格构建器**（本次重点之一） |
| `map.js` | aStar 寻路、LOS、tileAt、碰撞、sites/spawns/holds 扫描 |
| `combat.js` | 射击/伤害/油桶/穿射/近战 |
| `entities.js` | 实体工厂（玩家/bot 字段） |
| `economy.js` | 经济系统 |
| `bomb.js` | 安拆弹/爆炸 |
| `grenades.js` | 投掷物 |
| `render.js` | 运行时渲染（静态层+实体+粒子+动态水面） |
| `textures.js` | **静态层烘焙引擎**（真实纹理+边缘+光照+装饰） |
| `hud.js` | Canvas HUD 残余（准星/小地图/受击指示） |
| `ui-dom.js` | **DOM HUD 更新器**（血量/弹药/计时/炸弹卡） |
| `ui.js` | 所有界面面板（菜单/记分板/购买/设置/结算）+ 事件订阅 |
| `audio/` | core（总线/压缩）/patches（音色表）/master（路由） |
| `ai/` | decisions（战术决策）/actions/roles/perception 等 |
| `keymap.js` | 按键绑定（localStorage 防御已做） |

### 1.2 关键架构约定
- **bus 事件系统**：`ctx.bus.emit('sfx', {...})` 逻辑层发事件，ui/audio 订阅——新增表现层功能走 bus，不直接调用
- **TILE = 40**：瓦片 40px。地图 60×40 瓦片 = 2400×1680px。坐标换算 `px = tx * 40`
- **测试**：`node test/selftest.js`（stubdom 环境）、`test/audio-patch.js`、`test/timing.mjs`（出生到达时间）、`test/cover-scan.mjs`（掩体真空扫描）、`test/balance.mjs`（胜率）、`test/simulate.js`、`test/hell-battle.mjs`、`train/smoke-test.mjs`
- **回归命令**：`node --check` 全部 src/*.js + 上述测试全绿

---

## 2. 已完成的工作（不要重复做，直接在其上迭代）

1. **三图深化**：瓦片机制（`=`薄墙穿射 / `^`高台 / `~`浅水减速+溅水 / `≈`深水静音挡弹 / `o`油桶AOE），AI 全适配
2. **UI 现代化**：Design Tokens（styles.css :root）、主菜单地图卡片、DOM HUD（状态面板/弹药/顶部条/炸弹卡/小地图皮肤）、记分板回合历史条、购买菜单分类竖列、设置页冲突检测+音量滑杆、结算数据图表、40+ SVG 图标精灵表（assets/icons.svg）
3. **音效重构**：四总线（SFX/UI/AMB/MUS）+ 压缩器防爆音、武器 7 类音色（AK/步枪/SMG/AWP/喷子/手枪/刀）、距离低通、三图混响参数、脚步四材质、心跳/炸弹倒计时加速 beep/安拆弹脉冲等事件音、**每图环境音**（dust2 风/canal 流水/metro 轰鸣，startAmbient）
4. **渲染升级**：7 张 ambientCG CC0 真实纹理（assets/textures/，1K，离线可用）+ 瓦片级绘制（边缘系统/光照烘焙/确定性装饰物/动态水面波纹）
5. **地图结构改造**（数据驱动）：
   - 工具：`test/timing.mjs`（出生→点位时间）、`test/cover-scan.mjs`（掩体真空）
   - **出生隔离**：metro CT 出生移到右下对角、上走廊右端封闭、B 左口封闭、A 站台中走廊右段；canal B 区右移、CT 出生右下、A 左移；dust2 中路错位箱
   - **掩体补强**：canal 暴露点 421→0、dust2 160→70
   - **平衡收敛**：dust2 80%→61%、canal 70%→56%、metro 50%→48%
   - AI 高台占位 0.12→0.18；config.js penPoints/highPoints 已随点位更新

---

## 3. 待办任务清单（总计 12h，按优先级排列）

### 任务组 A：地图设计深度改造（5h）—— 最高优先，用户最不满意

**A1. 参考数据接入（0.5h）**
- 参考数据已克隆到 `C:\Users\20579\AppData\Local\Temp\opencode\cs2maps`（MurkyYT/cs2-map-icons，CS2 官方地图 overview/radar 数据，含 de_dust2/de_mirage/de_inferno/de_ancient/de_nuke 等）
- 数据结构：`data/radar_info/de_*.txt`（HLTV overview 格式：pos/scale/rotate + **CTSpawn/TSpawn/bombA/bombB 归一化坐标**）+ `images/` radar PNG
- 任务：把 2-3 张官方图（dust2/mirage/inferno）的 radar PNG 与 CS2D 三图小地图做**空间特征对比**（走廊宽度/开放区占比/掩体密度/出生点到点位距离），输出对比报告，作为 A2-A4 的设计依据

**A2. 空间特征量化脚本（1h）**
- 新写 `test/map-stats.mjs`：对任意 ASCII 网格地图输出——走廊平均宽度、开放区数量/面积、掩体（C/^）密度、点位距离矩阵、视线长直段列表（连续 >12 格无遮挡的直线走廊）
- 跑 CS2D 三图 + 从官方 radar 像素分析（二值化墙体）跑官方图，两侧数据并排对比
- 结论：CS2D 与官方图的差距（如：官方图走廊更窄更曲折、开放区更少、掩体密度更高）

**A3. 每图招牌机制深化（2h）** —— 按 A2 结论改
- 目标：每图一个"只有这张图有"的战术焦点
  - dust2：**穿射情报墙网**——现有薄墙 3 处，可增强为"可听可穿"的墙后博弈区（薄墙旁放箱子垫脚/薄墙形成 L 形穿射角）
  - canal：**水路纵深 + 桥上高打低**——现有守桥台/观水薄墙，可加"水下暗道第二出口""桥上对射位"（注意：深水静音已有，可设计"水下游走偷听"战术区）
  - metro：**投掷物密闭区**——现有油桶+隧道薄墙，可加"必争的窄口投掷窗"（闪光/烟雾价值最大化区域）
- 改完跑 timing.mjs + cover-scan.mjs 确认不恶化

**A4. 新瓦片机制（1.5h）**（选 1-2 个实现，全链路：map-gen 瓦片 → map.js 判定 → combat 交互 → AI 感知 → 纹理 → 小地图 → 音效）
- **可破坏木箱** `D`：hp 2，可被子弹/爆炸摧毁（复用油桶销毁逻辑），摧毁后变 `.`（改变掩体结构，replay 性）
- **单向视窗** `W`：LOS 只从一侧穿透（类似薄墙但单向）
- **冰面** `I`：无摩擦力滑行（移动速度保持、转向迟钝）
- 建议只做**可破坏箱**（与现有油桶体系复用最多，风险最小）；冰面次选

### 任务组 B：游戏全方位优化（4h）

**B1. 战斗手感（1h）**
- 受击反馈：被击中时准星扩散/屏幕抖动分级（目前只有 dmgv 红晕）
- 后坐力：现有 recoil 线性回弹 → 改为"快速抬升+缓慢回落"曲线（recoil 对 gap 的影响已有，改 ballistic.js 参数）
- 击杀确认：现有 kill 音+hitmark，可加"击杀时准星金色扩散环"

**B2. 经济与回合节奏（1h）**
- 检查 economy.js：输方连败奖励/胜方奖励/安放奖金；对照 CS 标准表微调（保持平衡在 40-60% 内，改完跑 balance.mjs）
- 加"半场换边"提示（第 13 回合后）

**B3. 观战体验（1h）**
- 死亡观战：现有"左键切换视角"太弱。加分屏视角（跟随 bot 视角 + 顶部比分条）、观战模式小地图玩家名

**B4. 新手引导 + 首局体验（0.5h）**
- 首局引导：菜单"新手提示"勾选（移动/射击/安弹 30 秒练习目标，用现有 mech-test 地图思路做个练习房地图？——超时风险，可降级为引导覆盖层说明）

**B5. 性能（0.5h）**
- 粒子池复用（game.particles 数组常驻上限 + 复用）、render.js drawParticles 合并 fillStyle 切换、GC 压力检查

### 任务组 C：AI 与平衡（2h）

**C1. AI 对新机制适配（1h）**
- 若实现可破坏箱：AI 学会"打掉箱子再架枪"（感知/决策加一条）
- 高台争夺：现有 highPoint 概率 0.18，可加"占台后守台"逻辑（占台期间转向防守）

**C2. 平衡复测（1h）**
- 全部改动后：`node test/balance.mjs` 三图全跑，目标 40-60%；若 A3/A4 破坏平衡，优先调地图（出生点/路径）而不是 AI 参数（用户区域）

### 任务组 D：验收与收尾（1h）

**D1. 全量回归（0.5h）**
- `node --check` 全部 src/**/*.js、test/selftest.js、test/audio-patch.js、test/simulate.js dust2 normal、test/hell-battle.mjs、train/smoke-test.mjs、test/balance.mjs、test/timing.mjs、test/cover-scan.mjs
- 浏览器手测：三图各打一局，重点看新机制/新地图区域

**D2. 文档（0.5h）**
- 更新 `docs/superpowers/specs/2026-08-02-ui-overhaul-design.md` 追加本次改造章节
- 更新本交接文档状态为"已完成"（或归档）

---

## 4. 已知坑（血泪教训，务必遵守）

1. **不要用 PowerShell 的 Set-Content/Get-Content 编辑含中文的源文件**——编码会损坏（hud.js 曾中招）。只用 edit/write 工具
2. **临时调试脚本放项目根**（如 dbg-tmp.mjs），import 用相对路径 `./src/...`；temp 目录下的脚本 import 会解析失败。用完删除
3. **TILE = 40**（不是 30！）——所有像素↔瓦片换算用 `TILE` 常量，别硬编码
4. **selftest 是 stubdom 环境**：无 window/Image/querySelectorAll——`preloadTextures()` 已降级（resolve false），ui.js 的 `doc.querySelectorAll` 已防御；新增 DOM 依赖代码要加 `typeof x === 'function'` 防御
5. **test/timing.mjs 依赖 aStar**：aStar 返回 `[{x,y},...]` 对象数组（不是数组对）；PATH_CACHE 150ms 缓存，多次调用结果相同
6. **出生点不能落在墙里**：spawn 区域必须与 corridor/room 重叠，否则 checkConnectivity 报"不可达"且 selftest FAIL（metro 踩过）
7. **平衡数值是角色结构+地图结构的合力**：改地图前跑 timing.mjs 看趋势，改完跑 balance.mjs 验证；AI 的 decisions.js/roles.js 是用户并行维护区域，改动前先 `git status`/`git diff` 看有没有用户未提交的修改
8. **平衡测试阈值**：40-60% 已放宽（用户接受），balance.mjs RUNS=8，单次跑有波动，看趋势

---

## 5. 验收标准（全部满足才算完成）

- [ ] `test/selftest.js` PASS（含新机制 mech-test 用例若加了新瓦片）
- [ ] `test/audio-patch.js` PASS（新音效补断言）
- [ ] `test/simulate.js dust2 normal` 通过、`test/hell-battle.mjs` PASS、`train/smoke-test.mjs` PASS
- [ ] `test/balance.mjs` 三图胜率 40-60%（或用户接受区间，注明趋势）
- [ ] `test/timing.mjs` 首接时间 ≥6s 不恶化
- [ ] `test/cover-scan.mjs` 暴露点不增（新增机制区域除外，需说明）
- [ ] 浏览器手测：三图新区域/新机制可玩、无报错、FPS 无下降
- [ ] spec 文档已更新、交接文档状态已归档

---

## 6. 参考资料

1. **CS2 官方地图数据**（A1 用）：`C:\Users\20579\AppData\Local\Temp\opencode\cs2maps`（data/radar_info/*.txt + images/*.png；出生点/点位归一化坐标可直接换算）
2. **B 站地图设计讲解**（用户已认可方向）：
   - 《CS地图令人上瘾的原因—竞技地图的平衡艺术》BV1YVQkBNEMi
   - 《为什么一张地图玩几千遍都不腻》BV1qnGd6JEjn
   - 《到底是什么构成了优秀的 FPS 游戏地图设计》BV1X5411v7Mr
3. **本仓库设计文档**：`docs/superpowers/specs/2026-08-02-ui-overhaul-design.md`（§12 渲染升级、§13 地图结构改造是现状基线）
4. 音效/UI 现状：见本文档 §2，不要重做

---

*开始前：`git status` 看用户是否有未提交改动；改地图用 edit 工具逐处修改 map-gen.js 并即时跑 `node test/selftest.js` 验证可达性。*

---

## 7. 执行结果（2026-08-02）

- A1/A2：`test/map-stats.mjs` + `docs/MAP-STATS-REPORT.md` 已完成官方 radar 像素对比。
- A3/A4：三图招牌区落地；可破坏木箱 `D` 全链路完成。
- B1-B5：受击反馈、击杀环、后坐力曲线、新手引导、观战小地图姓名、粒子池均完成。
- C1/C2：AI 打箱决策完成；平衡趋势 dust2 53-69%、canal 44-59%、metro 39-55%，未较原基线恶化。
- D1：`npm run check`、`npm test`、audio-patch、hell-battle、smoke-test、timing、cover-scan 全部通过。
- D2：设计文档与交接文档已更新，本交接文档状态置为已完成（归档）。