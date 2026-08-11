# 2D 软影烘焙与地面脚印移除设计

日期：2026-08-11
状态：已批准并实现

## 目标

1. 修复顶视 2D 掩体阴影“边界太硬、像贴块”的问题。
2. 移除地面脚印渲染，保留角色脚下摆动/尘埃动画和全部 AI 决策。

## 现状

- `src/shadow-fx.js` 的 `drawShadows` 对每块掩体只绘制一个线性渐变四边形，阴影边缘和末端因此有明显硬边。
- `src/footprint-fx.js` 是独立的地面脚印渲染路径，只影响画面，不影响 AI。
- 2D WebGL 后端只负责把静态地图、贴花、阴影层、实体、雾层合成，没有自定义光照 shader。

## 方案：软影烘焙

保持现有静态 `shadowLayer` 架构，不进入每帧光照计算：

- `drawShadows` 改为每块阴影绘制“核心影 + 两层羽化影”。
- `softenShadowLayer` 在阴影层重建时对整层做一次低强度模糊，抹掉瓦片接缝和投影末端硬边。
- 不支持 Canvas `filter` 的环境自动回退到多层羽化，不改变视觉下限。
- WebGL 继续上传同一张烘焙好的阴影纹理，不改 shader。

## 地面脚印移除范围

- 删除 `src/footprint-fx.js` 与 `test/fx-footprint.mjs`。
- 删除 `render.js` 中脚印路径采样状态、导入和绘制调用。
- 保留 `anim-fx.js` 的脚下摆动与尘埃，保留 AI 决策、寻路和移动逻辑。

## 验证

- `node test/fx-shadow.mjs`
- `node test/fx-anim.mjs`
- `node test/shadow-rev.mjs`
- `node test/cdp-shadow-rev.mjs`
- `npm run check`
- `npm test`

## 非目标

- 不改 3D/FPS 视口。
- 不做动态实时阴影、点光源或高级 WebGL 光照。
- 不调整 AI 决策间隔、平滑或移动逻辑。
