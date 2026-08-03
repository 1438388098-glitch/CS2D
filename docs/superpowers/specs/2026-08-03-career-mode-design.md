# CS2D 生涯模式 设计文档

> 日期: 2026-08-03 · 状态: 待评审
> 模式 id: `career` · 二级 UI: `careerPanel`

---

## 1. 概述

生涯模式是个人+战队结合的长线玩法:玩家既是一名可成长的选手,也是一支战队的经理。在比赛中亲自上阵打 5v5 爆破回合(复用现有引擎),在比赛外用二级 UI「生涯总部」管理训练、阵容、联赛与杯赛。

| 维度 | 决策 |
|---|---|
| 核心循环 | 个人+战队结合:亲自打比赛 + 场外管理 |
| 长期结构 | 联赛+杯赛双轨:8 队双循环 14 轮 → 8 队单败杯赛 |
| 成长 | 经验+训练课:4 项属性,打比赛得经验,花钱上训练课 |
| 战队管理 | 精简:4 名 AI 队友,每赛季转会窗可换人(转会费上限) |
| 比赛 | 复用经典爆破引擎,MR13,与 Major 一致 |
| 二级 UI | 单一全屏遮罩 + 顶部 Tab 导航,6 个页面 + 赛季结算页 |

## 2. 数据模型

存档位于 localStorage `cs2d_career`(version 1)。每次比赛结算/训练/转会/赛季推进后 `save()`。

```js
{
  version: 1,
  player: {
    name: '猎鹰',
    level: 1, xp: 0,          // 等级=经验里程碑,仅决定称号
    attrs: { aim: 50, move: 50, react: 50, nade: 40 },  // 0-100
    seasonStats: { played: 0, w: 0, d: 0, l: 0, kills: 0, deaths: 0, mvp: 0 }
  },
  team: {
    name: '猎鹰战队',
    league: '乙级',           // '甲级' | '乙级' | '丙级'
    bank: 12000,
    roster: [ { id, name, role, rating, price } x 4 ],  // AI 队友
    trainingLeft: 2,          // 每次比赛结算后重置为 2
    transfersLeft: 2,         // 每赛季转会次数
    transferWindow: false     // 第 5-8 轮为转会窗
  },
  season: {
    id: 1,
    round: 1,                 // 1..14
    totalRounds: 14,
    teams: [ { id, name, tag, rating, homeMap } x 8 ],   // 含玩家队
    fixtures: [ { round, home, away, score, played } x 56 ], // 8 队双循环
    standings: [ { teamId, played, w, d, l, pts } x 8 ],
    cup: { phase: 'idle'|'active'|'finished',
           bracket: [ { a, b, score, played } x 7 ] }      // QF4 + SF2 + F1
  },
  history: [ { seasonId, league, rank, cupRound, prize } ],
  news: [ { t, s: 'win'|'lose'|'info' } x 20 ]            // 事件流,最多 20 条
}
```

## 3. 联赛与赛程

- 每个级别 8 队(甲级/乙级/丙级),双循环 14 轮(主客各 7 场),每轮 4 场。
- 玩家所在队的比赛由玩家亲自打;同轮其余 3 场按双方 rating 模拟。
- 积分:胜 3 / 平 1 / 负 0。加时不计平局,经典 MR 赛制本身无平局 → **联赛无平局**,`d` 恒为 0,保留字段仅为格式统一。
- 升降级:甲级(顶级)第 7-8 名降乙;乙级第 1-2 名升甲、第 7-8 名降丙;丙级第 1-2 名升乙。
- 排名奖金(赛季末):1st 30000 / 2nd 20000 / 3rd 15000 / 4-6 8000 / 7-8 4000。
- 杯赛:8 队单败淘汰,QF → SF → F,共 7 场,第 14 轮结束后自动进入。玩家所在队场次由玩家亲自打,其余场次模拟。每轮晋级奖 5000,冠军奖 30000。
- 模拟比分公式复用 `simScore` 思路(Major 已验证):`p = clamp(0.5 + diff*0.004, 0.22, 0.86)`,胜者取 MR13 比分(13-x 形式),带入联赛与杯赛 AI 场次。
- 地图:每队绑定一张 `homeMap`(从 5 张官方图分配),该队主场时使用;杯赛轮次按 `[dust2, canal, metro, snow, depot]` 轮转。

## 4. 比赛整合(复用引擎)

完全镜像 `startMajorPlay` 的初始化方式(modes.js:353):

1. 生涯总部点「开赛」→ 记录 `game.careerMatch = { oppId, venue: 'home'|'away', isCup, settled: false }`,关闭面板,调 `startMatch(game)`。
2. `careerStart(game)`(registerMode 注册,无 update 钩子 → 比赛期间走经典回合逻辑):
   - `mapId` = 主队 homeMap;`team` = home→'t',away→'ct';`bots = 4`。
   - `diffParams = teamDiffParams(oppTeam)`(从 modes.js 导出复用)。
   - `setupMatchEntities(game)` + `startRound(game)`。
   - 实体修正:同队 bot 重命名为 roster 名字,`aiParams` 由我方队伍平均 rating 经 `teamDiffParams` 映射;敌方 bot `aiParams` 用对手 rating。我方略弱(平均 65-70 vs 对手 70-85)。
3. 玩家属性应用(`attrsApplied` 每场开赛置为 true):
   - aim → `p.spreadMult = 1.3 - aim/250`(50→1.1,100→0.9)
   - move → `p.speedMult = 0.9 + move/250`(50→1.1,100→1.3)
   - react → 换弹/切枪速度 +10%/档、准星恢复加快
   - nade → 手雷伤害 `1 + nade/300`
4. 赛制:经典 MR13(`ROUND.MATCH_WIN=13`,12 回合后换边),零改动。
5. 赛后结算 `careerEndMatch(game)`(点击结束面板「返回生涯总部」按钮触发,`settled` 防重复):
   - 奖金:胜 +1500 / 负 +300(无平局);MVP +200;杯赛另加晋级奖。
   - 经验:胜 300 / 负 50 + 击杀×10 + MVP×100。
   - MVP 判定:玩家击杀 ≥ 5 且为队内最高;计入 `seasonStats.mvp`。
   - 更新积分榜、round 推进、`trainingLeft` 重置为 2、写 news、`save()`、重新打开生涯总部。
   - 第 14 轮结束 → 进入杯赛;杯赛打完 → 赛季结算页。

## 5. 训练课

- 三档:基础 500 → +2 属性;进阶 1200 → +6;精英 2500 → +15(档位越高单位性价比越高,鼓励攒钱上精英课)。
- 选择 属性×档位 扣款并立即加点;`trainingLeft` 减 1,每场比赛结算后重置为 2。
- 经验阈值(等级称号):`xpNeeded(lv) = lv*500`,称号:新兵→列兵→下士→中士→上尉→少校→上校→准将→少将→中将→上将→传奇。

## 6. 阵容与转会

- 初始 4 名队友:名字从 BOT_NAMES 池取,rating 60-75,`price = rating*300`。
- 转会窗:每赛季第 5-8 轮开启,`transfersLeft = 2`。
- 选手池:每赛季重置生成 8 名候选(rating 55-85,`price = min(rating*300, 20000)`,硬上限 20000)。
- 操作:卖出队友返还 50% 价格;买入候选扣款并替换对应位置;`bank` 不足不可买。
- 完成交易写 news 并 `save()`。

## 7. 二级 UI(careerPanel)

- `.ov` 全屏遮罩;顶部信息栏:模式名 / 赛季·轮次·联赛 / 资金 / 「← 主菜单」。
- Tab 导航 6 页 + 赛季结算页(非 Tab,赛季末自动弹出):
  1. **仪表盘**:玩家档案(称号/等级/4 属性条/本赛季数据)+ 下一场(对手/地图/主场/「开赛」)+ 事件流 + 积分榜速览。
  2. **赛程**:14 轮对阵表,已赛显示比分,未赛显示对手与「开赛」;杯赛按钮。
  3. **训练**:4 属性 × 3 档训练课,显示花费/本轮剩余次数。
  4. **阵容**:玩家 + 4 队友卡片(评级/身价);转会窗内显示选手池与买入/卖出按钮,非窗口期显示「转会窗第 X 轮开放」。
  5. **排名**:完整积分榜 + 升降级规则说明。
  6. **杯赛**:淘汰赛对阵树 + 晋级/冠军奖金。
  7. **赛季结算**(自动):升降级结果、排名奖金、杯赛成绩、本赛季数据、历史记录,「下一赛季」按钮 → 重置赛季数据(保留属性/资金/升降级后的队伍),history 追加。
- 结束面板:`showMatchEnd` 中 `mode === 'career'` 时显示「返回生涯总部」按钮(复用 majorNextBtn 的显隐模式),点击触发 `careerEndMatch`。
- 挂载:`ui.js` 的 `hideModePanels` 加入 `careerPanel`;`renderModeSettings` 加 career 分支(显示入口提示);`bindModeMenu` 无需改动(模式卡片通用)。

## 8. 存档与容错

- `save()`:序列化存档到 `cs2d_career`;每次结算/训练/转会/赛季推进调用。
- 载入失败或 version 不匹配 → 备份旧档至 `cs2d_career_backup`,重新建档。
- 无 localStorage(隐私模式)→ 内存运行 + toast 提示「生涯进度不会保存」。
- 首次进入(无档)→ 按初始值建档:统一乙级开局,初始资金 12000。

## 9. 文件结构与改动点

| 文件 | 改动 |
|---|---|
| `src/career.js`(新增) | 纯逻辑:状态模型/赛季模拟/训练/转会/结算/存档;不 import DOM,可无头测试 |
| `src/career-ui.js`(新增) | 二级 UI 渲染与事件绑定,调用 career.js API |
| `index.html` | 模式卡片「生涯」+ `careerPanel` 遮罩结构 |
| `styles.css` | career 面板样式(沿用 major 面板视觉变量) |
| `src/ui.js` | `renderModeSettings` 加 career 分支;`hideModePanels` 加入 careerPanel;结束面板加「返回生涯总部」按钮逻辑 |
| `src/modes.js` | 导出 `teamDiffParams`(生涯复用) |
| `src/main.js` | 引入 career-ui 初始化 |
| `test/career.mjs`(新增) | 单测 |

## 10. 测试

`test/career.mjs`(headless,参照 test/modes.js 的 stub 模式):
1. 建档:初始资金/属性/4 队友/14 轮赛程/8 队积分榜。
2. 赛季模拟:推进 14 轮,所有场次产生比分,积分与场次数自洽。
3. 结算:胜负/经验/奖金/KD 统计正确;`settled` 防重复。
4. 训练:扣费、加点、次数限制与重置。
5. 转会:买入/卖出资金流、次数限制、非窗口期禁用。
6. 升降级:末位判定正确;赛季重置后联赛更新、属性保留。
7. 存档往返:save → load 一致性;损坏 JSON 触发重建。

全量回归:`npm run check` + `npm test`。

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 我方 bot 过强/过弱 | 我方平均 rating 65-70 用 teamDiffParams 映射,与 Major 同源,可调 |
| MR13 比赛偏长 | 与 Major 保持一致,不单独做短赛制 |
| 联赛模拟失衡 | 复用 Major 已验证的 simScore 公式 |
| 赛季结算遗漏 | 结算入口单一(careerEndMatch + settled 防重),所有路径统一 |
