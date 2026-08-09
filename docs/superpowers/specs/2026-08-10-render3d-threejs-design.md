# 3D 视角 Three.js 低多边形比赛环境重构设计

## 背景与目标

当前 `src/render3d.js` 是光线投射 + Canvas 像素直写/WebGL 列渲染的混合实现。它提供了可玩的 FPS 体验，但墙面视觉上接近“纸片”，地面细节粗糙，鼠标俯仰、相机高度、平台高度和视图摆动混在一起，导致用户反复反馈 3D 模式“白茫茫、粗糙、操控别扭”。

本次目标不是继续修补现有渲染器，而是把 FPS 视角切换为 Three.js 驱动的低多边形 3D 比赛环境：

- 真实几何：墙、地面、高台、水面、箱子、油桶都有厚度和体积。
- 稳定视角：取消 3D 模式下的鼠标垂直俯仰控制，取消走路上下抖动；相机高度只跟随角色所在地面/高台。
- 实体可见：玩家、队友、敌人、掉落物、炸弹、烟雾、弹痕以 3D 模型或 3D 公告牌呈现。
- 渲染质量：方向光 + 阴影 + 边缘 AO + 接触阴影，消除大面积过亮/过白画面。
- 保持玩法：地图数据、碰撞、AI、射击判定、音效、HUD 仍以现有 2D 游戏逻辑为准。

本方案是“低多边形比赛环境”，不是照片级写实。后续可在同一渲染器上继续替换为更精细的 GLTF 模型、PBR 材质和环境资产。

## 架构

新增独立模块 `src/render3d-next.js`，不修改现有 `src/render3d.js` 的渲染算法。现有渲染器保留为降级路径。

```
main.js
  └─ render3d(game)              # 旧渲染器，仅降级时调用
  └─ render3dNext(game)          # 新 Three.js 渲染器，默认调用
       ├─ src/render3d-next.js   # Three.js 场景、材质、实体同步
       ├─ src/textures.js        # 高清 canvas 纹理生成
       ├─ src/map.js             # 地图瓦片数据
       └─ vendor/three.module.js # 本地化 Three.js 运行时
```

`main.js` 的循环保持现状：`game.viewMode === 'fps'` 时调用 3D 渲染器。新渲染器初始化失败、Three.js 加载失败或显式设置 `game._render3dBackend = 'legacy'` 时回退到旧渲染器。

## 运行时依赖

引入 Three.js 作为本地前端运行时：

- 使用 `npm install three` 声明依赖。
- 将 `node_modules/three/build/three.module.js` 复制到 `vendor/three.module.js`。
- 浏览器侧 `import * as THREE from '../vendor/three.module.js'`。
- 不通过 CDN 加载，不开放 `/node_modules` 静态目录，不改变服务器安全基线。

## 地图建模

地图静态场景在加载地图时构建一次，不逐帧重建。

坐标系约定：

- 世界 X/Y 对应现有地图像素坐标。
- 世界 Z 向上，`z=0` 为普通地面。
- `1` 个地图瓦片 = 1 个 Three.js 世界单位。
- 官方图 `tile=16`，生成的墙体/地面几何按瓦片尺寸缩放，保证旧碰撞与视觉一致。

静态几何生成规则：

| 瓦片 | 几何 | 材质/细节 |
|---|---|---|
| `.`/`a`/`b`/`t`/`c` | 地面平面，按材质分块合并 | 高清地面纹理，重复采样，站点区域叠加站点标记 |
| `#` | 从地面到墙顶的 Box | 墙纹理 + 顶部/底部边缘 AO，相邻墙合并减少面数 |
| `=` | 0.55 格高薄墙 Box | 木纹/薄墙纹理，边框线 |
| `C` | 0.55 格高箱子 Box | 木箱纹理，顶部高光与底部阴影 |
| `o` | 圆柱/近似油桶模型 | 油桶材质，爆炸后可隐藏 |
| `^` | 高台平面 + 侧壁 | 平台纹理，顶部高光，侧面渐变阴影 |
| `R` | 0.5 格高坡道/平台 | 坡道几何，按地图语义近似 |
| `~` | 水面平面 + 动态波纹 Shader | 半透明水面，浅水 |
| `≈` | 深水平面 | 深色半透明水面 |

纹理策略：

- `initTextures()` 继续生成顶层 `floorTex`、`wallTex`、`wallVariants`。
- 新增 `makeRenderTextures(map)`，在 512x512 尺寸上重新绘制墙/地面细节：裂纹、砖缝、污渍、边缘高光、确定性噪点。
- WebGL 使用 `LinearFilter` + `RepeatWrapping`；地图静态几何的 UV 按世界坐标设置，避免整面墙只采样一个像素。

## 场景与光照

场景结构：

```text
scene
  ├─ mapGroup          # 静态地图几何，预合并
  ├─ dynamicGroup      # 实体、掉落物、炸弹、粒子
  ├─ viewmodelGroup    # 第一人称武器
  └─ skyboxGroup       # 程序天空盒
```

光照：

- `AmbientLight` 提供基础亮度。
- `DirectionalLight` 模拟太阳，开启 `shadow.mapSize`，覆盖主要地图区域。
- 对墙体底部和物体接触面加简单 AO 纹理/顶点色，不依赖昂贵的后处理。
- 雾色与现有 `theme.atmo.fogColor` 同步，避免天空/远景和旧 2D 地图不一致。

天空盒：

- 使用 `THREE.BoxGeometry` + 程序生成渐变贴图，或 `THREE.Mesh` 球体 + 背景色。
- 太阳方向与主光一致。
- 避免当前旧渲染器“天空/烟雾导致大面积白色”的问题。

## 实体与动态对象

实体使用 `THREE.Group` 池化，避免每帧创建/销毁对象。

角色模型：

- 胶囊或 Box 组合：躯干、头、四肢、武器握持位。
- 队伍颜色：CT 蓝色，T 黄色/红色，玩家高亮。
- 走路时简单四肢摆动，不开枪时保持稳定。
- 死亡角色切换为躺倒/公告牌，按生命值淡出。

动态对象：

- 掉落武器：按武器种类生成小 3D 模型。
- 炸弹：C4 造型 Box + 红色脉冲环。
- 手雷：球体/圆筒 + 拉环，投掷后按 3D 弹道显示。
- 烟雾：半透明粒子/球体公告牌，颜色加深，避免白色糊屏。
- 弹孔/火花：3D 公告牌，生命期内淡出。
- 天气粒子：`THREE.Points` 或池化公告牌，数量按性能上限裁剪。

## 第一人称武器

`viewmodelGroup` 挂到相机上，由程序化低多边形模型组成：

- 手枪/步枪/狙击枪/刀分别使用不同几何组合。
- 开火后坐、换弹、切枪、瞄准镜按现有 `recoil/reloadT/scopeT` 状态驱动。
- 狙击开镜用镜头内场景代替全屏遮罩；镜内仍使用同一 Three.js 场景。

## 视角与控制

最终目标视角：

- 水平方向：`yaw` 由鼠标水平移动驱动，使用现有 pointer lock 增量。
- 垂直方向：不通过鼠标修改 `pitch`；`pitch` 固定为 `0`。
- 相机高度：普通地面为 `0.5 * tile`，高台/坡道按 `groundElevationAt()` 抬升；不做走路 bob、不做蹲下瞬间高度跳变。
- 死亡观战：相机跟随目标位置，仍只水平旋转，不上下俯仰。

对应代码改动：

- `src/game.js`：新增 `fpsVerticalLock` 默认 `true`，`updatePlayerAim()` 在 FPS 模式下忽略 `_mlookDy`，并强制 `pitch=0`。
- `src/input.js`：不再累积/消费 `_mlookDy` 用于 FPS 视角。
- `src/render3d-next.js`：相机 `rotation.x=0`，仅更新 `rotation.y` 和位置。

## 主循环与切换

`main.js` 修改为：

```js
if (game.viewMode === 'fps' && fpsCameraEntity(game)) {
  if (game._render3dBackend !== 'legacy' && render3dNextReady()) {
    render3dNext(game);
  } else {
    render3d(game);
  }
}
```

`reloadMapLayers()` 同时初始化新旧渲染器：

- 旧渲染器继续可用，保证地图切换、编辑器试玩、LAN/观战模式不回归。
- 新渲染器首次 WebGL 上下文失败时记录 `game._render3dError` 并自动回退。

## 性能与稳定性

- 静态地图合并为少量 `BufferGeometry`，减少 draw call。
- 动态实体按距离 LOD：近距离完整模型，远距离公告牌/简化模型。
- 自适应 `_renderScale` 继续作用于 Three.js `renderer.setPixelRatio()` 或内部渲染尺寸。
- 粒子、烟雾、弹孔、公告牌使用对象池，设置上限。
- 地图切换时释放旧场景纹理与几何，避免内存累积。
- 每帧统计写入 `game._renderStats`，继续给现有自适应帧率逻辑使用。

## 错误处理

- Three.js 模块加载失败：不阻塞启动，回退旧渲染器，并在 `window.__cs2d.stats.render3dBackend` 暴露状态。
- WebGL 上下文不可用：回退旧渲染器。
- 地图数据异常/编辑地图缺字段：跳过异常瓦片，保留已生成部分。
- 渲染循环异常：捕获到 `console.error`，下一帧继续尝试，不让游戏白屏。

## 测试与验证

新增/修改测试：

1. `test/render3d-next.mjs`：Node 侧纯函数测试，验证地图瓦片到 Three.js 几何分类、实体高度/相机高度、纹理尺寸。
2. `test/cdp-render3d-three.mjs`：浏览器级测试，启动本地服务器，进入 FPS 模式，验证：
   - 3D 画布非空白。
   - 墙/地面有明显几何细节，不是纯色。
   - 队友/敌人可见，队伍颜色像素存在。
   - 开关地图不崩溃。
   - `pitch` 固定为 0，鼠标 `movementY` 不改变视角。
3. 现有 `npm run check`、`npm test` 必须继续通过。

浏览器测试中尽量使用确定性状态：固定地图、固定种子、固定实体位置，避免随机失败。

## 交付范围

第一批交付：

- Three.js 本地运行时接入。
- 地图静态几何生成。
- 基础光照/阴影/天空。
- 角色/掉落物/炸弹/烟雾/天气 3D 化。
- 第一人称武器模型。
- 视角垂直锁定。
- 新渲染器浏览器测试。
- 旧渲染器降级路径。

不在第一批范围：

- 外部 GLTF/FBX 角色模型。
- 完整 PBR 材质/后处理管线。
- 动态光影、体积雾、水面反射。
- 修改现有 2D 游戏逻辑、AI、平衡。
