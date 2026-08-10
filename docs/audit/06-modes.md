# 06 · 玩法模式与养成系统调研

范围：src/modes.js（70KB）、duel.js、ranked.js、ranked-ui.js、career.js、career-ui.js、docs/MODES.md。

## 现状
- 模式注册契约：modeDef.start/update/onFinish/customBots（game.js 三时机调用）
- Major 48 队（瑞士轮+单败 BO3）、赛博斗蛐蛐（观众伪装+下注经济）、生涯（8 队双循环+杯赛+转会+升降级）、排位（5 场定级+Elo MMR）、单挑 MR9、LAN、编辑器
- career/ranked 已有"逻辑+ui 分离"良好范式

## 问题
- 2.1 modes.js 过度膨胀：48 队静态数据 290 行 + Major 状态机 + cyber + 共享工具 + 注册全塞一文件；cyber/major 面板直接 innerHTML（与 career-ui 范式不对称）
- 2.2 **模拟与实打规则不一致**：实打 MR9（MATCH_WIN=9），simScore 用 13 分制 → 模拟比分无法预测实打
- 2.3 终局判定 4 处重复、3 处不含 OT（ranked.js:234 / career.js:528 / duel.js:122 vs Major 正确写法 modes.js:1275）
- 2.4 customBotAI 体系死代码（无模式启用）但模块加载时全局替换 updater（副作用）
- 2.5 四份重复的 localStorage 样板（duel/ranked/career/cyber），VERSION 升级即丢档
- 2.6 战队阵容 4 处复制（ranked/career/duel/modes），转会需改 4 处
- 2.7 esc() 三份重复；2.8 window 全局契约蔓延；2.9 UI 组织不对称（renderModeSettings 90 行 if-else）
- 2.10 MVP 判定实打/模拟口径漂移；队友 AI 无个体差异；排位匹配过于简单（±120 随机）；定级公式不含对手强度；生涯平局字段死数据；对手无成长；硬编码地图列表 ×4；modeDef 无字段校验

## 优化建议
1. modes.js 拆 5+1：data/teams.js、match-sim.js、ai/difficulty.js、modes/major.js、modes/cyber.js、modes/common.js（70KB→~10KB）
2. simScore 加 winAt 参数（默认 MR9，major 显式 13）
3. 统一 matchWinAt(game)（含 OT）
4. src/save.js 共享存储层（带迁移）
5. cyber/major 面板改纯函数 + -ui.js
6. 删 customBotAI 死代码；7. 共享 roster 数据源；8. window 全局改显式 import

## 拓展（摘选）
军备竞赛/攻防/山丘之王/夺旗/感染/自定义房间规则（opts.rules 覆盖 ROUND.*）/回放系统（seed+inputs 三元素，确定性基建已有）/精彩集锦、生涯（通行证/成就/每日任务/宿敌成长/青训二队/训练疲劳）、排位（赛季重置/段位徽章/晋级赛/BP 禁图/MMR 曲线）、社交（好友/公会/战绩分享）、模式接口文档。
