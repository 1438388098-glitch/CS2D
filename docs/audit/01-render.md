# 01 · 2D 渲染管线调研

范围：src/render.js、render-utils.js、textures.js、fog.js、hud.js、render3d-gl.js、render3d.js（集成点）。

## 现状
- 分层绘制：静态层（预烘焙）/decalLayer（空）/动态层（水、站点、箱、C4、掉落、雷、实体、激光、烟、粒子、曳光、迷雾）
- 相机：camX/camY lerp 跟随 + clamp；zoom 0.75；震屏随机写入 _shx/_shy
- 迷雾：离屏 0.5x canvas，96 射线 × 560 半径 × step8，量化 16px + 120ms 节流
- 已有性能手段：静态层预烘焙、迷雾离屏+节流、3D 像素直写、zbuf 复用、精灵缓存、特殊格预索引、自适应降档（仅 3D）

## 性能问题（高→低）
- **H1 迷雾移动中几乎每帧重算**：量化 16px < 120ms 内位移 24px；每帧 ≤10 视点 × 96 射线 × 70 步 ≈ 6.7 万次 fogBlocked（render.js:451-454）
- **H2 粒子双遍全量遍历 + 逐粒子路径**：6 组分类 O(6N) + 第二遍，每帧 400+ beginPath/arc（render.js:370-420）
- **H3 烟雾每帧 createRadialGradient + 每帧随机噪点**（视觉闪烁 bug！）（render.js:336,352-357）
- M1 decalLayer 纯死图层（textures.js:333，全项目无写入）
- M2 实体绘制每帧 ~8 个 rgba 字符串/实体（render.js:225-329）
- M3 3D 墙渲染每帧 ~3800 对象分配 + 1920 次 atan（render3d.js:649,721,647）
- M4 WebGL 每帧 ~30 次 getAttribLocation/getUniformLocation
- M5 水面叠加每瓦片字符串状态（render.js:75-78）
- L1 render.js:24 渲染侧写 game.zoom 副作用；L2 2D/3D 震屏随机流不一致；L3 minimap 每帧 MAPS.find + shadowBlur；L4 纹理随机噪点用 Math.random 非确定性；L6 2D 无降档兜底

## 优化建议（含收益）
| # | 方案 | 收益 |
|---|---|---|
| O1 | 迷雾量化 32px + 250ms + 端点缓存 | 移动中省 1-3ms/帧 |
| O2 | 粒子 sprite 烘焙 + fillRect + 单遍 | 省 0.5-1.5ms |
| O3 | 烟预烘焙 256px 纹样 + 确定性噪点 | 省 0.2-0.8ms/烟 + 修闪烁 |
| O4 | 删 decalLayer | 少一次全图合成 + 内存 |
| O5 | 实体/水面颜色字体常量 hoist | 省 100-300 字符串解析 |
| O7 | 3D zbuf 对象池 + 视锥增量免 atan | 3D 主路径 5-15% |
| O8 | WebGL location 缓存 | 3D 帧 3-8% |
| O9 | minimap MAPS.find 缓存 / 去 shadowBlur | 0.1-0.4ms |
| O10 | 2D 降档接入 | 低端机保 60fps |

落地 O1-O3 后 2D 帧 CPU 预计减 30-50%。

## 拓展（摘选）
动态光影（复用雾 canvas）、粒子系统升级（对象池+sprite 表）、命中弹孔 decal（激活死图层）、缩放平滑过渡、相机抖动升级（衰减正弦）、水体动画烘焙、烟随风漂移、雷达视野锥、性能面板（__cs2d.stats 已有 3D 计时，补 2D 分项）。
