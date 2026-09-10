# attic — 打入冷宫的 3D / 第一人称渲染

2026-09-09 起，第一人称（FPS/3D）视图整体封存于此，游戏固定 2D 俯视。文件保留在 git 历史中，可随时恢复。

## 内容

| 文件 | 说明 |
|---|---|
| `render3d.js` | legacy 第一人称渲染（Canvas 光线投射），含 `fpsCameraEntity`、投影数学 |
| `render3d-gl.js` | 第一人称 WebGL 后端（GPU 光栅化），由 render3d.js 引用 |
| `render3d-next.js` | Three.js WebGL 后端（自适应降档、GPU 不可用回退 legacy） |
| `vendor/three.module.js` | Three.js 1.27MB（render3d-next 动态 import） |
| `test/render3d-smoke.mjs` `test/render3d-next.mjs` `test/render3d-proj.mjs` `test/fps-aim-3d.mjs` `test/cdp-render3d-three.mjs` | 3D 渲染的回归/冒烟/诊断测试 |

## 同时被切断的接线（恢复时需重做）

1. `src/main.js`：`./render3d.js`、`./render3d-next.js` 两条 import；`reloadMapLayers()` 里的 `initRenderer3d / disposeRenderer3dNext / initRenderer3dNext`；主循环的 fps 渲染分支（next→legacy 回退 + 暗色 3D 底）；`window.__cs2d.render3d.backend` 调试句柄；`backendLockLegacyUntil / BACKEND_LOCK_MS`。
2. `src/input.js`：`VIEW_MODES` 收敛为 `['top']`（V 键循环与 localStorage 白名单随之失效）。
3. `src/ui.js`：启动时从 `cs2d_viewmode` 恢复 fps 的直改块已删（绕过 VIEW_MODES 守卫的入口）。
4. `index.html`：设置面板"第一人称"按钮已删。

游戏逻辑侧（`game.js`/`combat.js`/`hud.js`/`input.js` 的 `viewMode === 'fps'` 分支、pointer lock、`fps-laser.js`）**保留未动**，处于不可达休眠态，供恢复时直接复用。

## 恢复步骤

```bash
git mv attic/render3d.js attic/render3d-gl.js attic/render3d-next.js src/
git mv attic/vendor ../vendor   # 或就地改 render3d-next.js 的 import 路径
git mv attic/test/*.mjs test/
```

再按上面"被切断的接线"逐条加回（参考引入冷宫的 commit 的反向 diff 最快）。
