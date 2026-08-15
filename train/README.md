# 地狱人机训练框架

通过进化算法（遗传算法）+ 强化学习（DQN）离线训练最强 AI 参数，**不开挂**（无透视、无作弊视野），全部来自可解释行为参数（反应/精度/视野/身法/投掷倾向）与宏观决策网络，经百万局对战筛选出的最优组合。

## 架构

```
train/
  fitness.js          单基因评估：训练队(T) vs 基线队(CT) 打 N 局，按 胜局x6/装弹x3/击杀x1.2/存活x0.5 计分
                      spec 参数支持专项塑形（保枪/经济/闪光/转点，地狱 H4-H7）
                      opponent 参数支持指定对手挡位（军备竞赛 H11）
  evolve.js           进化主循环：种群POP=16, 精英1, 锦标赛KEEP=4, 交叉+变异(MUT_RATE=0.12)
  evolve-fresh.mjs    H11 从零进化：纯随机起点（无冠军种子/无蒸馏），seed 分散评估，每5代实力曲线
  dqn-train.mjs       H8-H10 DQN 训练器：13维观察/6动作/课程对手/分层采样/迁移学习(--init)
  dqn-fresh.mjs       H11 DQN 从零实验管线（已证明此环境 DQN 不收敛，保留作对照）
  run-hell-ladder.mjs 地狱阶梯 H4-H7 逐级蒸馏流水线（种子=上级冠军+变异）
  bench-ladder.mjs    难度曲线基准：10+1 级 vs normal 基线，多 seed 平均，单调性判定
  deploy-h47.mjs      把 checkpoint 基因解码为参数写入 config.js（H4-H7）
  deploy-h11.mjs      部署从零进化冠军到 H11
  deploy-multi.mjs    部署多图 DQN 权重到 H8-H10（netWeights 按地图索引）
  checkpoints/        每代最优存档（best_gen_N.json，可断点续训）
  output/             已发布权重（net-imitation-pretrain.json / net-weights-trained.json）
  smoke-test.mjs      单个体评估冒烟验证
  run-evolve.mjs      单图单轮训练入口
  run-batch.mjs       多图多代批量训练入口（推荐）
```

## 行为参数（13 维基因）

| 参数 | 含义 | 范围 |
|---|---|---|
| react | 反应时间(秒) | 0.05~0.55 |
| spreadMult | 弹道扩散倍率 | 0.5~2.0 |
| view | 有效视野半径(px) | 800~1300 |
| aimSpeed | 瞄准角速度(deg/s) | 60~180 |
| strafe | 身法频率 | 0.2~0.8 |
| idealMin/idealMax | 交火距离带(px) | 200~950 |
| peekChance | 试探开火概率 | 0~0.5 |
| nadeUse | 投掷物使用倾向 | 0.2~1.0 |
| riskT | 高风险行为容忍 | 0.3~1.5 |
| rushChance | 全队冲锋概率 | 0.1~0.7 |
| rotateChance | 转点概率 | 0.2~0.8 |
| saveChance | 保枪概率 | 0.2~1.0 |

所有参数作用于现有 AI 行为（`e.aiParams` 实体级覆盖），无任何新增特权逻辑。

## 快速开始

```bash
npm run train           # 单图 8 代（~90 秒）验证框架
npm run train-batch     # 全流程批量训练（长时间后台任务）
npm run train-hell      # H4-H7 专项训练（每级 ~5 分钟）
npm run train-dqn       # H8-H10 DQN 训练（--style=hold|control|push）
npm run train-fresh     # H11 从零进化
npm run deploy-ladder   # 汇总 checkpoints 到 config
node train/smoke-test.mjs   # 冒烟验证
node train/bench-ladder.mjs # 难度曲线基准（验收用）
```

## 地狱 11 级阶梯（src/config.js DIFF.hell.ladder[1..11]）

| 挡位 | 引擎 | 说明 |
|---|---|---|
| H1-H3 | 冠军基因衰减插值 | 免训练，S1 冠军参数 2%/55%/85% 插值 |
| H4-H7 | GA 专项 | 保枪/经济/闪光/转点纪律，冠军种子蒸馏 |
| H8-H10 | DQN 网络 | push/hold/control 三风格 × 5 图权重（netWeights 按图索引） |
| H11 | 从零 GA | 纯随机起点，军备竞赛目标：全挡位 80%+ |

## 训练经验（踩坑记录，验收必读）

### 1. 评估 seed 必须分散（最重要）

**坑**：fitness 用 `seed = gen*100000 + i`（个体间只差 1）→ 16 个体打几乎相同的 6 局 → 种群把"那 6 局"背到满分（fitness 99.7 全胜），换 seed 实测只剩 17% 胜率。

**正确做法**：seed 分散 `i*104729 + gen*7919` + 每个体 ≥8 回合。**验收标准：训练曲线单调（精英保留）+ 大样本（≥96 回合）实测胜率双指标，缺一不可**。

### 2. DQN 在此环境不收敛（dqn-fresh 实验结论）

13 维连续状态 + 6 宏观动作 + 长时域稀疏奖励 + 多智能体共享参数，vanilla DQN 在百万级样本内 TD 不收敛（γ=0.95 时 win 奖励传不回起点 `0.95^110≈0`；γ=0.995 后 TD 方差爆炸 0.24→0.65）。**参数级 GA 是此环境的正确引擎**（H11 从零 24 代即达 55% vs normal）。

### 3. 课程对手必须自适应且评估对齐

固定时间表课程 + 评估对象（vs normal）与训练对手（easy）错位 → 对手永不升级死锁。**评估必须测"vs 下一级"**，打得过才升级。

### 4. 学习率/ε 调度防退化

DQN 后期回放覆盖导致震荡退化：分层采样（近 25% 占 60%）+ 学习率衰减 + best 快照独立存档（`net_{style}_best.json`，只存不覆盖）。

## 1 亿次训练计划（S1~S4）

总目标：累计 ≥ 1 亿局对战（本框架单局 = 1 次评估回合）。策略 = 多机/多进程并行 + 断点续训 + 对抗梯度。

- **S1 框架验证（已完成）**：dust2 单图、基线 normal、8 代 × 16 基因 × 6 局 ≈ 768 局，fitness 29→101（7胜0负），确认收敛方向正确。
- **S2 单机规模化（~3000 万局）**：4 进程并行，每进程负责 1 张图，每代 24 基因 × 10 局，跑 2000 代 ≈ 48 万局/图；换边训练（T/CT 各半）消除阵营偏差。产出 3 图各自最佳基因。
- **S3 对抗梯度（~3000 万局）**：把 S2 冠军当基线，新种群与其对打；再把"冠军挑战者"写回基线（每 50 代一次军备竞赛），直到连续 20 代无进步（收敛点）。防过拟合：每 10 代换图轮训。
- **S4 多基线蒸馏（~4000 万局）**：同时以 easy/normal/hard 为基线各训练一支种群，交叉验证，选出全基线碾压且互相间稳定最优的基因，写为 `DIFF.hell` 最终版。

### 加速手段

- `ROUND.TIME=40`、buyTime 0.3s、freezeT 0.2s（fitness.js 已内置），单局真实时间 ~1 秒
- 16 核并行：多进程各跑一张图/一个风格（run-batch/dqn-train 均支持）
- 每 500 代做一次 500 局长样本复评（消除随机噪声后定冠军）

## 当前产出

- H1-H11 全部部署于 `src/config.js` `DIFF.hell.ladder`（trained: true）
- H8-H10 五图权重内嵌（netWeights: { __default, snow, depot, canal, metro }）
- 实测（96 回合/级 vs normal 基线）：H1~53% / H4-H7 50-59% / H8 48% / H9 63% / H10 60% / H11 55%
