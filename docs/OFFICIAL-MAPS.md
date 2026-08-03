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
- 分辨率：每图 120 列网格，`tile = 16`，地图按当前图瓦片换算像素，不再写死全局 40。
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

## 已知问题

- `node test/balance.mjs` 当前仍显示 bot AI 模拟胜率偏离 40%-60%（dust2 偏 CT、canal/metro 偏 T）。原因是高密度官方图下 AI 的攻守行为还没有按新地图专门调参，属于后续 AI 专项，不是地图数据本身缺失。
