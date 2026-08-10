# CS2D 2D 部分调研报告（2026-08-08）

10 个并行 subagent 对项目 2D 部分进行了深度调研（只读，未改动代码），产出以下分报告与汇总。

## 分报告索引

| 文件 | 范围 |
|---|---|
| 01-render.md | 2D 渲染管线（render.js / textures.js / hud.js / fog.js / render3d 集成） |
| 02-core-loop.md | 核心循环与实体系统（game.js / entities.js / input.js / bus.js） |
| 03-maps.md | 地图系统（map.js / map-gen.js / map-editor.js / 官图数据） |
| 04-combat.md | 战斗/弹道/投掷物/炸弹/经济 |
| 05-ai.md | AI 系统（ai/ 11 模块 + 基因组 + 人格） |
| 06-modes.md | 玩法模式与养成（modes.js / duel / ranked / career） |
| 07-ui.md | UI 与交互（ui.js / ui-dom.js / hud / index.html / styles.css） |
| 08-audio-fog-lan.md | 音频 / 迷雾 / 局域网 / 情报黑板 / 事件总线 |
| 09-training.md | 训练与进化（train/ + dqn.js + 基因组 + 部署链） |
| 10-arch.md | 架构 / 服务器 / 测试体系 / 文档 / CI |

## 最高杠杆汇总（跨全部报告）

### 已实锤 Bug（P0，本次已顺带修复的部分见「跟随视角」章节）
1. **玩家投掷键（4/5/6）完全失效** — input.js quickThrow 设置 fireCd=0.3 后被 fireWeapon 拒之门外（input.js:218-222 / combat.js:52）
2. **手持投掷物+按住鼠标 → 每帧 TypeError** — weaponDef 对 nade 槽返回 null，game.js:658 访问 null.auto（本次修复 updatePlayerAim dt 时同区排查）
3. **空闲 T bot 每 0.6s 被"卡死重路由"踢动** — game.js:414-430 的 `e.team === 't'` 恒真，T 方架枪/守点形同虚设
4. **LAN 联机是"双平行宇宙"** — 只同步玩家位置，伤害/死亡/回合不同步；被打一方客户端永远不知道（C2 致命缺陷）
5. **AudioNode 泄漏** — master.js 的 tails 从未 disconnect，长对局音频图无限膨胀
6. **迷雾遮挡规则与真实 LOS 不一致** — `=` 薄墙/`C` 掩体/深水在雾中被画成遮挡，视觉≠判定
7. **AI 晚安弹分支是死代码** — decisions.js:821-828，T 方残局时间管理失效
8. **训练 seed 坍塌** — evolve.js:20 seed 相邻，种群"背 6 局"过拟合（README 自记的坑未修复，H4-H7 现役基因在此错误评估下训出）

### 性能（按收益排序）
1. 迷雾重算节流（render.js:451 量化 16px+120ms 太密）→ 32px+250ms 或端点缓存，移动中省 1-3ms/帧
2. 烟雾/粒子逐帧渐变+随机噪点 → 预烘焙 sprite（烟雾还有每帧闪烁的视觉 bug）
3. decalLayer 是全项目无写入的死图层，每帧白合成一次
4. 实体绘制每帧 150+ 字符串状态拼接 → 模块级常量
5. 3D 墙渲染每帧 ~3800 对象分配 + 1920 次 atan
6. ui-dom.js 每帧 4-7 次无效 DOM 写入（HP/金钱同值也写）
7. styles.css 70KB 堆叠 6 代迭代，30-40% 可删

### 架构（模块化建议）
- modes.js 70KB 应拆（数据/模拟/AI 难度/各模式独立文件）
- config.js 196KB 中 183KB 是权重 → 外移 JSON（config.js.bak 可删）
- 三套重复的存档样板 → src/save.js
- 战队阵容数据 4 处复制（ranked/career/duel/modes）
- 事件总线无事件名清单；sim 与表现（每帧 DOM 写）耦合
- window.__xxx 全局契约蔓延（IDE 无法静态检查）

### 玩法拓展（选摘）
- 新武器：RPG/榴弹/电击枪/燃烧瓶；配件系统；反弹子弹；穿人链式击杀
- 投掷物实体碰撞+直接命中（当前穿人）、弹跳几何修正、轻投/高抛
- 爆头模型改为瞄准点驱动（现在纯概率，无法"瞄头"）
- 新玩法：军备竞赛/山丘之王/夺旗/感染模式/自定义房间规则/回放系统
- AI：语音报点、心理战（假拆/假闪/诱饵）、队伍记忆与复仇、教学 AI、解说
- 地图：可破坏墙/动态地图/多层、编辑器（图层/缩放/对称/官方图载入）
- 联机：事件同步、断线重连、观战、语音
- UI：主题皮肤、i18n、触屏、可访问性（focus-visible/reduced-motion）
- 训练：PPO 升级、自对弈体系化、奖励塑形库、仪表盘、MMR 自适应难度

### 工程卫生
- **git 174 个文件未提交**（含 career/ranked/duel/render3d 整套新模块）——优先处理，防丢失
- test/check 脚本化自动发现（41 段 `&&` 手写链）
- 5 个真回归测试游离在 npm test 链外
- 帮助文案"先赢 13 回合"与配置 MR9 脱节
- server：无缓存/压缩/安全头/WS 限制；start.bat 端口硬编码 8080
