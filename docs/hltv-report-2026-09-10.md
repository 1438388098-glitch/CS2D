# HLTV 模块审阅报告

- 日期：2026-09-10
- 审阅人：协作者 704315792-yM
- 范围：`src/hltv-rating.js`、`src/hltv-baseline.js`，以及 `manager.js` / `career.js` 的集成路径
- 触发：配合 HLTV-Events PR（HLTV 评价 → 赛事 MVP/EVP → 最佳阵容 → 年度 Top 20）
- 说明：本报告只列**我在读代码 + 实测**中确认的问题，附复现命令与输出，供你判断优先级。修法只是建议，不替你定方向。

---

## 0. 先说明：本次 PR 已与 upstream/main 同步

- 合并前 base：`2b92719`（09-09）
- 已合入 `upstream/main` 最新 `92b9fa1`（Round1-4 渲染/UI 动效，19 个提交）
- 两侧重叠文件 5 个（`manager.js` / `manager-ui.js` / `manager-match.js` / `career.js` / `career-ui.js`）
- **自动合并零冲突**；合并后 CI 三关复跑通过：`check` 348 文件 / `check:arch` 无新增循环 / `test` 160 文件

---

## 1. 问题 A —— 动态锚点（联赛中位数）算出来了但没被使用

**位置**：`src/hltv-rating.js:60`

```js
const baseline = ctx.baseline || 60;   // 赋值后，本函数内再无任何引用
const baseKPR = 0.65;                  // ← 5 个分项真正用的是这组硬编码常量
const baseDPR = 0.65;
const baseADR = 80;
const baseKAST = 0.60;
const baseImpact = 1.5;
```

**现象**：`hltv-baseline.js` 的 `hltvBaseline()` 会按联赛收集 roster 的 rating 中位数并传进来（`computeMatchHltv` 也照传），但 `computePlayerHltv` 内部**从未使用** `ctx.baseline`。5 个分项的锚点全部是固定常量。

**影响**：
- UI 上写着「1.00 = 联赛平均」，但实际上 1.00 锚的是**写死的常量模型**，不是当前联赛。跨联赛（甲/乙/丙）的选手拿着同一套锚点，`hltv-baseline.js` 的「按联赛分组锚定」这个设计目标没有生效。
- 也就是说这部分是**死代码 + 失效设计**，不是数值偏差。

**实测**（同一名选手，只改 baseline）：

```
$ node --input-type=module -e "
  import {computePlayerHltv,deriveRoundParticipation} from './src/hltv-rating.js';
  const rounds=[{winner:'A'},{winner:'A'},{winner:'B'},{winner:'A'},{winner:'B'}];
  const star={name:'star',team:'A',kills:9,deaths:1,dmg:600,plants:1,defuses:0,clutches:2};
  Object.assign(star,deriveRoundParticipation(star,rounds));
  const b=computePlayerHltv(star,{},{rounds,baseline:60});
  const c=computePlayerHltv(star,{},{rounds,baseline:90});
  console.log(b.total, c.total);"
1.5 1.5        # baseline 60 与 90 结果完全相同 → ctx.baseline 未生效
```

**建议修法**（择一）：
1. 把 `base*` 改为由 `ctx.baseline` 换算（例如 KPR/ADR 的期望值随联赛中位数缩放），让锚点真正动态；
2. 或明确放弃动态锚点，删掉 `hltvBaseline` 的调用与 `ctx.baseline` 管道，并把 UI 文案从「1.00 = 联赛平均」改成「1.00 = 基准模型」。

---

## 2. 问题 B —— KAST 分项恒为常数，对所有人无区分度

**位置**：`src/hltv-rating.js:14-25`（`deriveRoundParticipation`）+ `:53`（`kastPct`）

```js
for (const r of rounds || []) {
  if (r.winner === playerStats.team) roundsWon++;
  else roundsSurvived++;              // ← 没赢的回合一律记「存活」
}
...
const kastPct = (roundsWon + roundsSurvived) / R;   // 恒等于 R / R = 1.0
```

**现象**：每个回合非赢即「存活」，所以 `roundsWon + roundsSurvived` 恒等于回合数 `R`，`kastPct` 恒为 1.0。经 `subRating` 后夹到上限 1.5，于是**每个选手的 KAST 分项都等于 1.5**（封顶）。

**影响**：5 分项权重里 KAST 占 0.15，但这一项对所有选手是同一个常数，等于**没有参与区分**。实际有效区分只剩 Kill / Survival / Impact / Damage 四项。

**实测**（2 杀 vs 9 杀，KAST 一样）：

```
$ node --input-type=module -e "
  import {computePlayerHltv,deriveRoundParticipation} from './src/hltv-rating.js';
  const rounds=[{winner:'A'},{winner:'A'},{winner:'B'},{winner:'A'},{winner:'B'}];
  const weak={name:'weak',team:'A',kills:2,deaths:4,dmg:150,plants:0,defuses:0,clutches:0};
  const star={name:'star',team:'A',kills:9,deaths:1,dmg:600,plants:1,defuses:0,clutches:2};
  for (const p of [weak,star]) Object.assign(p,deriveRoundParticipation(p,rounds));
  const a=computePlayerHltv(weak,{},{rounds,baseline:60});
  const b=computePlayerHltv(star,{},{rounds,baseline:60});
  console.log('weak kast=',a.kast,' star kast=',b.kast);"
weak kast= 1.5  star kast= 1.5
```

**根因**：`deriveRoundParticipation` 的输入里没有「该回合这名选手是否阵亡」的信息，只能拿「队伍是否赢了这个回合」近似，于是退化成常数。

**建议修法**：需要逐回合的存活事实。可选：
1. 若 `rounds[].events` 里带击杀记录（`timeline` 里有 `kills` 事件），从中判定该选手本回合是否阵亡，算出真实 survival；
2. 若暂时拿不到逐回合死亡数据，建议显式把 KAST 权重设为 0（或把该分项标注为「未启用」），避免保留一个恒定常数项造成「有 5 个分项」的错觉。

---

## 3. 问题 C —— 杯赛「MVP 只从决赛两队选」在 manager 集成路径里不生效

**位置**：
- `src/manager.js:689` 取的是**角色表**：`const roleMap = collectPlayerRoles(s);`（`collectPlayerRoles` 返回 `name → role`）
- `src/manager.js:694 / :718` 却把它当**队伍表**传下去：`selectTournamentEvps(..., { playerTeams: roleMap })`
- `src/hltv-rating.js:304-308` 的决赛过滤按队伍比对：

```js
const finalistCandidates = candidates.filter((c) => {
  const team = playerTeams[c.name] || c.team;   // 拿到的是 '突破' 这类角色名
  return finalists.indexOf(team) !== -1;        // 永远匹配不上 't1'/'t2'
});
if (finalistCandidates.length > 0) mvp = finalistCandidates[0];
// 过滤为空 → 静默 fallback 到全局第一
```

**现象**：`playerTeams[c.name]` 取到的是 `'突破'` 之类的**角色名**（且非空，所以不会 fallback 到 `c.team`），与 `finalists` 里的 teamId（`'t1'`）永远不等 → 过滤结果恒为空 → 静默回退到全局 avgHlo 第一。

**影响**：Q1-final-B「杯赛 MVP 只从决赛两队里选」这条规则，**在 manager 的实际颁奖路径里等于没生效**。单测里是手动传了正确的 team 表，所以测试是绿的——属于典型的「测试绿、集成错」。

**实测复现**：

```
$ node --input-type=module -e "
  import {selectTournamentEvps} from './src/hltv-rating.js';
  const stats={type:'cup',weight:1.8,entries:{
    p_fin:{name:'p_fin',team:'t1',hltvSum:6.0,games:3,weightedScore:10.8,bestHlo:2.1},
    p_top:{name:'p_top',team:'t2',hltvSum:6.6,games:3,weightedScore:11.9,bestHlo:2.3}}};
  const finalists=['t1'];
  console.log('传对(team 表) ->',
    selectTournamentEvps(stats,{minGames:3,finalists,playerTeams:{p_fin:'t1',p_top:'t2'}})[0].name);
  console.log('传成 role 表 ->',
    selectTournamentEvps(stats,{minGames:3,finalists,playerTeams:{p_fin:'突破',p_top:'狙击'}})[0].name);"
传对(team 表) -> p_fin        # 正确：限制生效，选决赛队的 p_fin
传成 role 表 -> p_top         # 现状：限制失效，退回全局第一
```

**建议修法**：新增一个 `collectPlayerTeams(state)`（`name → teamId`，玩家 roster 记 `'player'`，AI 队从 `t.roster` 取 `t.id`），在 `awardSeasonEnd` 里替换掉误用的 `roleMap`。`playerRoles` 那一路（最佳阵容用）保持不变。

> 附注：`awardSeasonEnd` 里 `roleMap` 同时被 `playerTeams`（第 694/718 行）和 `playerRoles`（第 707/730 行）两处引用——只有后者是对的。

---

## 4. 问题 D —— `awardSeasonEnd` 边缘情况下的空引用风险（P2，读出来的，未实测）

**位置**：`src/manager.js:711` 与 `:734`

```js
if (s.tournamentStats.league && Object.keys(...).length > 0) {
  const evpList = selectTournamentEvps(s.tournamentStats.league, { minGames: 5, ... });
  if (evpList.length > 0) {
    ...
    result.league = { mvp, evps: evpList.slice(1) };   // 只有这里才给 result.league 赋值
  }
  const team = selectAllTournamentTeam(s.tournamentStats.league, { minGames: 5, ... });
  if (team.players.length > 0) {
    ...
    result.league.team = team;                          // ← evpList 为空时 result.league 仍是 null
  }
}
```

**现象**：若某赛事 bucket 有 entries，但**无人达到 minGames**（`evpList` 为空），则 `result.league` 保持 `null`；只要最佳阵容能选出人，紧接着的 `result.league.team = team` 就会抛 `TypeError: Cannot set properties of null`。杯赛分支（`:734`）同构。

**影响**：赛季末颁奖可能整体抛错。触发条件偏窄（需要「有比赛记录但都没有满足最低场次」），但一旦命中就是硬崩。

**建议修法**：`result.league = result.league || {}` 后再赋值；或在 `result.league.team` 前判空。

---

## 附：本次核对使用的命令

```bash
# CI 三关（在同步 upstream/main 之后的分支上跑）
npm run check && npm run check:arch && npm test

# 问题 A（动态锚点无效）
# 问题 B（KAST 恒为常数）
# 问题 C（决赛限制失效）
# 三条复现见上文各节代码块
```

## 附：本次 PR 未改动的既有实现

`hltv-rating.js` 里的 `selectTournamentMvp`（旧版 MVP）、`updateYearlyRating` / `yearlyTop`（年度加权榜）为前序提交已落地，本次未动，不在本报告审阅范围内。
