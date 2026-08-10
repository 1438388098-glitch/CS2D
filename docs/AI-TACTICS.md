# AI Tactics Layer

This layer adapts bot behavior to the official radar maps without changing official round timing or spawns.

## CT defense

- The map loader derives hold anchors from the T approach path at 120/220/340px from each bomb site.
- Anchors face the T spawn side, so defenders watch the enemy half instead of standing inside the site.
- The 5v5 CT shell is fixed as 2 A defenders, 2 B defenders, 1 mid roamer.
- Site anchors only chase sounds or shared intel near their own site. Cross-map retakes are triggered by a hot-site detector and keep at least one defender behind.
- Mid is the designated roamer; only it executes the CT push scout.

## T attack

- The default T shell is 3 main attackers, 1 opposite-site diverter, 1 mid.
- The C4 carrier is always forced into the main attack group.
- Main attackers gather at the map-derived entry point before executing; the diverter holds the other site until late round; mid controls the map mid point.
- This replaces the previous all-5-rush-one-site behavior that made every round look like a deathball.

## Map data

- Each official map now has per-site entries, hold anchors, anchor facing, and a mid control point derived from the high-res radar grid.
- The generator and preview remain at docs/OFFICIAL-MAPS.md and docs/map-preview.html.

## Known residual

- Bot-vs-bot win rates are now inside the 30-70% informational band on a stable 20-run sample: dust2 ~63% T, canal ~57% T, metro ~55% T.
- The largest root cause was weapon TTK, not round timing or spawns. The AK/M4 gap was rebalanced so AK keeps a one-tap helmet headshot while body armor absorbs less, and the official round timings are untouched.


## Map AI calibration

- `MAP_AI` in src/config.js applies per-map CT/T spread multipliers. It models official map sidedness without changing round timing, spawns, or movement.
- CT mid no longer stands on the T mid funnel. It defaults near the CT spawn and only commits to a hot site or enemy intel, which removed the old "CT always loses the mid player in the first seconds" artifact.
- Hold anchor depths are now map-specific: dust2/canal use 100/190/300px, metro uses 140/260/380px so CT intercept earlier on the map where T reaches A fast.
- Stable 20-run bot-vs-bot diagnostics after the damage-model and entry fixes are roughly: dust2 ~63% T, canal ~57% T, metro ~55% T, all inside the 30-70% informational band. Map-side tendencies are now small enough that further tuning should focus on retake variety and fight feel, not forcing spawn or timing changes.

## AI 对局迭代（2026-08-03）

- H1-H10 融合：每个 bot 从 10 档地狱参数采样加权混合，加入队伍风格偏好，赛博观战每场都会产生不同战术变体。
- 搜点清角：每张图自动生成进点路径上的 clearPoints 和防守锚点 preaimPoints，T 主攻角色会在点位入口逐点探视，近点时向常见架点位预瞄。
- 乱开枪修复：无情报时不再随机预射；被闪后只有最近视觉/位置记忆方向才会有限次数贫式还击。
- 配合通信：IGL 目击敌人时发布高优先级 focus 情报，团队反应按角色过滤：持包者不追击，侧翼角色前期不脱线，主攻角色才集火。

## 动态局计划与失误修复（2026-08-03）

- 每小局计划：每回合重新摒 rush / split / sneak / default 四种执行方式，并重新扔动每个 bot 的 react、spread、rush、rotate、nade、peek、prefire 等参数，让每小局都不一样。
- 动态适应：记录攻击点胜率、执行方式胜率、CT 前压频率；T 会偏向更能赢的点位和战术，CT 会根据 T 的攻击历史调整防守人数分配。
- 卡死/面壁修复：followPath 现在会检测移动量，卡住超过时间后重新规划；路径行进时角度永远朝向下一个路径点。
- 抽搐修复：清角探身改为限频，不再每帧抽风似地换向；反应期去掉随机角度抖动，等待熬准算完成后再进入对枪。

## 常见 CS2 战术池（2026-08-03）

- 战术池扩展到 9 种：default / rush / split / sneak / fake / slow / mid / contact / antiEco。
- 每小局按经济、比分、上局战术和随机权重选择，同一战术不会连续被偏好。
- contact 在进入点位前直接接触抢先手；fake 使用假攻引导防守；mid 使用双人控制中路；antiEco 在经济化时加强抢战。
- 所有战术都使用同一武器原始精度，不涉及随便变动命中率。
## 道具投掷迭代（2026-08-04）
- 烟雾和闪光不再朝包点中心随机丢，改为投向地图生成的进攻入口路线，并自动避开队友已占用的入口与已存在的烟雾点。
- 高爆手雷只投给新鲜听觉情报或当前可视目标，避免无目标空丢。
- 新增 test/ai-nades.mjs，覆盖入口选点、烟雾去重、情报手雷。
## 队形散布迭代（2026-08-04）
- 每个 bot 新增独立 spreadIdx，入口、中路、假攻、转点等集结目标不再共用同一点，改为按索引环绕站位。
- 入口路线横向散布从 82 提升到 112，避免 3 人进场时贴脸重叠。
- 实测 dust2 10 回合诊断：同队 90 像素内贴脸帧占比从约 38% 降到约 14%，T 平均贴脸对数从 0.65 降到 0.19。
## 残局安弹迭代（2026-08-04）
- 持包 bot 在残局时间不足 18 秒且当前计划点过远时，会改选明显更近的包点，不再死磕原计划点导致时间耗尽。
- 新增 test/ai-clutch.mjs 覆盖近点改选、正常时间不切换、已在点不切换。
## 回防与封烟迭代（2026-08-04）
- CT 已开始拆弹时，附近非拆弹手改为在包点周围分散掩护，不再全部跑远清点。
- T 安弹后的封烟改投 CT 回防路线中段，封锁推进而不是浪费在 CT 出生点；已有烟雾时不再重复丢。
## 拆弹时机迭代（2026-08-04）
- CT bot 拆弹前先判断剩余时间是否足够：无拆弹器且不足 5.15 秒、有拆弹器且不足 2.65 秒时不再开始无效拆弹。
- 已拆到一半且剩余时间足够时可以继续完成；时间不够的 CT 改为前压 T 半场寻找最后一名 T。
## 防守轮换迭代（2026-08-04）
- CT 守点 bot 在长时间没有敌方情报时会按 10-18 秒间隔在本点位掩体锚点间轮换，减少一整回合站死同一位置。
- 轮换同时清空目标缓存，确保换点立刻生效。
## 拆弹器购买迭代（2026-08-04）
- CT 拆弹器不再每个 bot 各自 85% 随机购买，改为优先给游走/中路/队长买一个，其余人只在主购者没钱时低概率补买。
- 避免一回合 0 个或 5 个拆弹器的极端情况；测试固定反经济随机回合计划，保证购买分支稳定。
## 静步追踪迭代（2026-08-04）
- AI 追踪听觉情报或队友共享情报时，距离目标 420 像素内自动切静步，脚步声半径减半，不再一路小跑暴露位置。
- 超过 420 像素时保持正常移动速度，接近后再压低脚步。
## 连败强起迭代（2026-08-04）
- 第 4 回合起若本队连败 3 局且买不起全甲步枪，AI 会按余额强起冲锋枪或沙鹰，不再一律存钱买 P250。
- 狙击手强起优先沙鹰；余额不足时仍回落 P250 存钱。
## 捡枪迭代（2026-08-04）
- eco 局 bot 手里只有 P250/冲锋枪时，会主动换地上的 AK/M4/AWP，不再永远不捡武器。
- 已经拿着步枪时忽略冲锋枪/手枪掉落，避免换枪降级。
## 保枪撤退迭代（2026-08-04）
- 保枪撤退不再固定回出生点中心，改为在多个出生点中选择离存活敌人最远、离自己较近的安全点。
- 会额外避开 lastKnown 记忆点附近，降低撤退路上撞脸概率。
## 出生分布迭代（2026-08-04）
- 每回合按队伍轮流分配出生点，不再全员随机抽，避免 5 个 bot 挤进同一个出生点。
- 出生点数量不足时按模数循环复用，保证开局至少铺开在全部可用出生点上。
## 压力回归迭代（2026-08-04）
- 新增跨地图 AI 压力测试：dust2/canal/metro 各连续模拟 60 秒，检查不抛错、不产生 NaN 坐标/血量。
- 作为后续 AI 改动的稳定性门禁，防止行为改动破坏基础模拟。
## 情报老化迭代（2026-08-04）
- lastKnown 超过 4 秒后直接清空，避免 AI 用过期记忆继续追人或影响保枪选点。
- 4 秒内的新鲜情报仍正常用于追踪、预瞄和道具投掷。
## 残局主动索敌迭代（2026-08-04）
- T 方 1v1 且不持包、无情报时，30 秒后主动压 CT 半场找人，不再蹲守等对手。
- 持包 T 仍优先执行安弹，避免为了找人丢掉赢回合机会。
## 性能缓存迭代（2026-08-04）
- updateBots 每帧只扫描一次实体，缓存双方存活人数。
- 决策/动作/主循环里的全实体存活人数过滤改为读缓存，减少每 tick 的重复数组扫描。
## 持包者护送迭代（2026-08-04）
- 开局由一名主攻 bot 担任护送位，持包者落后超过 240 像素时主动跟上，避免 C4 掉队。
- 若随机持包者正好是护送位，职责会自动移交给另一位主攻队友。
## 迷雾公平性迭代（2026-08-04）
- CT 热区判断不再直接扫描所有 T 坐标，改为只使用 CT 队伍共享情报板（目击/枪声/受击/击杀）。
- 没有共享情报时不会凭全图位置回防，迷雾开启下 AI 不再“开全图”。
## 出生朝向迭代（2026-08-04）
- bot 出生后不再随机朝向，而是直接面向敌方半场，减少开局转向找路的迟钝感。
- 玩家出生朝向保持原有逻辑，不影响操作。
## 静步保枪迭代（2026-08-04）
- 保枪撤退目标带静步标记，bot 撤退时压低脚步，减少被听声定位。
- 与安全选点结合：既撤得远，又撤得安静。
## 多种子压力回归迭代（2026-08-04）
- ai-stress 从单种子扩展到 3 张官方图 × 3 个种子，共 9 组 60 秒模拟。
- 覆盖不同随机开局、战术组合和战斗序列，防止 AI 只在某一种子下稳定。
## 残弹切枪迭代（2026-08-04）
- AI 近战目标且主武器弹匣只剩 2 发时提前切手枪，不再打空后才切换。
- 远距离目标仍保留步枪，避免过早切枪失去长枪优势。
## CT 中路封烟迭代（2026-08-04）
- CT 游走位在回合前段会用烟雾封锁 T 中路推进，烟点位于中点到 T 半场之间。
- 已有烟雾时不会重复丢，避免浪费道具。
## 跟随指令迭代（2026-08-04）
- F1 跟随指令下，bot 不再全挤到玩家身上，而是围绕玩家 60-140 像素分散站位。
- 配合 spreadIdx，多 bot 跟随时会形成松散队形。
## CT 烟雾购买迭代（2026-08-04）
- CT 游走/中路角色购买烟雾概率提高到 85%，保证中路封烟战术有道具可用。
- 其他 CT 仍按原概率购买，避免全队囤烟。
## 回防闪光迭代（2026-08-04）
- CT 回防清点目标带 nade 标记，清点前会朝目标方向投闪光再进点。
- 只在有清点路线时触发，避免拆弹手守包时乱丢闪光。
## 清点高爆迭代（2026-08-04）
- 进点/回防 nade 目标没有闪光时，AI 会用高爆手雷朝目标清点。
- 有闪光仍优先闪光，避免高爆提前暴露推进路线。
## 背身惩罚迭代（2026-08-04）
- AI 看到敌人背对自己且距离小于 420 时，会快速压上去打侧背，不再原地对枪。
- 狙击手仍保持架枪距离，避免用 AWP 贴身冲锋。
## 脚步共享迭代（2026-08-04）
- AI 听到敌方脚步时会把模糊位置报告到队伍共享情报板，队友可据此回防或搜点。
- 报告沿用 lastKnown 的误差位置，不会把精确坐标广播给全队。
## 世界声音共享迭代（2026-08-04）
- AI 听到爆炸、烟雾、安拆弹等世界声音时，会把模糊位置报告到队伍共享情报板。
- 队友可据此判断 T 行动或回防，不依赖精确全局坐标。
## 残血汇合迭代（2026-08-04）
- 血量低于 25 且没有敌人情报时，bot 有概率向最近队友汇合，不再独自冒险。
- 有持包、安弹或拆弹任务时优先执行任务，不会为了汇合放弃目标。