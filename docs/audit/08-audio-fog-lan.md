# 08 · 音频 / 迷雾 / 局域网 / 情报黑板调研

范围：src/audio/{core,master,patches}.js、audio.js、fog.js、lan.js、info.js、bus.js（关联 server.js）。

## 音频
- 零资源全合成（WebAudio：4 总线+压缩器、距离音量/低通/StereoPanner、混响、环境 loop、30+ 音色）
- **A1 实锤泄漏**：master.js tails 数组收集 panner/低通/混响/振荡器但从不 disconnect → 每音效泄漏 2-9 个常驻节点，300 枪对局累积 600+ 节点（设计文档承诺的清理未落地）
- A2 throttle 死代码（防爆音防线失效）；A3 无真 3D 定位（PannerNode/HRTF/遮挡/多普勒全无）
- A4 **敌方脚步对玩家不可闻**：step 事件只在玩家自身更新发（game.js:637-647），bot/LAN 对手无声 → 听声辨位缺失
- A5 涉水脚步无材质差异；A7 环境音 setTimeout 后台不停；A8 无手势恢复兜底

## 迷雾
- **B1 fogBlocked 与 losBlocked 规则不一致**：`=`/`C`/深水在雾中全当阻挡，但 LOS 可看穿 → 雾画得比实际视线严（视觉≠判定≠瞄准）
- B2 射线步长 8px vs 6px 不一致；B3 视点数=玩家+全部同队 bot，最坏 6.7 万次 fogBlocked/重算；B4 FPS 无视线迷雾只有距离截断（两视角语义不一致）；B5 魔数 560 散落 6 处

## 局域网（WebSocket 中继，非 WebRTC）
- **C1 致命"双平行宇宙"**：只同步 seed+玩家位置，双端全量模拟必然漂移（变步长 rAF）
- **C2 致命：远端攻击对本地零伤害**（无 damage/death 事件，被打方永远不知道）
- C3 远端傀儡同时被 AI 驱动（ai/core.js 不查 netRole）→ 抖动+幽灵枪声+断线变 AI 僵尸
- C4 无插值（15Hz 橡皮筋）；C5 无心跳/超时/重连；C6 任意客户端可发 start、房间无上限、无鉴权
- C7 死代码：snapshot/relay 无发送端；房间码 7 位 vs UI 文案 4-8 位

## 情报黑板
- D1 玩家侧零情报 UI（迷雾模式像单人作战）；D2 intelBroadcast/queryAll 死代码；D3 黑板无目标去重

## 优化优先级
| P | 项 |
|---|---|
| P0-1 | AudioNode 泄漏修复（哨兵 onended 统一 disconnect） |
| P0-2 | LAN 事件同步（fire/damage/death/round 广播） |
| P0-3 | 远端傀儡退出 AI 驱动 |
| P0-4 | fogBlocked 复用 losBlocked 语义 |
| P1-1 | 敌方脚步声 + LAN 脚步事件 |
| P1-2 | 迷雾瓦片级 DDA + 视点合并 |
| P1-3 | 心跳/超时/重连 |
| P1-4 | 房间治理（上限/仅 host start） |
| P1-5 | 玩家侧情报 HUD（队友报点） |
| P2 | 位置插值 / throttle / HRTF / FPS 迷雾对齐 / 音频测试补强 |

## 拓展（摘选）
HRTF 环绕声（PannerNode 零成本替换）、WebRTC 语音+位置化、屏幕边缘声源方向指示（pan 数据已有）、CS 风格电台语音（合成/自动触发）、子弹飞行声、环境氛围（雨/雷/虫鸣+天气联动）、混响常驻湿路、大厅/房间码/观战/战绩、断线托管（正式化）、雷达迷雾单圈化、队友视野共享动画、AWP 开镜视野加成（560→800）。
