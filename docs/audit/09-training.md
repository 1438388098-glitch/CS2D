# 09 · 训练与进化系统调研

范围：train/ 全目录、src/dqn.js、ai-genome.js、deploy 链、net-*.json、sim-real*.log。

## 现状（三引擎并行）
- GA 进化（POP16/精英1/KEEP4）→ H4-H7；DQN 13→6（dqn-train）→ H8-H10；团队 DQN 33→18（scripts/train-dqn-worker）→ H12；军备竞赛 GA（evolve-battle）→ H11
- 产出链：checkpoint → deploy-*.mjs → config.js DIFF.hell.ladder[1..12] → netAct 注入
- 模仿预训练：120 回合 8,481 条样本 warm-start H12
- 确定性：seedWorld 逐帧可复现（ctx.js:36-40）

## 正确性缺陷（P0）
- **A1 evolve.js:20 seed 坍塌**：`seed=gen*100000+i` 个体间 seed 相邻（mulberry32 计数器式 PRNG 流高度相关），种群"背 6 局"满分过拟合（README:72-74 自记坑，修复只落 evolve-fresh；**run-batch/run-hell-ladder 仍走坏版本 → 现役 H4-H7 基因评估不可信**）
- A2 保枪/eco 塑形奖励是假信号：回合切换 tick 计数但 spawnRound 已复活全员 → 恒定 +12.5 分灌水
- A3 转点奖励跨回合泄漏（tSwitchedAt 是绝对 roundTime 不重置）
- A4 "Double DQN" 名存实亡：trainStep 把在线网络当 target 传（Q 过估计未消除，README 自记 TD 方差爆炸 0.24→0.65）
- A5 胜负奖励信用分配空洞：win/lose 只加到仍 pending 的 transition，早期决策 γ^66≈0.03 学不到
- A6 ε 探索窗口极短：6600 步即到 0.05 保底，300ep 后 90% 时间零探索
- A7 **H8-H10 风格映射颠倒**：dqn-train 是 hold=H8/control=H9/push=H10，deploy-multi 是 8:push/9:hold/10:control
- A8 迁移学习可能上线未训练权重（ep1 无条件写 best；canal 权重与 __default 逐位相同列）
- A9 sim 脚本依赖 Temp 目录外部补丁文件（清理即断）

## 稳定性 / 成本
- B1 dqn-fresh ep200..2600 全部相同 best.score=211.819（2400ep 白跑）且仍为默认 npm 脚本
- B2 单个体 6 回合评估噪声 ±17% 冠军漂移
- B3 --par 不限制并发（只跨图）；B4 无可观测性（无 loss/Q 曲线、best 按训练内噪声选）；B5 存档 130+ 无保留策略；B6 双 DQN 管线版本混乱；B7 2.4h 级 sim 无断点续跑

## 优化优先级
P0 修 evolve seed 公式（对齐 README:74）；P1 重写塑形采样时机；P2 真 Double+n-step；P3 统一风格映射+部署前校验/复评；P4 worker 池并行（16h→2-4h）；P5 JSONL 指标+vs 基线复评；P6 ε 与课程联动；P7 存档治理；P8 收敛 DQN 管线（worker 版为主）；P9 sim 工程化（patch 入库+resume）。

## 拓展（摘选）
PPO（on-policy+熵正则，README 已证 DQN 不收敛）、自对弈 League Training（对手池已有雏形+ELO 化）、reward-config.js 奖励库（三套量级差 10-30 倍不可比）、行为克隆扩到 10 万级+人类回放、零依赖训练仪表盘（JSONL+静态 HTML）、评估矩阵多对手多图防过拟合、迁移学习验证门、MMR 联动自适应难度（ranked MMR 已有）、Major 终极适应度函数、deploy 产出可回滚补丁+CI 验收、确定性回归测试。
