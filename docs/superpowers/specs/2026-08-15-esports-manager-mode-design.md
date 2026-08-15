# CS2D 电竞经理模式 设计文档

> 日期: 2026-08-15 · 状态: 草稿待评审
> 模式 id: `manager` · 二级 UI: `managerPanel`

---

## 1. 概述

电竞经理模式是纯管理视角的长线玩法：玩家扮演一支 CS2 战队的**经理**（不是选手），管理 5 人整队的阵容、转会、训练、战术风格、设施与财务。比赛全程由两队 AI 实机 5v5 对战，玩家以观战视角观看（复用赛博斗蛐蛐引擎 + 倍速/跳过），像看一场真比赛。

| 维度 | 决策 |
|---|---|
| 核心循环 | 管理决策 → 实机观战验证 → 数据/事件叙事回报 |
| 长期结构 | 8 队双循环 14 轮联赛 → 8 队单败杯赛 → 多赛季升降级（甲/乙/丙） |
| 比赛 | AI 实机 5v5，观战 + 1x/2x/4x/8x 倍速 + 跳回合；仅玩家场次实机，其余模拟 |
| 选手体系 | 5 人整队归玩家所有；4 维属性（aim/movement/clutch/nade）+ 潜力 + 性格 |
| 战队管理 | 转会/合同/训练/设施/赞助/票房/老板压力 |
| 二级 UI | 单一全屏遮罩 + 顶部 Tab 导航，9 个页面 + 赛季结算页 |

### 六个核心机制（本次 MVP 全部包含）

1. **老板压力 + 赛季目标**：董事会给出赛季目标（保级/进季后赛/争冠），达成加信任与预算，连续失败 → 被解雇/降薪。
2. **战队体检红绿灯**：总览页以红黄绿三色直观显示资金健康、士气、疲劳、阵容缺口、更衣室矛盾。
3. **选手状态参与实机比赛**：选手疲劳/士气/近期状态真实映射到 bot 的 aiParams，玩家的轮换与补强决策在实机画面上肉眼可见。
4. **转会窗事件流**：转会期随机推送对手报价、选手闹转会、流言、经纪人施压等事件；事件由隐藏指标（选手满意度、队内矛盾）积累触发，可预判可预防。
5. **球探噪声 + 潜力模糊**：候选选手潜力以星级/区间显示而非精确数字，球探设施等级决定噪声大小，转会变成信息不对等的博弈。
6. **战队羁绊/化学反应**：同队选手同场触发羁绊加成；选手间有相性（合得来/合不来）影响配合。

### 明确不做（二期）
- 版本补丁因子（每赛季随机版本影响打法）— 二期
- 功勋选手传承线（老将退役转教练）— 二期
- BP 英雄池博弈 — 不做（CS2D 是 FPS 非 MOBA，强行移植变扭）
- 抽卡/付费循环 — 不做（单机游戏）

---

## 2. 数据模型

存档位于 localStorage `cs2d_manager`（version 1）。每次结算/训练/转会/赛季推进后 `save()`。损坏或版本不匹配时备份到 `cs2d_manager_backup` 并重建。

```js
{
  version: 1,
  manager: {
    name: '玩家经理',
    reputation: 50,          // 0-100，影响候选池质量与老板容忍度
    skill: { biz: 40, scout: 40, coach: 40, negotiate: 40 },  // 经理四维，影响结算/球探/训练/谈判
    seasonStats: { played: 0, w: 0, l: 0, prizeEarned: 0 }
  },
  team: {
    name: 'Team Spirit',
    league: '乙级',
    bank: 12000,
    roster: [ 5 名选手 ],     // { id, name, role, rating, potential, attrs:9维能力,
                              //   price, contractYears, renewalCost, age, personality,
                              //   morale, fatigue, stress, chemistry, form, stats }
    coach: { name, level, focus },   // 教练，影响训练效率
    facilities: { academy:0, medical:0, scouting:0, analytics:0 },
    trainingLeft: 2, transfersLeft: 2, transferWindow: false,
    pool: null,              // 转会候选池（懒生成）
    ledger: [],              // 资金流水（上限 300 条）
    trainingLog: [], transferLog: [], eventLog: [],
    morale: 65, chemistry: 60, boardTrust: 70,  // 隐藏指标：更衣室矛盾 stressSum
    sponsor: 3200, fans: 2000, ticketBase: 800
  },
  season: {
    id: 1, round: 1, totalRounds: 14,
    teams: [ 8 队 ],          // { id, name, tag, rating, style, homeMap, form, morale, roster }
    fixtures: [ 56 场 ],      // { round, home, away, mapId, score, played, winner, simRounds }
    standings: [ 8 行 ],      // { teamId, played, w, l, pts }
    cup: { phase: 'idle'|'active'|'finished', bracket: [] },
    patch: '2.31', styleMeta: { rushBias, nadeBias }   // 二期版本因子预留
  },
  board: {
    goal: { rank: 6, cup: 1, reward: 10000 },  // 赛季目标
    trust: 70,               // 0-100，连续未达标下降
    fired: false
  },
  history: [ 每赛季 { seasonId, league, rank, cupRound, prize, record } ],
  news: [ { t, type, text } x 30 ],   // 事件流
  achievements: [],
  records: {}                // 生涯纪录
}
```

### 选手对象（roster 元素）

统一能力池 9 维（战斗 + 战术 + 心理 + 纪律），按位置的权重合成 rating，并映射到实机 aiParams。

```js
{
  id: 'p1', name: 'donk',
  role: '突破',              // 突破/狙击/指挥/步枪/自由人/补枪（来自 MAJOR_TEAMS 数据）
  age: 19,
  attrs: {
    aim: 92, react: 90, movement: 88, clutch: 85, nade: 76,   // 战斗五维
    gameIQ: 78, leadership: 55,                                // 战术两维
    composure: 80, aggression: 90, discipline: 70             // 心理+纪律
  },
  rating: 88,                // 由 attrs 按 role 权重合成
  potential: 94,             // 隐藏，对玩家显示为星级 1-5
  personality: 'hyperAggressive',  // 性格标签，影响事件触发与相性
  morale: 70, fatigue: 30, stress: 20,   // 0-100 状态
  chemistry: {},             // { partnerId: 相性分 } 战队羁绊
  contractYears: 3, renewalCost: 12000,
  price: 26400,
  form: [ 'W', 'W', 'L' ],
  stats: { kills: 0, deaths: 0, mvp: 0, games: 0, firstKills: 0,
           clutchWins: 0, adr: 0, rating: 0 }   // 比赛进阶统计
}
```

**能力池定义（9 维，全部可参与实机映射）：**

| 维度 | 中文 | 归属 | 映射的 aiParams |
|---|---|---|---|
| aim | 枪法 | 战斗 | spreadMult、prefireChance |
| react | 反应 | 战斗 | react、aimSpeed |
| movement | 身法 | 战斗 | strafe、counterStrafe |
| clutch | 残局 | 战斗 | saveChance、riskT |
| nade | 道具 | 战斗 | nadeUse、ecoDiscipline |
| gameIQ | 战术理解 | 战术 | rotateChance、riskT |
| leadership | 指挥 | 战术 | IGL 选举 leadershipScore |
| composure | 冷静 | 心理 | saveChance、decisions 稳定性 |
| aggression | 冲击力 | 心理 | rushChance、riskT、vanguard 分工 |
| discipline | 纪律性 | 纪律 | ecoDiscipline |

### 位置 × 能力权重矩阵（rating 合成 + 实机侧重）

每个 role 有主能力/副能力权重，决定 rating 合成；同时映射局内 archetype（persona.js 的 breacher/sniper/support/lurk/rifler），决定实机分工行为：

| role | 主能力（高权重） | 副能力 | archetype | 实机表现 |
|---|---|---|---|---|
| 突破 | aim 0.30, react 0.25 | movement, aggression | breacher | 主攻冲点、高 aggression、首杀率高 |
| 狙击 | aim 0.35, react 0.25 | composure, positioning | sniper | 远战 idealMul×1.6、AWP 配额、架点 |
| 指挥 | leadership 0.30, gameIQ 0.25 | nade, composure | support | IGL 转点决策、leadershipScore 高 |
| 补枪 | aim 0.28, gameIQ 0.22 | nade, teamwork | rifler | 高 tradeSpeed，跟突破补枪 |
| 自由人 | clutch 0.32, gameIQ 0.22 | movement, stealth | lurk | 绕后侧翼、残局 1vN |
| 步枪 | aim 0.25, movement 0.25 | nade, gameIQ | rifler | 全能均衡 |

**rating 合成公式**：`rating = round(Σ(attr[i] × weight[role][i]) × (1 + 年龄修正))`，clamp 40-99。现有 MAJOR_TEAMS 240 人的新维度由旧 4 维推导补齐：`react ≈ aim`、`gameIQ ≈ (nade+clutch)/2`、`leadership = 指挥位 base 70 否则 (nade+clutch)/2×0.6`、`composure ≈ clutch`、`aggression = 突破位 base 75 否则 (aim+movement)/2×0.7`、`discipline ≈ nade`。

---

## 3. 联赛与赛程

- 每个级别 8 队（甲级 80-92 / 乙级 70-85 / 丙级 60-74），双循环 14 轮，每轮 4 场，共 56 场。赛程生成复用 career 的 circle method（`roundRobin`）。
- 玩家队 + 7 支 AI 队，AI 队从真实 CS2 战队池（复用 MAJOR_TEAMS 数据：NAVI/G2/FaZe/Vitality/Spirit 等）抽取，rating 按联赛区间随机。
- 积分：胜 3 负 0（无平局，经典 MR 赛制），加时不计平局。
- 升降级：甲级第 7-8 名降乙；乙级第 1-2 名升甲、第 7-8 名降丙；丙级第 1-2 名升乙，末位不降级。
- 排名奖金：1st 30000 / 2nd 20000 / 3rd 15000 / 4-6 8000 / 7-8 4000（× 联赛 prizeScale）。
- 杯赛：8 队单败淘汰 QF→SF→F，第 14 轮后自动进入；玩家场次实机观战，其余模拟。
- 地图：每队绑定 homeMap（MODE_MAPS 池），主场使用；杯赛轮次按地图池轮转。
- **玩家场次**：进行到该轮玩家场次时暂停推进，玩家在总部点「开始比赛」→ 进入实机观战；其余 3 场按 `simulateManagerMatch` 模拟出结果。

### 比赛模拟（AI 场次）

复用 career 的 `simulateCareerMatch` 思路（事件级回合模拟），按双方阵容/属性/士气/疲劳/羁绊/主场/地图偏好加权算胜率与比分，产出 rounds/timeline/players/mvp 数据。

### 实机观战（玩家场次）

复用 cyber 模式的完整链路：
1. `startManagerMatch(game, oppId, venue, isCup)` → 写 pendingMatch，`game.opts.mode='manager'`，`startMatch(game)`。
2. `managerStart(game)`（registerMode 的 start 钩子）：`setupMatchEntities(game)` 生成 10 个 bot（过滤人类实体），按双方 5 人 roster 命名。
3. `mapManagerRosterToBots(roster, bots, side)`：**核心新逻辑**，把每个选手的 attrs/morale/fatigue/form/羁绊 映射为 bot 的 aiParams（见 §4.1）。
4. 观战者 player 设为 dead，相机跟随存活 bot，面板提供 1x/2x/4x/8x + 跳过本回合。
5. `onFinish`：从真实比分取结果，结算到联赛积分榜、财务、选手数据。

---

## 4. 比赛整合（复用引擎）

### 4.1 选手状态 → aiParams 映射（本项目核心差异化）

`randomizeCyberTeam`（modes.js:1152）现在只用队伍 rating+style。本模式新增 `mapManagerRosterToBots(roster, bots, side)`，为每名 bot 生成 aiParams = `teamDiffParams` 基线 + **位置 archetype** + **9 维能力映射** + 状态修正：

1. **位置 → archetype**：按 role 设 `persona` 字段（breacher/sniper/support/lurk/rifler，见位置矩阵），驱动局内分工（突破主攻/狙击架点/自由人绕后）。`e.persona` 会被 `assignRoles` 消费。
2. **能力 → aiParams 基准**（能力 0-100 线性映射到参数区间）：
   - `aim` → `spreadMult = 1.1 - aim/200`、`prefireChance = aim/800`（clamp 0-0.12）
   - `react` → `react = 0.22 - react/625`（clamp 0.06-0.22）、`aimSpeed = 40 + react×0.9`
   - `movement` → `strafe = 0.6 - movement/400`（clamp 0.36-0.6）、`counterStrafe = 1.1 - movement/500`
   - `clutch` → `saveChance = 0.75 - clutch/400`（clamp 0.3-0.75，残局强=敢打）、`riskT = 0.6 + clutch/250`
   - `nade` → `nadeUse = 0.6 + nade/250`、`ecoDiscipline = 0.9 + nade/800`
   - `gameIQ` → `rotateChance = 0.5 + gameIQ/250`、`riskT += gameIQ/1500`
   - `composure` → `saveChance 稳定：composure<50 时 riskT ×0.85`、残局判定加成
   - `aggression` → `rushChance = 0.3 + aggression/300`、`riskT += aggression/800`
   - `discipline` → `ecoDiscipline = 0.8 + discipline/400`、`spreadCtrl = 0.9 + discipline/800`
3. **状态修正**（覆盖在基准上）：
   - `morale`（50 为基准）→ 全部战斗参数 ±5%
   - `fatigue`（50 为基准）→ 全项衰减最多 -10%（`spreadMult ×1.1`、`strafe ×1.08`、`react ×1.05`）
   - `form` 近 3 场 W/L → ±3%
   - **战队羁绊**：同队选手 ≥3 人同场时，全队 react -5%、spreadMult -3%（见 §4.3）
4. **生成用 seedWorld 保证同一 pendingMatch 可复现**。

### 4.2 观战面板与倍速

复用 cyberPanel 模式：`managerPanel` 全屏遮罩负责管理界面，对局中另有观战 HUD（可复用 cyber 的倍速/跳过按钮逻辑，改挂 manager 状态）。观战数据实时显示：双方比分、回合、击杀、MVP。

### 4.3 战队羁绊 / 化学反应

- **同队羁绊**：roster 中来自同一真实战队 ≥3 人同场 → 全队加成（react -5%、spreadMult -3%、morale 判定 +5）。
- **选手相性**：每人有性格标签，性格相容组合同场 → 小加成；相克组合同场 → 小惩罚 + 事件触发概率上升。
- 相性表为显式映射：hyperAggressive × disciplined 相克，hyperAggressive × hyperAggressive 竞争等。

---

## 5. 转会系统

- **候选池**：`makeManagerCandidates()` 懒生成 8 人（每角色 1-2 人），名字复用 MAJOR_TEAMS 选手库，rating 区间按联赛，带 potential 与 personality。
- **球探噪声**：候选显示的 rating/potential 有 ±5 噪声；潜在显示为星级（1-5 星）而非数字；`scouting` 设施每级降噪声 1 点（0 级噪声 5，3 级噪声 2）。玩家可「深度球探」花小钱查看精确潜力。
- **买入**：窗口期（第 5-8 轮）+ 次数限制；按角色替换现役（同角色自动卖旧拿回扣），或加为第 6 人替补；扣款、士气 +2、记 ledger/news。
- **卖出**：窗口期 + 次数限制；回款 = price × refundScale；士气 -2。
- **合同**：contractYears 倒计时，到期前可续约（扣 renewalCost）；到期未续 → 下赛季流失。
- **事件流**（§6.4 详细）：转会期随机触发对手报价（可拒绝/还价）、选手闹转会（不卖则士气降）、流言（影响身价）等。

---

## 6. 经营与六个核心机制

### 6.1 老板压力 + 赛季目标

- 赛季初董事会下达目标：丙级「进前 4」、乙级「进前 2（冲甲）」、甲级「保前 6」+ 杯赛目标，奖励金额写入 board.goal。
- 达成 → board.trust 上升 + 奖金入账；未达成 → trust 下降。
- **被解雇**：trust 跌至 ≤20 或连续 2 赛季未达标 → 老板解雇（Game Over 画面，可重开或载入存档）。
- trust 影响下赛季 budgetBase 与赞助谈判空间。

### 6.2 战队体检红绿灯

总览页顶部「体检条」：资金健康（bank vs 赛季预算）、士气、整体疲劳、阵容缺口（缺角色/第 6 人空缺）、更衣室矛盾（stressSum）——每项绿/黄/红三态 + 一行建议文案（「资金低于安全垫，慎买人」「阵容缺狙击手」「队内矛盾高，优先安抚」）。这是经理游戏的「瓶颈可视化」。

### 6.3 选手状态参与实机比赛

见 §4.1。玩家在总览页可直接看到每名选手的疲劳/士气/状态条，据此决策轮换（休息/替补）。比赛结束选手疲劳增加、士气随胜负波动，状态变化直接反映到下一场实机表现。

### 6.4 转会窗事件流

- 事件由隐藏指标积累触发（非抽奖）：选手 stress 高 + 出场少 → 「闹转会」事件；队内相克性格同场多 → 「更衣室冲突」事件；连胜 → 「媒体追捧」正面事件。
- 转会期额外推送市场事件：对手报价（需回应）、流言、经纪人施压。
- 事件有选项（安抚/放任/处理），结果影响士气、stress、身价。事件写入 news 流并在总览高亮待处理。
- 训练/休息/安抚/赢球降低 stress；长期替补/输球/相克冲突升高 stress。

### 6.5 球探噪声 + 潜力模糊

见 §5。核心体验：买人是在「看得到的 rating」与「模糊的潜力」之间下注；深度球探与设施升级提供「信息套利」。

### 6.6 战队羁绊 / 化学反应

见 §4.3。阵容管理不仅堆 rating，还要考虑「同一队选手组合」与「性格相性」，为组队增加策略深度。

---

## 7. 培养系统

- **训练**：三档（基础 500/+2/疲劳3、进阶 1200/+6/6、精英 2500/+15/10），训练 Left 每场结算后重置为 2；提升选手 attrs（单维）。教练等级加成训练点数。
- **休息**：每轮一次，清疲劳（不产生收益）。
- **设施**：青训（潜力上限+1/级）、医疗（比赛疲劳-2/级）、球探（噪声-1/级）、数据分析（经理经验加成/级），各 max 3，升级费 baseCost × (1+level×0.8) × costScale。
- **疲劳**：比赛 +6~10（杯赛更高），疲劳高 → 实机表现衰减（§4.1）+ 受伤事件概率。
- **潜力兑现**：青训年轻选手每赛季有概率按 potential 提升 rating；超过年龄巅峰（22+）成长放缓，27+ 开始下滑。

---

## 8. 财务系统

复用 career 的财务骨架（addLedger/labelSource/sponsorIncome/homeTicketIncome/cashflowForecast/seasonBudget/financialRisk 思路）：

- 收入：联赛奖金、杯赛奖金、赞助（档位×士气×评级）、主场票房（×评级×士气×胜负）、球迷增长。
- 支出：买人、续约、训练、设施、教练薪资。
- 预算与现金流预测：projectedBank + 安全垫；资金低时警告。
- 财务风险 → 老板 trust 影响。

---

## 9. 二级 UI（managerPanel）

`index.html` 新增 `<div class="ov" id="managerPanel" style="display:none"></div>`，主菜单加 `data-mode="manager"` 卡片。

- **接线**：`ui.js` startBtn 分流加 manager → `window.__openManager()`；`hideModePanels` 注册 managerPanel；`main.js` boot 调 `initManagerUi(document, game)`。
- **Tab 页**（9 个 + 结算页）：
  1. **dash 总览**：体检红绿灯、下一场卡片（对手/胜率/地图/开赛）、赛季目标进度、事件流待处理高亮、积分榜速览、资金。
  2. **schedule 赛程**：14 轮对阵 + 复盘（已赛）、当前场开赛按钮、杯赛卡片。
  3. **roster 阵容**：5+1 人卡片（属性/状态条/合同/身价/羁绊提示）、换人排序、休息按钮。
  4. **transfer 转会**：窗口状态、筛选器、候选池（星级潜力 + 深度球探）、买入/卖出/续约。
  5. **training 训练**：属性雷达、三档训练、教练、设施升级、训练履历。
  6. **standings 积分榜**：积分榜 + 升降级预测高亮 + 规则卡。
  7. **cup 杯赛**：淘汰赛对阵树 + 奖金 + 对手情报。
  8. **finance 财务**：资金/预算/现金流预测/风险/流水/赞助/票房。
  9. **stats 赛季数据**：赛季统计/选手数据/赛季回顾/生涯纪录/成就。
  10. **settlement 结算页**（赛季末）：排名/杯赛奖金、升降级预告、老板评估、下一赛季按钮。

- **样式**：复用 `.ov`、`.career-card` 等玻璃风容器（项目正在进行全局玻璃 UI 重构，manager 面板沿用 `.career-*` 样式族，命名 manager- 前缀）。

---

## 10. 存档与版本

- `cs2d_manager` / `cs2d_manager_backup`，VERSION = 1。
- `loadManager()`：仅接受匹配版本；损坏或版本不符 → 备份旧档再重建。
- `migrateManagerState(parsed)`：防御性归一化补缺省字段。
- `setRng/setStorage` 注入，支持确定性测试。

---

## 11. 测试计划

新增 `test/manager.mjs`（确定性，setStorage/setRng）：

1. **存档**：resetManager 后初态断言（bank/roster 5 人/56 场/8 队积分榜/联赛档位/经理四维）。
2. **联赛生成**：赛程 56 场、standings 8 行、杯赛 bracket 7 场、球队 rating 落区间。
3. **转会**：窗口第 5 轮开放、买入扣款+按角色替换、卖出回款折价、续约扣款、球探噪声区间。
4. **羁绊**：同队 ≥3 人同场触发加成；相克性格触发惩罚。
5. **事件流**：stress 积累触发闹转会；安抚后 stress 下降。
6. **状态映射**：mapManagerRosterToBots 对高疲劳选手输出衰减的 aiParams。
7. **财务**：sponsor/票房公式随士气/评级变化；ledger 记账。
8. **老板压力**：达成目标 trust 上升；未达标下降；trust ≤20 触发解雇。
9. **赛季结算**：模拟一整个赛季 → 升降级正确、奖金入账、下一赛季重建。
10. **存档损坏**：备份并重建。
11. **实机对局**：createGame({mode:'manager'}) + startMatch → 10 bot、观战者 dead、比分可结算、onFinish 落盘。

验收：`npm run check` + `npm test` 全绿；手动玩通至少一个完整赛季。

---

## 12. 边界与风险

- **实机观战时长**：单场 4-7 分钟（1x）、~1 分钟（8x）。提供倍速 + 跳回合 + 「模拟本场」（不动用实机）三档选择，防止赛季后期疲惫。
- **确定性**：玩家实机场次用 seedWorld(seed)；模拟场次用注入 rng，保证存档可复现。
- **性能**：仅玩家场次跑实机（一个赛季最多 ~16 场实机），其余模拟，无性能风险。
- **存档体积**：matchHistory 上限 500 条，news 30 条，ledger 300 条，避免 localStorage 膨胀。

---

## 13. 二期展望（明确不在此次实现）

- 版本补丁因子：每赛季随机版本影响打法风格（rushBias/nadeBias），数据模型已预留 `season.patch`。
- 功勋选手传承线：老将退役进入教练组/管理层。
- 经理技能树 / 出身背景（MyGM 式）。
- 全球赛事（世界赛）与跨赛区声望。
