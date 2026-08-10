# CS2D 排位赛 设计文档

> 日期: 2026-08-03 · 状态: 已实现
> 模式 id: `ranked` · 二级 UI: `rankedPanel`

## 1. 概述

排位赛是独立的单排天梯玩法：玩家先打 5 场定级赛确定初始 MMR，之后通过 MR9 对战持续调整 MMR，按 MMR 划分 7 个大段位与 4 个小段。对手由真实 CS2 战队信息生成，比赛可亲自打或模拟。

## 2. 数据模型

存档位于 localStorage `cs2d_ranked`(version 1)。

```js
{
  version: 1,
  player: {
    name: '玩家',
    mmr: 0,                       // 0 表示未定级
    placement: { left: 5, wins: 0, kills: 0, deaths: 0 },
    stats: { played: 0, w: 0, l: 0, kills: 0, deaths: 0, mvp: 0, streak: 0, bestStreak: 0 },
    history: [ { t, oppName, oppMmr, mapId, score, win, delta, kills, deaths, mvp, placement } x 20 ],
    next: { oppName, oppTag, oppMmr, mapId, settled: false }
  }
}
```

## 3. 段位与 MMR

| 段位 | MMR 区间 |
|---|---|
| 青铜 | 0-999 |
| 白银 | 1000-1199 |
| 黄金 | 1200-1399 |
| 铂金 | 1400-1599 |
| 钻石 | 1600-1799 |
| 大师 | 1800-1999 |
| 宗师 | 2000+ |

- 每个大段内按 MMR 均分 1-4 小段。
- 定级完成后初始 MMR = `1000 + 定级胜场×80 + 定级总击杀×4 - 定级总死亡×2`，范围 800-1600。
- 常规赛 MMR 变化：`delta = 32 × (胜负 - 期望胜率) + MVP奖励3`，单场上下限 ±40，MMR 范围 400-2500。
- 期望胜率使用 Elo 公式：`1 / (1 + 10^((对手MMR - 玩家MMR)/400))`。

## 4. 全流程

1. 主菜单选择「排位赛」→ 开始按钮打开 `rankedPanel`。
2. 排位大厅显示段位/MMR、定级进度或战绩、下一场对手、地图、历史与段位天梯。
3. 点击「开始排位」进入 MR9 比赛，或「模拟本场」直接结算。
4. 比赛结束点击「返回排位」结算 MMR：
   - 定级赛阶段：消耗剩余定级次数，记录胜负/击杀/死亡；打满 5 场后完成定级。
   - 常规阶段：按对手 MMR 计算 MMR 增减。
5. 结算后写历史、更新连胜/胜率、清空 pending、保存并重开排位大厅。
6. 支持一键重置排位数据。

## 5. 比赛整合

- 复用经典爆破引擎与 MR9 全局赛制。
- 玩家固定 T 方，4 名 AI 队友；对手使用真实 CS2 战队名与选手名。
- 双方 `aiParams` 由 MMR 映射为 rating 后经 `teamDiffParams` 生成。
- 地图从 `[dust2, canal, metro]` 随机。

## 6. 二级 UI(rankedPanel)

- 顶部：排位赛 / MMR / 段位 / 重置 / 返回主菜单。
- 档案卡：段位、MMR、定级剩余场次或胜率/连胜/场次。
- 天梯条：7 段位进度可视化。
- 下一场卡：对手、评级、地图、开始/模拟按钮。
- 历史卡：最近 20 场胜负、对手、地图、比分、MMR 变化。
- 扁平设计语言，与新版主菜单一致。

## 7. 文件与改动点

| 文件 | 改动 |
|---|---|
| `src/ranked.js`(新增) | 纯逻辑：状态/定级/MMR/对手/结算/存档 |
| `src/ranked-ui.js`(新增) | 排位大厅渲染与事件 |
| `index.html` | 模式卡「排位赛」+ `rankedPanel` |
| `styles.css` | ranked 面板扁平样式 |
| `src/ui.js` | 菜单/隐藏面板/结束按钮接线 |
| `src/main.js` | 引入 ranked-ui |
| `test/ranked.mjs`(新增) | 定级/MMR/存档/真人比赛/UI 渲染测试 |

## 8. 测试

1. 建档与定级：5 场定级后 MMR > 0，定级场次归零。
2. 常规 MMR：胜负与 MVP 影响 MMR，历史最多 20 条。
3. 存档往返：save → load 一致；损坏 JSON 备份并重建。
4. 真人比赛：`startMatch` → 比赛实体/状态正确 → `rankedEndMatch` 结算。
5. UI 冒烟：rankedPanel 可渲染排位大厅。

全量回归：`npm run check` + `npm test`。