# 03 · 地图系统调研

范围：src/map.js、map-gen.js、map-editor.js、official-maps.js、duel-maps.js、4th-map-candidates.js。

## 现状
- 瓦片字符表：`.#CD=^R~≈oabtc`（墙/箱/可破坏箱/薄墙/高台/屋顶/浅深水/油桶/站点/出生）
- loadMap 管线：grid → scanTiles → 连通性校验 → growSiteBounds(BFS) → buildHolds(锚点) → aStar 瀑布（entries/holds/clearPoints/lanes，每图 ~120 次 aStar）
- 碰撞 collideCircle 只遍历 ≤4 瓦片（无性能风险）；LOS 与子弹统一 6px 步长保证对称
- aStar 双层 FIFO 缓存（PATH/FAIL 256/128），炸箱全清 invalidatePathCache
- 编辑器：5 工具 + 60 步 undo + 导入/导出/校验/试玩
- 生成器三套并存：map-gen（手写低清）/ duel-maps / 4th-map-candidates（程序化，函数几乎逐行重复）

## 问题
- P1 growSiteBounds 用 q.shift()（O(n²)），大图/编辑器校验可卡数百 ms
- P2 los 每帧对同 (viewer,target) 对重复投射（10v10 ~100+ 次/帧）
- P3 passableTolerant 热路径重复 tileSize()/floor
- P4 aStar 失败即遍历 FAIL_CACHE 全键；iter 打满 5 万才判失败
- P5 编辑器每鼠标移动全格重绘 25600 fillRect
- P6 开局重算 ~120 次 aStar，foundry 级大图 100-400ms
- 缓存粒度粗：一个油桶炸了全清；clearPoints/lanes 等战术数据永不重算（与地形脱节）
- 死代码：map.js:550 pathable 永不触发（与 walkable 实现相同）；map.js:315 metro 分支不可达
- MAP.rows 与 grid 双份，炸桶后不一致
- foundry/duel/custom 无专属 MAP_LAYOUT（dust2 尺度标定）；fallbackSpawn 方向硬编码（foundry T 在南会被兜底为顶部）
- buildLanes 仅 T 侧起算，CT 主动性被系统性削弱
- 'R' 屋顶 2D 渲染缺失（textures.js 无 R 分支）
- 编辑器缺：图层/选区复制/画布缩放/多地图/载入官图/highPoints 编辑（恒空数组）/实时校验

## 优化建议（选）
1. growSiteBounds 去 shift（O(n²)→O(n)）
2. 寻路缓存加 mapId 维度跨局复用；炸箱只失效受影响瓦片邻域（瓦片版本化 key）
3. los 帧内结果缓存（game._losCache 帧首清空，省 60-70%）
4. 删死代码 + rows 只留 grid
5. 生成器三文件合一（noise/blob/lane/cover 参数化，删 ~150 行重复）
6. 编辑器增强批（缩放/选区/官图载入/highPoints/增量 undo）

## 拓展（摘选）
可破坏墙（'W' 瓦片 hp + fireRay 分支 + AI repath 兜底已有）、动态地图（门/电梯）、多层楼、昼夜/天气/水位、编辑器导出共享、参数化随机生成（布局策略与几何分离）、新地图类型（巷战/仓库/雪地）、CT 反清 lanes。
