# CS2D · 平面反恐精英

模块化 HTML5 5v5 战术射击游戏（ES Modules，零依赖）。顶部视角 CS，含 A/B 点爆破模式、经济系统、投掷物、AI 人机、多地图。

## 快速开始

```bash
npm start          # 启动本地服务器 http://localhost:8080
npm test           # 单元 + 模拟回归
npm run check      # 语法检查全部模块
npm run train      # 地狱 AI 单轮训练（~90 秒）
npm run train-batch# 地狱 AI 批量训练（长时后台）
```

必须通过本地服务器访问（ESM 限制，浏览器直开 html 无效）。

## 功能总览

- **爆破模式**：5v5、A/B 双点、装弹/拆弹/起爆、半场换边、MVP/经济统计结算
- **武器系统**：11 把武器（手枪/冲锋枪/步枪/狙击/霰弹/战术刀），后坐力、换弹、掉落拾取、专属弹道扩散（`src/ballistic.js`：首发准/连射扩散/移动扩散/恢复，准星实时联动）
- **经济系统**：击杀/胜利/连败奖励，手枪局、降级链、护甲/头盔/拆弹器/投掷物
- **AI 人机**：4 难度（简单/普通/困难/**地狱**）。地狱参数由进化算法训练产出（`train/`，见 [train/README.md](train/README.md)），行为全部基于参数化 AI（无透视等特权逻辑）
- **5 张地图**：沙漠 dust2 / 雪地 snow / 仓库 depot / 运河 canal / 地铁 metro（程序化生成，`src/map-gen.js`，带光照烘焙与水瓦片）
- **表现细节**：命中反馈/爆头、击杀提示、连杀公告、死亡提示、小地图(队友/敌人/炸弹/A-B点标记/视野圈/点击右上角2倍缩放)、击杀播报、AWP 取景框、蹲伏(CTRL)、天空渐变渲染
- **匹配统计**：每场结束结算（KD/命中率/爆头数/最顺手武器/MVP）

## 操作

| 键 | 动作 |
|---|---|
| W A S D | 移动 |
| 鼠标 | 移动即瞄准（准星跟随鼠标） |
| 左键 | 开火 |
| R | 换弹 |
| B | 购买（局前） |
| 1/2/3 | 主武器/手枪/战术刀 |
| 4/5/6 | 手雷/闪光/烟雾 |
| E | 拆弹 / 拾取 |
| Ctrl 或 C | 蹲伏 |
| Esc | 菜单 |
| 点击小地图 | 小地图 1x / 2x 缩放切换 |

## 架构

```
server.js          静态服务器（含防路径穿越）
index.html         菜单/购买/结算界面
src/
  game.js          主循环、回合状态机、比赛流程
  combat.js        射击/伤害/击杀/拾取
  ballistic.js     弹道扩散模型
  ai.js            bot 行为（寻路/交火/装弹/拆弹/换位）
  ai-genome.js     10 维 AI 基因（训练对象）
  map.js          地图实例/寻路(A*)/碰撞
  map-gen.js       5 图程序化生成器
  textures.js      瓦片烘焙/光照软阴影
  entities.js      实体工厂
  economy.js       购买决策
  grenades.js      投掷物（手雷/闪光/烟雾）
  bomb.js          爆破逻辑
  input.js         键盘/鼠标/
  hud.js / render.js / render-utils.js   渲染
  ui.js            菜单/计分板/连杀/死亡/结算
  audio.js         合成音效（WebAudio，无资源文件）
train/             地狱 AI 进化训练框架（fitness/evolve/checkpoints）
test/              selftest + simulate + hell-battle + CDP 浏览器全链路
```

## 测试

- `npm test`：selftest（回合机/经济/地图连通/寻路/自动换弹/平局处理）+ simulate（7 回合模拟）
- `node test/hell-battle.mjs`：5 图 × 4 难度 × 3 回合稳定性
- `node test/cdp-test.mjs`：Edge headless + CDP 协议，真实浏览器全链路（菜单→地狱→开赛→移动→开火）

## 地狱 AI（训练产出）

`DIFF.hell` 参数（反应 0.064s / 扩散 0.5x / 视野 1171px / 瞄准角速度 141°/s 等）来自进化算法 8 代 × 16 种群 × 6 局训练（fitness 29→101，7 胜 0 负基线）。1 亿次规模计划见 [train/README.md](train/README.md)（S2 多图规模化 / S3 对抗梯度 / S4 多基线蒸馏）。
