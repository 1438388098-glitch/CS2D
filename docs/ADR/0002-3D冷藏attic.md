# ADR-0002：3D/第一人称渲染打入冷宫（attic/）

- 状态：已接受
- 日期：2026-09-09

## 背景

仓库历史上有 3D/第一人称渲染实验（render3d.js / render3d-gl.js / render3d-next.js + three.module.js），game/combat/hud/input 内残留 fps 分支。

## 决策

全部移入 `attic/` 冷存（含恢复指南 `attic/README.md`），切断 import 接线，游戏固定 2D 俯视。常驻指令（.autopilot/directives.json 与 CONTRIBUTING）：**禁止恢复、引用或新增 3D 相关改动**。

## 后果

- 2D 渲染管线（render.js 的分层合成/缓存策略）可以全力优化，不必维护双视角分支。
- `input.js` 的 `VIEW_MODES = ['top']`、`ui.js` 的 viewSel 守卫是有意为之，不要"修复"它们。
- 若未来重启 3D：按 attic/README 的恢复步骤走，并废除本 ADR（写新 ADR 说明理由）。
