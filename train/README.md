# 地狱人机训练框架

通过进化算法（遗传算法）离线训练最强 AI 参数，**不开挂**（无透视、无作弊视野），全部来自可解释行为参数（反应/精度/视野/身法/投掷倾向），经百万局对战筛选出的最优组合。

## 架构

```
train/
  fitness.js     单基因评估：训练队(T) vs 基线队(CT) 打 N 局，按 胜局x6/装弹x3/击杀x1.2/存活x0.5 计分
  evolve.js      进化主循环：种群POP=16, 精英1, 锦标赛KEEP=4, 交叉+变异(MUT_RATE=0.12)
  ai-genome.js   10维基因 -> 行为参数解码（src/ai-genome.js）
  checkpoints/   每代最优存档（best_gen_N.json，可断点续训）
  smoke-test     单个体评估冒烟验证
  run-evolve.mjs 单图单轮训练入口
  run-batch.mjs  多图多代批量训练入口（推荐）
```

## 行为参数（10 维基因）

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

所有参数作用于现有 AI 行为（`e.aiParams` 实体级覆盖，见 `src/ai.js`/`src/combat.js`），无任何新增特权逻辑。

## 快速开始

```bash
npm run train           # 单图 8 代（~90 秒）验证框架
npm run train-batch     # 全流程批量训练（长时间后台任务）
node train/smoke-test.mjs   # 冒烟验证
```

训练产出写入 `train/checkpoints/best_gen_N.json`，手动将 `params` 复制到 `src/config.js` 的 `DIFF.hell`（含 genome 与训练记录）。

## 1 亿次训练计划（S1~S4）

总目标：累计 ≥ 1 亿局对战（本框架单局 = 1 次评估回合）。策略 = 多机/多进程并行 + 断点续训 + 对抗梯度。

- **S1 框架验证（已完成）**：dust2 单图、基线 normal、8 代 × 16 基因 × 6 局 ≈ 768 局，fitness 29→101（7胜0负），确认收敛方向正确。
- **S2 单机规模化（~3000 万局）**：4 进程并行，每进程负责 1 张图（dust2/snow/depot/canal/metro），每代 24 基因 × 10 局，跑 2000 代 ≈ 48 万局/图；换边训练（T/CT 各半）消除阵营偏差。产出 5 图各自最佳基因。`node train/run-batch.mjs --par 4 --gens 2000`
- **S3 对抗梯度（~3000 万局）**：把 S2 冠军当基线，新种群与其对打；再把"冠军挑战者"写回基线（每 50 代一次军备竞赛），直到连续 20 代无进步（收敛点）。防过拟合：每 10 代换图轮训。
- **S4 多基线蒸馏（~4000 万局）**：同时以 easy/normal/hard 为基线各训练一支种群，交叉验证（冠军 vs 各路基线），选出全基线碾压且互相间稳定最优的基因，写为 `DIFF.hell` 最终版（多图多基线平均 fitness 最高的基因组）。

### 加速手段

- `ROUND.TIME=40`、buyTime 0.3s、freezeT 0.2s（fitness.js 已内置），单局真实时间 ~1 秒
- 4 进程并行：`node --experimental-worker` 或直接多终端各跑一张图
- 每 500 代做一次 500 局长样本复评（消除随机噪声后定冠军）

## 当前产出（v1，dust2 单图）

见 `src/config.js` `DIFF.hell`（trained: true）。7 胜 0 负、35 杀、5 次装弹、fitness 101.0。**注意**：为单图单基线产物，S2+ 多图续训后将替换。
