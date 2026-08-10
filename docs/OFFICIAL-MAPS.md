# 官方地图重建（2026-08-02）

## 目标

把 CS2 官方比赛图直接翻译进 CS2D 的高分辨率网格，替代原先三张空旷平面图。

## 地图映射

| CS2D | 官方雷达 | 结构原型 |
|---|---|---|
| dust2 | de_dust2 | 不对称双翼 + 中路控制 |
| canal | de_mirage | 密集房间群 + 多转角短枪线 |
| metro | de_inferno | 建筑分区 + 狭窄入口 + 站点纵深 |

## 实现

- 数据源：`assets/radars/de_*_radar_psd.png` 与官方 radar_info 出生点/点位坐标。
- 生成器：`scripts/import-official-maps.mjs`。
- 运行时数据：`src/official-maps.js`。
- 分辨率：dust2 保持 120 列，canal/metro 提升到 160 列以保留官方雷达的窄通道；三图均 `tile = 16`，地图按当前图瓦片换算像素，不再写死全局 40。
- 连通性：自动连接雷达粗采样丢失的小房间，并在生成后清理不可达格。
- 出生点：直接使用官方 radar_info 的 T/CT 出生区，不按时间差压缩或挪位。

## 上下层逻辑

- `^` 高台现在可寻路，不再只是死站位。
- `R` 新增坡道瓦片：可走、可寻路，实体高度按过渡层处理。
- 每张官方图自动放入 A/B/中路高台与坡道，并导出 `highPoints` 给 AI。

## 验收

- `node test/official-maps.mjs`：连通、出生、点位节奏、上下层全部 PASS。
- `npm test`：PASS。
- `npm run check`：PASS。
- `node test/cover-scan.mjs`：三图暴露点 0。


深度化与清理（2026-08-03）

可视化预览：`node scripts/build-map-preview.mjs` 会重新生成 `docs/map-preview.html`，直接打开可查看三图结构、高台、出生点、包点和关键指标。
官方雷达保真：canal/metro 在 160 列重建后与官方 radar 地板重合度约 78%，官方地板格覆盖率达到 99%+，细通道不再被 120 列采样丢掉。
- 区域开放：canal/metro 新增区域扩张，canal 开放率约 58%，metro 约 46%，更多房间和走廊互相打通。
dust2/metro 在 T 进攻路线加入少量可走高台，并在 CT 侧加入少量站点掩体；保留垂直层次，不再堆无意义物件。
canal 清理掉会卡人的额外高台/桶，只保留原始 A/B/中路高台与 T 进攻路线高台。
深度回归：`node test/map-depth.mjs` 检查垂直结构、站点掩体、长直线、连通与 `highPoints` 标签。

当前平衡样本

5v5 公平诊断（8 回合/局、10 局样本）：dust2 T 63%，canal T 63%，metro T 57%。
完整 16 局诊断仍可跑，但高分辨率地图下耗时较长；日常快速验收使用 `test/map-depth.mjs` 与上述样本。