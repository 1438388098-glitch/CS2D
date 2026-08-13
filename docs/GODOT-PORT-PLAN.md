# CS2D → Godot 4.7 完整移植计划

> 生成方式：10 个并行 subagent 深度研究各模块后汇总
> 目标引擎：Godot 4.7.1（`D:\Downloads\Godot_v4.7.1-stable_win64.exe`）
> 源项目：`D:\Claudeworkspace\CS2D`（纯 JS 零依赖 HTML5 Canvas，~2.9 万行 src、~1.5 万行 test）
> 日期：2026-08-11

---

## 0. 执行摘要

### 0.1 总体结论
- **可行性：高**。游戏逻辑层（game/combat/economy/ai 全部）是纯 JS 无 DOM，可逐行翻译 GDScript；渲染与 UI 需用 Godot 原生机制重建（占工作量 60%+）。
- **确定性是移植的灵魂**：项目靠 `seedWorld` + `mulberry32` 实现同 seed 逐帧可复现（audit4b 等测试锁定）。移植必须保住三支柱：**单一种子 RNG、固定 60Hz 物理步、自研网格碰撞/寻路**。
- **训练管线整体保留 Node/JS**，Godot 只做推理消费者（新增约 300 行 GDScript + 1 个导出脚本）。

### 0.2 总工作量（单人，小时）
| 模块 | 小时 | 占比 | 主要方式 |
|---|---|---|---|
| 1. 核心循环与状态机 | 170 | 9% | 重构（主循环→Godot 生命周期） |
| 2. 战斗/武器/投掷物 | 132 | 7% | 直接翻译（自研 hitscan/伪抛物线） |
| 3. 经济与购买 | 30 | 2% | 直接翻译 + UI 重构 |
| 4. AI 感知与决策核心 | 200 | 11% | 重构（decisions 1147 行拆分） |
| 5. AI 战术/角色/辅助 | 95 | 5% | 纯函数直译 + 状态收敛 |
| 6. 神经网络与训练管线 | 30 | 2% | 保留 JS，新增 DQN 推理层 |
| 7. 2D 渲染系统 | 300 | 16% | 重构（烘焙→纹理/瓦片） |
| 8. 3D 渲染系统 | 200 | 11% | 以 render3d-next 为蓝本原生重写 |
| 9. HUD 与 UI 系统 | 520 | 28% | 重做（DOM→Control）**最大块** |
| 10. 网络/模式/地图/工具 | 196 | 11% | ENet 重写 + 模式场景化 |
| **合计** | **~1873h** | 100% | 单人约 47 周（~12 个月）全职 |

### 0.3 全项目三大架构决策（所有模块共同遵守）
1. **纯逻辑与场景树解耦**：核心对局逻辑用 `RefCounted` 数据类 + 纯函数 `tick()`，不挂 SceneTree；渲染/UI 是"数据显示器"。保住 headless 测试能力。
2. **确定性三支柱**：`SeededRNG`（mulberry32 移植，`& 0xFFFFFFFF` 截断）替代所有 `randf()`；固定 60Hz `_physics_process`（`Engine.physics_jitter_fix=0`）；碰撞/寻路/LOS 全自研，**不用 Godot physics 和 NavigationAgent2D**（不可复现、语义不匹配）。
3. **数据资源化**：武器表→`.tres`/Dictionary；地狱阶梯参数+权重→`hell_ladder.json`（由新增 `deploy-godot.mjs` 导出）；地图→JSON 抽取后转 TileMap。

### 0.4 推荐实施顺序（里程碑）
| 里程碑 | 内容 | 累计小时 |
|---|---|---|
| M0 | Godot 工程脚手架 + SeededRNG + 常量 + SignalBus + headless 测试框架 | 40 |
| M1 | 核心逻辑链：Utils→RNG→EntityData→Match.tick 空转→map 碰撞→economy（`core-infra/utils/entities/economy` 测试点亮） | 210 |
| M2 | AI 锚点：mulberry32+map_grid+rules+peek 四件套（P0 测试先行） | 120 |
| M3 | AI 决策/战斗/战术全量 + DQN 推理层（aiLog 指纹 vs JS 对拍） | 400 |
| M4 | 2D 渲染 + HUD + UI（最大块，可拆子里程碑） | 820 |
| M5 | 模式/网络/地图/编辑器 + 存档统一 | 230 |
| M6 | 3D FPS 视角（以 render3d-next 为基准）+ 清理收尾 | 200 |

---

## 1. 核心游戏循环与状态机（170h）→ `res://core/`

### 现状
- `main.js`(384)：RAF + 固定步长累加器（1/60，最多 8 步/渲染帧）+ 渲染分发 + 性能监控 + `window.GAME.debug` 测试钩子。
- `game.js`(1040)：`createGame/startMatch/startRound/endRound/finishMatch` + `update(game,dt)` 每物理步主更新 + `updatePlayer/updatePlayerAim/updateTimers`。
- `entities.js`(110)、`ctx.js`(40, mulberry32)、`bus.js`(24)、`registry.js`(30)、`utils.js`(29)、`config.js`(234)。

### Godot 架构
- **主循环**：`_process`（渲染帧）驱动视觉，`_physics_process`（60Hz）即一个模拟步。**不要自建累加器**——`Engine.physics_ticks_per_second=60` + `max_physics_steps_per_frame=8` 与 JS `steps<8` 语义一致；设 `physics_jitter_fix=0` 保证 delta 严格 1/60。
- **状态模型**：`Match.gd`(RefCounted) 持有 game 等价数据，`Match.tick(dt)` 纯函数；视觉 Node2D 每帧读快照插值。
- **基础设施拆为 autoload**：`WorldRand`(mulberry32)、`SignalBus`(bus)、`Config`、`Registry`、`Keymap`；`Utils` 静态类。
- **输入**：DOM 事件→Godot `Input` + `Input.mouse_mode=CAPTURED`；`setKey/setMouse` 保留为测试注入 API。

### 关键风险
- **mulberry32 位运算**：GDScript int 是 64 位，`Math.imul`/`>>>0`/`|0` 全部要用 `& 0xFFFFFFFF` 模拟。这是逐帧确定性头号风险。
- **dt 上限**：JS `dt=min(dt,0.05)` 暗示曾有 30Hz 混用，必须锁死唯一 60Hz 节拍。
- 测试迁移：`audit4b-determinism.mjs`（60 万帧指纹）、`core-infra/utils/entities/simulate` 等 ~50 个测试直接相关，核心验收 = 同 seed 指纹复现。

---

## 2. 战斗/武器/投掷物（132h）→ `res://gameplay/`

### 现状
- `combat.js`(649)：fireWeapon→fireRay（**实体先扫、墙体 6px 步进、烟雾遮挡，最后比 best.t vs wallT**）→applyDamage→killEntity→pickup。
- `ballistic.js`(95)：纯函数弹道扩散/爆头/距离衰减。
- `grenades.js`(131)：**伪 3D 抛物线**（2D 直线 + h 高度参数线性衰减 + 轴分离反弹 + 水面涟漪），非真实弹道。
- `bomb.js`(119)、`weapon-fx.js`(140，确定性哈希绘制)。

### Godot 决策
- **子弹用自研网格 DDA 直译，不用 RayCast2D**：瓦片字符语义（`=`矮墙穿透、`~`浅水、`≈`深水、`^`高台）+ `fireRay`/`los` 的 6px 步长对称性 + 确定性，物理引擎全不满足。
- **投掷物自研，不用 RigidBody2D**：h 伪高度、阻尼、反弹系数、水面周期涟漪无法用刚体表达。
- **粒子/弹孔/伤害数字自研**（Node2D._draw），**不用 GPUParticles2D**：发射随机不可控破坏 seed 回放；`MAX_PARTICLES=600` 池化。
- **武器数据 → `WeaponData.gd`(Resource) + 13 个 `.tres`**：手感调试友好。
- 半自动边沿：**不要用 InputEvent 事件流**，在 `_physics_process` 维护 `was_down` 轮询（防事件排队连发/漏发）。

### 最高风险
- **combat↔AI 双向紧耦合**：`lastKnown/lastShot/lastDmgFrom/blind/report(MSG)` 全是实体字段直写，必须保持"实体状态直写 + GameState 共享"模式，不能改成事件，否则 bot 行为漂移。`aiParams.peekSkill/counterStrafe/spreadMult` 基因注入点必须保留。
- **顺序不变量**：fireRay「先实体扫描→墙体→烟雾」顺序 + `game.entities` 遍历顺序决定同帧先打谁，不能改。
- 验收：`audit7-damage`（同 seed 伤害事件序列一致）、`audit2-ballistics`（命中率/TTK ±2%）、`fx-nade-trail`（轨迹 ≤1px）。

---

## 3. 经济与购买系统（30h）→ `res://economy/`

### 现状
- `economy.js`(109)：killRewardFor/addMoney/nextRoundBudget/clearEquipment/buyItem（购买窗口含 LIVE 残留）。
- `config.js`：PRICES/ECONOMY（CS2 规则：$800 起始/$16000 上限/连败补偿链 `[1400,1900,2400,2900,3400]`/平局双方 +1500 不动 streak）。
- `ai/buys.js`(354)：planTeamEconomy→planAwpAllocation→buyEco/Force/Full→planWeaponDrops 三遍式。

### Godot 决策
- `Economy.gd`(autoload) 静态常量 + `add_money/buy_item`；个体经济挂 Player 节点，团队连败挂 Match，每回合购买规划用临时 Dictionary。
- 购买菜单→`BuyMenu.tscn`（Control/GridContainer，三态 owned/locked/off）；`buyItem` 成功发信号驱动 HUD/计分板刷新。
- **AI 购买决策整体平移**：354 行逻辑密度高但纯数据变换，唯一副作用是 `rand()`——必须保留种子注入（RandomNumberGenerator set_seed）。

### 易错规则（移植时最易漏）
- 换边是**原子事务**：清装备+钱重置 $800+比分互换+winHistory 翻转+连败归零（第 9 回合 / 加时每 3 回合）。
- 连败补偿 `min(streak,4)` 封顶 3400；平局 +1500 不动 streak。
- 换枪旧枪落地 `game.drops`，与 spawnRound 清 drops 时序耦合。
- 测试：`economy.js`(23 组断言)、`fx-price2900.mjs`（含确定性断言）。

---

## 4. AI 感知与决策核心（200h）→ `res://ai/`

### 现状（最高复杂度模块）
- `core.js`(533)：`updateBots` 遍历壳 + `botThink`（感知→决策→动作 30 步编排：受击反击/听枪/目击/aimLost 状态机/peek/急停/strafe/突击/保枪/目标执行/记忆遗忘）。
- `perception.js`(64)：240px 空间哈希网格 + FOV(1.15rad) + LOS，公平约束「感知距离 ≤ 玩家屏幕半对角」。
- `decisions.js`(1147)：`botObjective`(缓存壳, TTL 3s/600ms, 24/48px 滞回带, 警报覆盖) + `botObjectiveRaw`(570 行单函数, **40+ return 分支优先级链** + 两处网络钩子)。
- `actions.js`(486)：IGL 拍板/安拆弹/假拆/道具/预瞄/开火管控。
- `netAct`(L216)：LIVE 门控→0.3s 决策缓存→netWeights 多图回退→`netObs(13)`/`netObsTeam(33)`→forward→argmax→6/18/36 解码→netObjective 目标点。

### Godot 架构
- Bot 实体 `CharacterBody2D`（**手动 `position += v*delta` + 自研网格碰撞**，不用 move_and_slide——急停/zigzag/贴墙滑入需要精确瞬时速度）+ `BotBrain`(Node) 承载 40+ 决策状态字段 + 中央 `AISystem`(Node) 遍历壳 + `Blackboard`(Node)。
- 空间感知**自研哈希网格 Dictionary[Vector2i]→Array**，不用 Godot 物理查询（非确定 + 破坏公平性约束）。
- **寻路自研 A\***（PATH_CACHE/string-pulling/stuck 重路由/绕圈看门狗是锁定资产），**不接 NavigationAgent2D**（异步+物理相关+瓦片语义无法映射）。
- 运动插值保留 `smooth.gd`（逻辑层限幅），不依赖 Godot physics_interpolation。

### 关键风险
- **decisions 拆分**：1147 行单函数必须拆成"求值器链"（`Array[Callable]` 顺序执行），**分支顺序、门控条件（含 `e.netLane===undefined` 让位开关）、30+ 副作用登记**必须逐字保留。
- **滞回缓存**：24/48px 停/续走带 + cacheKey 5 元组失效 + search TTL 600ms，是 3 个测试 + 体感依据。
- **公平性**：netObs 严格无敌人坐标直读；听枪模糊/通信半径/背身门控逐条保留。
- **时间单位混用**：`game.time`(秒) vs `lastDmgT/objAt`(毫秒)——移植时统一但**不能"顺手优化"**以免漂移。
- 验收：同 seed aiLog 决策序列逐帧一致 + decisions golden 组合表 + DQN forward argmax 逐位相等；P0 测试 `ai-rules/dqn/ai-perception/ai-obj-hysteresis/ai-genome` 先行。

---

## 5. AI 战术/角色/辅助模块（95h）→ `res://ai/`

### 现状（12 个模块 ~8600 行）
`roles.js`(577，队伍编成+回合计划+IGL+persona 播种 seed\*31+i\*7)、`peek.js`(201，掩体几何纯函数)、`rules.js`(167，16 个 shouldXxx)、`senses.js`(93，听觉半径表/LOS×0.55/脚步±140px)、`oppmodel.js`(96)、`info.js`(147，黑板 report/query)、`shared.js`(128)、`tactics.js`(82，hellMix)、`smooth.js`(35)、`stability.js`(30)、`persona.js`(38)、`ai-genome.js`(67，**19 维**基因)。

### Godot 决策
- 纯函数类：`rules/peek/senses/tactics/smooth/stability/persona/genome` → static func。
- `info_board.gd`(Node) 挂比赛级（队伍共享黑板）；`opp_model.gd`(RefCounted) 每局实例；`role_state.gd`/`bot_ai_state.gd`(RefCounted) 收敛散装实体字段。
- **听觉纯逻辑，不用 AudioStreamPlayer**：AI 判定需要二值门控+方向误差+置信度+半径表，音频基于真实时钟不可复现。
- 地图抽象：`MapData.gd` 注入（替代 getMap() 全局），`T_ROUTES` 硬编码坐标→地图数据。

### 关键风险
- **roles↔decisions 契约耦合**：~20 个散装字段被 decisions 50+ 处读取。对策：先定义 `RoleState/BotAIState` 唯一读写面，decisions 只读状态类。
- **persona 乘子接线图**：4 维人格×7 乘子渗透所有决策层，保留 `styleOf` 单一入口，移植后做同 seed 冒烟验证乘子生效。
- `ai-genome` 遗传算子（crossover/mutate）纯移植阶段可延后（训练系统同步时才需）。

---

## 6. 神经网络与训练管线（30h）→ 保留 JS + Godot 推理层

### 核心决策：**训练管线整体保留 Node/JS，零改动**
- 训练是无头 Node 模拟（`stubdom.js` 桩 DOM），与浏览器无关；产物是纯数据 JSON（`{input,hidden,output,iw,ow}`）。
- 性能：Node/V8 JIT 比 GDScript 快一个数量级；移植 GDScript 需先移植整个游戏模拟（200+ 小时）且破坏确定性。
- **唯一新增 JS 文件**：`train/deploy-godot.mjs`（checkpoints/config → `res://data/hell_ladder.json`，H1-H12 全参数+netWeights，~190KB）。
- 验收红线：`git diff` 覆盖 train/scripts/src/dqn.js/src/ai-genome.js/src/ctx.js = 0。

### Godot 侧新增（~300 行）
- `DqnNet.gd`：`forward` 移植（2 层 MLP，偏置在 `iw/ow` 末列；`PackedFloat32Array` 行缓冲；单次 ≤1716 乘加 + 32 tanh ≈ 微秒级）。
- `DqnLoader.gd`：4 种格式兼容（裸权重/多图 `{__default,...}`/null/.weights 包裹），多图回退顺序 `w[mapId] || w.__default || w`。
- `netObs.gd`/`netAct` 钩子/`netObjective`：从 decisions.js 逐行直译，0.3s 决策缓存语义保留。
- **不移植反向传播/Adam/ReplayBuffer**。
- Golden test：同一权重同一 obs，JS vs GDScript forward 输出误差 <1e-9。

---

## 7. 2D 渲染系统（300h）→ `res://render2d/`（全项目最大硬骨头之一）

### 现状
`render.js`(1047)：20 个绘制阶段（底图→水→站点→箱→炸弹→掉落→手雷→阴影→实体→死亡→命中→激光→烟→粒子→弹孔→弹道→天气→雾→尘埃→伤害→击杀标签）；三张全图烘焙 Canvas（static/decal/shadow）+ 可见切片剔除 + 相机跟随/钳制/震动 + 程序化纹理兜底。`render2d-gpu.js`(339) WebGL 后端。`textures.js`(598)（7 张 ambientCG JPG + 8 个程序化生成器）。`fog.js`/`fog-layer.js`。

### Godot 决策
- 场景树：`World2D(Node2D)` + 各层（Ground/TileMapLayer、DecalLayer、ShadowLayer、Water._draw、Entities(y_sort)、FxWorld、Weather、FogLayer + `Camera2D`）+ `HUD(CanvasLayer)`。
- **静态底图烘焙**：跨瓦片合成产物（材质边缘/光照烘焙/装饰物/站点字母）在加载期渲染进 SubViewport→ImageTexture"烘焙大图"；foundry 6000×5600 大图按 4096 象限分块。地面/墙用 `TileMapLayer`+图集（原生剔除、低内存）。
- **阴影自研烘焙**（45° 投影条 + `_shadowRev` 重烘焙），**不用 Light2D**（视觉+确定性）。
- **迷雾自研**：CPU `castVisionPolygon`(96 射线) + Image 写 alpha + 模糊 shader + 150ms 缓存，**不用 CanvasModulate**（无法表达局部视野）。
- **程序化纹理**：SubViewport 捕捉法（矢量 API 语义最接近 JS 绘制段，几乎逐行搬 _draw）→ 离线烘焙 .res 运行时零成本。
- **粒子自研池**（600 上限 + Node2D._draw），不用 GPUParticles2D。
- **字体**：默认字体无中文字形——必须打包 Noto/思源 CJK 字体（"爆头!"/bot 名）。
- 自适应降档初期丢弃（Godot 渲染器比 CPU Canvas 高效）。

### 关键技术风险
- **`hash01`/`Math.imul`/`>>>0` 32 位截断**（fx 模块共用）——最隐蔽的坑，先写单元测试对照。
- **贴花全量重绘帧尖峰**：尸体移出烘焙层，与 impact 一样按时间过滤 _draw。
- 程序化纹理矢量→像素落点（Y 翻转/坐标轴差异一次校准，做 JS↔Godot 同 seed 截图比对脚本）。
- 性能目标：1080p 全链路 2D ≤4ms/帧；迷雾重建 ≤10ms 峰值；烘焙每图 ≤2s。

---

## 8. 3D 渲染系统（200h）→ `res://render3d/`

### 核心决策：**以 `render3d-next.js`(3064) 为规格，Godot 原生 3D 完全重写；丢弃光线投射**
- `render3d.js`(2206 legacy DDA) + `render3d-gl.js`(524 WebGL) 本质是"手写 3D 引擎"，Godot 自带全部能力，保留 = 再造轮子且性能上限低。
- **唯一的直接翻译**：`fps-laser.js` castAimRay（玩法/瞄准纯数学）+ 瓦片高度语义（`^`=整格/`R`=半格/`=`/`C`=0.55/`o`=0.45）。

### 架构要点
- **2D 仿真 + 3D 只读镜像**共享单一 GameState：`pos=Vector3(e.x, elevation, e.y)`；yaw/pitch 符号逐项验证（内置坐标系自测场景）；FOV 需换算为垂直角。
- 静态世界：**MultiMeshInstance3D**（墙 v0-v3 变体哈希分配照搬）+ `StandardMaterial3D`；地面顶点色 AO 用 SurfaceTool。
- 角色：程序化 PrimitiveMesh 拼装（~12 个 BoxMesh，照搬 makeCharacter），池化 ≤24，零美术管线。
- viewmodel 武器挂 Camera3D 下；动画数值（后坐/换弹/切枪/开镜/bob/sway）从 `updateViewmodelNext` 照搬。
- 天空 `ProceduralSkyMaterial`/`PanoramaSkyMaterial`（THEMES sky 颜色）；光照 DirectionalLight3D(太阳阴影)+OmniLight3D(cameraFill)+bounceLight；ACES 色调映射 + exposure≈0.92；`scaling_3d_scale` 映射 `_renderScale`。
- 粒子用 GPUParticles3D（替代 JS CPU 池化）；弹道线 ArrayMesh PRIMITIVE_LINES。

### 验收基线：**render3d-next，不是 legacy**。性能：中端 1080p 60fps（3D ≤8ms）、draw call ≤20 静态。

---

## 9. HUD 与 UI 系统（520h）→ `res://ui/`（最大工作量单块）

### 现状
`index.html`(400, 184 个 id 覆盖层)、`styles.css`(940, **30-40% 死代码**：5 代主菜单层叠)、`ui.js`(1567)、`ui-dom.js`(221)、`hud.js`(868 画布 HUD)、`map-editor.js`(702)、`career-ui.js`(822, innerHTML 全量重建)、`ranked-ui.js`、`lan.js`、`modes.js`(1398)。**双套并行 HUD**（DOM + 画布 + FPS next 后端 drawMatchOverlay 三态分支）是历史包袱。

### Godot 架构
- 根场景 `UiLayer(CanvasLayer layer=10)` + 全部 Control：HudRoot/EventHud/ScreenFx/各 Overlay（Menu/Help/Tutorial/Pause/Scoreboard/Buy/Settings/Major/Lan/Editor/End/Career/Ranked/Cyber/ModeHud）。
- 布局 `Container`+锚点；`window.stretch=canvas_items, aspect=keep` 替代 DPR 处理；主题 `Theme.tres` 替代 CSS Design Tokens；动画 `Tween` 替代 CSS @keyframes。
- **画布 HUD 合并策略**：信息型元素→Control 节点；程序化瞬态特效→唯一 `HudFxControl._draw`；准星/小地图→`_draw`；狙击镜→SubViewport+遮罩 shader；**一次性消灭 `_render3dBackend==='next'` 三态分支与三处 C4/低血重复**。
- 事件：`SignalBus.gd` 镜像 bus.js，game.js 的 22 个 emit 机械替换。
- 键位重绑：31 个 action → InputMap + ConfigFile 持久化。
- localStorage（~15 个键）→ `SettingsStore.gd`(ConfigFile `user://`)。

### 关键风险
- **career-ui 822 行 innerHTML** → 数据驱动控件重建（最大单面板，48h）。
- **地图编辑器**：EditorCanvas._draw + 撤销栈直搬 + FileDialog/DisplayServer.clipboard + validateRows 纯函数化（试玩闭环）。
- CJK 字体缺字必现；innerHTML 面板全部"数据→控件重建"需统一 `rebuild(root,state)` 模式。
- 验收：184 个 id 逐一对照清单；三视角×双后端共 6 组合 HUD 只渲染一次；确定性（固定 1/30 步进 UI 时钟）。

---

## 10. 网络/模式/地图/工具（196h）

### 网络（16h）：**Godot ENet 原生重写，分两阶段**
- 现状：`server.js`(317) 手写 WebSocket 中继，零游戏逻辑；LAN 是"双平行宇宙"——同 seed 本地模拟 + 只同步远程玩家实体（33ms 快照）。
- MVP：`ENetMultiplayerPeer` 房主 listen + 客人 IP 直连；沿用 hello/welcome/start 协议语义 + 远程实体插值 `smoothRemote` 直译；断线→`peer_disconnected`。**保留 Node 服务器 = 移植后仍维护双进程，与 Godot 导出单文件相悖。**
- 长期可选：MultiplayerSpawner/Synchronizer 为 5v5 铺路。
- 房间发现需自建 ~100 行 Lobby 场景（房间码生成 + IP 直连）——两条路线共同成本。

### 模式（~96h）：单一 autoload `GameState` + 模式场景切换 + `GameFSM`
- `modeDef.{start,update,onFinish}` 契约 → autoload 状态机 + `enter_mode(id)` 切场景。
- 拆分：`MajorSim.gd`(48 队瑞士轮, 24h, 保留 setMajorSim 注入=Callable)、`CyberSim`+金币(8h)、`RankedController`(8h, 修"终局判定 4 处重复缺 OT"问题→统一 `match_win_at()`)、`Duel`(8h)、`CareerSim`(32h)。
- **存档收敛**：4 份重复 localStorage → `SaveManager`(user://save.json 带版本迁移)。

### 地图（~48h）
- 瓦片字符 → TileSet(14 字符) + `MapBuilder.gd` 摆入 TileMapLayer；语义烘焙（sites/spawns/holds/clear_points/lanes）→ `MapData.gd`。
- 寻路：**保留自写 A\* 移植**（NavGrid 封装，确定性），NavigationRegion2D 可选二期。
- 编辑器：Godot 运行时编辑器面板（Control 工具模式），校验逻辑→`MapValidator.gd`。
- 地图生成器 `map-gen.js`→`MapGen.gd`（纯数组生成保留内容管线）。
- 官图数据从 `src/official-maps.js` 脚本抽取 JSON（防手工转录错误）。

### 资源管线（12h）
- 7 张 ambientCG JPG → `res://assets/textures/`（VRAM Compressed）；THEMES 色板→常量。
- **音频合成器无法直接迁移**：优先一次性导出 WAV 资源（~4h），AudioStreamGenerator 重写后置（+24h）。
- `node_modules/three` + `vendor/three.module.js` 2D 移植后删除。

### 工具脚本清理（8h）
- 保留：check-syntax/run-tests/import-official-maps（改造加 --emit-json）/build-map-preview/generate-random-maps + 全部 test/（行为规格）。
- 丢弃：patch-major（含 server.js 自检链）/全部 fix-\*/migrate-\*/mm-upgrade/tune-first/gen-bracket-html 等一次性脚本。
- 根目录清理：`*.tmp.mjs`(8)/config.js.bak/`*.log`/major-bracket.\*/render3d-next-shot.jpg → 删或移 docs/；net-\*.json → 移 train/checkpoints/。

---

## 11. 横切风险总表

| 风险 | 等级 | 对策 |
|---|---|---|
| mulberry32/哈希 32 位截断差异 | **P0** | `& 0xFFFFFFFF` 手写无符号右移；先做 hash01/rng 单元测试；audit4b 指纹对拍 |
| decisions.js 拆分破坏分支序/副作用 | **P0** | 求值器链 + 副作用登记表 + golden 组合表测试 |
| combat↔AI 字段耦合被改坏 | **P0** | 实体状态直写模式不动；aiParams 注入点清单核对 |
| HUD 双套/三态分支合并漂移 | P1 | 按元素归属制合并；6 组合验收只渲染一次 |
| CJK 字体缺字 | P1 | 打包 Noto/思源字体，字体缩放不布局错位 |
| 物理引擎/导航引入非确定性 | P1 | 全自研碰撞/寻路/LOS；PhysicsServer 仅子弹表现层可选 |
| 时间单位混用 | P1 | 统一毫秒/秒语义但保留数值，加注释不"顺手优化" |
| 训练侧被误改 | P1 | git diff 红线；只加 deploy-godot.mjs |
| 大图显存超标 | P2 | TileMapLayer 瓦片 + 4096 分块 |
| 3D 坐标/朝向符号错 | P2 | 坐标系自测场景 + JS 截图比对 |

## 12. 验收总纲
1. **确定性金标准**：Godot 版同 seed 整局逐帧指纹 = JS 版（audit4b 公式），随机流调用序一致。
2. **行为等价**：同 seed 下关键事件序列（伤害/决策 aiLog/经济结算/比分）与 JS 版逐项一致。
3. **测试迁移**：189 个默认测试中 ~50 直接命中核心逻辑，按 P0→P2 优先级迁 GUTS/headless 脚本，核心对局类用 `godot --headless` 跑。
4. **性能**：headless 10 万步 <60s；2D 1080p ≤4ms/帧；3D 60fps ≤8ms；netAct 每帧 <1ms。
5. **可玩性回归**：9 种模式全通 + 三视角 + 编辑器闭环 + 中文字体无缺字。

---
*文档由 10 个并行研究 subagent 产出 + 人工汇总；各模块详细报告（逐函数签名/行号/测试映射）见各 subagent 原文，本文件为决策级汇总。*
