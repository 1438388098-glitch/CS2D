# 更新日志（CHANGELOG）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 惯例；版本号语义化（SemVer）。
v2.1.0 之前的密集迭代历史见 `git log`（commit 均为 conventional 风格中文摘要）。

## [2.1.0] - 2026-09-11

### 新增
- **HLTV 风格评价体系**（协作者 PR #1 + 审查修复批次）：单场 HLO 五分项评分（锚定联赛中位水平）、10 场指数衰减滚动平均；赛事 MVP/EVP（联赛 5 名额 / 杯赛 8 名额、含金量 ×1.8、MVP 限决赛两队）、6 角色最佳阵容、年度 HLTV Top 20（荣誉分主排序 + 5 级 fallback、倒序批次新闻流、历史限 10 年）；manager 顶栏「📊 年度 Top 5」浮层、roster HLO 卡、生涯 HLTV 评价卡
- **经理时间流**：每场 +1 天日历、月度发薪（欠薪扣信任）、12 月圣诞休赛期；存档迁移链 VERSION 1→4
- **前端表现四轮迭代**：粒子色值修复 + 加色火花条纹/受击白闪/伤害数字分级/全员行走起伏；C4 蜂鸣同步警报环、手雷弹体精修、包点战术括号、小地图事件 ping；深水焦散、尘埃加色、官方图 2D 天气身份（dust2 沙霾 / canal 雾 / blast 烟霭）；闪光弹白屏修复（径向过曝渐变，原实现不可见）+ 击杀信息退场动画 + 名牌血条 + killfeed 武器图标 + 资金增减浮动提示
- **服务器**：房间名消毒、二次开房拒绝、房间数上限、LAN 观战角色、帧载荷零拷贝、ETag/长缓存、`server.config.json` 热重载、对局结果上报（matchReport → `logs/matches.jsonl`，`node scripts/match-stats.mjs` 汇总）
- **工程**：自研测试 runner（217+ 文件）、架构环守卫、平衡采样（`npm run balance`）与 soak 压测（`npm run soak`）、CDP 实机 60fps 冒烟、GitHub Actions CI、nightly 重验证工作流

### 修复
- HLTV 集成的 9 个审查问题（动态锚点未接入 / KAST 恒定 / 杯赛决赛限制失效 / 降级公式笔误 / 实机回合映射失效 / Top20 延迟发布 / 荣誉跨年膨胀 / 颁奖空引用风险 / 字段未声明）
- 粒子色值尾逗号非法导致 canvas 静默忽略（血/烟/水花全部画成残留色）
- `#flash` 缺 `position:fixed` 导致闪光弹白屏从未真正可见
- 经理模式面板透明、防误开局、杯赛图池误用联赛图、单挑图解锁与换边等（见 git log optimize 系列）

### 文档
- `CONTRIBUTING.md`（铁律与流程）、`docs/ADR/`（5 篇决策记录）、`docs/PLAYTEST.md`（试玩验收清单）、`docs/README.md`（文档索引）、平衡报告与 HLTV 审阅报告入库

## [2.0.0] - 2026-09-09 之前

历史基线：经典爆破 + 9 个娱乐模式（Major/局域网/大逃杀/肉鸽/Boss 战/生涯/排位/单挑/地图编辑）、5v5 bot AI（感知/决策/战术/对手建模）、零依赖 Node 服务端。详见 `git log` 与 `docs/audit/`。
