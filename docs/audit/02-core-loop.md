# 02 · 核心循环与实体系统调研

范围：src/game.js、entities.js、ctx.js、bus.js、registry.js、utils.js、input.js。

## 现状
- update() 单帧顺序：hitPause → dmgPops → time → modeDef.update → 状态机 → updatePlayer/updateBots/updateGrenades → 实体位移循环 → 粒子/掉落衰减 → UI 事件 → 相机
- 实体"胖对象"50+ 字段，对局内实体数组恒定无 GC；粒子有对象池
- bus 事件总线（Map<evt,Set<fn>>），输入经 keymap 可重绑，blur 自动清键暂停
- 玩家与 bot 共用同一套命中/位移/武器实现（全项目最佳部分）

## 已实锤 Bug（Node 实跑复现）
- **B1 投掷键失效**：input.js:214 quickThrow 先设 fireCd=0.3 → combat.js:52 直接 return，手雷根本扔不出
- **B2 切雷后按住左键每帧崩溃**：entities.js:84 weaponDef 对 nade 槽返回 null → game.js:658 `null.auto` 抛 TypeError（每帧主循环剩余逻辑被跳过）
- **B3 T bot 站桩被踢**：game.js:414-430 `e.stuckT>0.6 && sd<8 && (e.path || e.team==='t')` —— T 侧条件恒真，静止架枪 bot 每 0.6s 被随机重路由+冲量，实测 2s 漂移 77px；CT 无此问题

## 架构问题
- C1 每帧 5-7 次 DOM 写（flash/dmg/lowhp/objtext/holdbar 无条件 emit + ui 无条件写）
- C2 三套互相打架的"卡死检测"（game.js:414 / map.js:672 / ai/core.js:430）
- C3 game.player 单点假设深埋（分屏/联机的拦路虎，combat.js 等几十处 `e===game.player`）
- C4 事件总线隐式协议，无清单
- C5 drop 对象构造重复 4 处（economy.js:65,81 / combat.js:445,469）
- C6 botNameIdx 模块级累进 → 同 seed 多局名字/人格漂移，训练/回放不可复现
- C7 安弹后 T 全灭仍判 CT 歼灭胜（combat.js:537-546 未判 planted）
- C8 杂项：updatePlayerAim 双调用、lastMouse 死状态、F1-F4 不进 keymap、camera clamp 两处重复、spectate 三处重复
- C9 粒子池 shift() O(n²) 风险

## 优化建议（选）
| # | 方案 |
|---|---|
| O1 | quickThrow 先清 fireCd 或 fireWeapon 调整检查顺序（P0） |
| O2 | weaponDef 对 nade 槽返回上一武器或 `w ? w.auto : ...`（P0） |
| O3 | 重路由加 `!e.aimTarget && obj 未到达` 守卫（P0） |
| O4 | 表现事件合并 emit('hud') + ui 值缓存 |
| O5 | makeDrop 统一 helper |
| O6 | 卡死检测收敛为单一 movement.js |
| O7 | botNameIdx 从 seed 派生 |
| O14 | 安弹后跳过歼灭结算 |

## 拓展（选摘）
ECS-lite 组件化（新实体类型前置）、机枪塔/无人机/载具（高度层已有）、补给箱/弹药拾取、滑墙碰撞、掩体破坏（crates 管线已有）、本地分屏（先做 C3 重构）、手柄支持（inputSource 抽象）、事件总线升级、固定时间步长（1/120s 累加器）。
