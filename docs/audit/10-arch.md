# 10 · 架构 / 服务器 / 测试 / 文档 / CI 调研

范围：server.js、main.js、index.html、styles.css、docs/、package.json、test/、start.bat、.github/。

## 现状
- 零依赖成立（无 node_modules；WebSocket 帧解析、DQN、进化算法全手写）
- server.js 215 行：静态服务（15 种 MIME、路径穿越拦截、/.git 403）+ 手写 WS 中继 + 端口递增回退
- 启动自检：server.js:13-23 缺 setMajorSim 时 spawnSync 自动改写 src/modes.js（隐患）
- npm test = 41 段 `&&` 手写链（37 个文件在链内，79 个文件总存）；check = 90 段 `&&`
- config.js 196KB 之谜：93% 是 4 行神经网络权重（183KB）
- CI 已有（check+test+smoke，Node 20）

## 问题
- 2.1 测试缺口：grenades.js / lan.js / server.js / dqn.js / ai-genome.js / persona.js / ai/buys.js 零测试（高危模块）；5 个真回归测试（audio-patch/official-maps/mapswitch/timing/verify-awp）游离链外；10 个 src 模块漏出 check
- 2.2 服务器：全量 no-cache（7.5MB 纹理每次重拉）、无压缩、无安全头、WS 无帧长/房间/Origin 限制、无 HTTPS、start.bat 硬编码 8080（端口回退后打开错误页）、运行时自改源码
- 2.3 文档漂移：帮助文案"先赢 13 回合"vs 配置 MR9；DESIGN.md 自称 v3.0 实为 v2.0.0、架构图过时（ai.js 单文件）；README 无启动/测试/结构说明；无 CHANGELOG/LAN 协议/存档 schema 文档
- 2.4 根目录 18 个垃圾文件 593KB（*.tmp.mjs、config.js.bak、net-*.json、major-*.json、sim-real*.log）
- 2.5 **git 174 个文件未提交**（career/ranked/duel/render3d 整套 untracked）——数据安全最优先
- 2.6 package.json description GBK 乱码；main.js 每帧 try/catch 吞错无上报

## 优化优先级
| P | 项 | 成本 |
|---|---|---|
| P0 | git 全量提交 + .gitignore 扩写 + 垃圾清理 | 0.5h |
| P0 | test/check 脚本化自动发现（glob+spawnSync） | 4h |
| P0 | 修 UI 文案漂移 + package.json 乱码 | 0.5h |
| P0 | 补 server/grenades/lan/dqn 核心测试 | 1-2d |
| P1 | server gzip+缓存头+安全头+WS 限制 | 0.5-1d |
| P1 | 接入 5 个游离回归测试 | 0.5h |
| P1 | config.js 权重外移 JSON（-93% 体积，config.js.bak 删除） | 2-3h |
| P2 | CHANGELOG + DESIGN 对齐 + LAN 协议文档 | 3h |
| P2 | PWA 离线 + 触屏 | 1-2d |

## 拓展（摘选）
CI 覆盖报告（node --test --experimental-test-coverage 零依赖）、性能基准回归（timing.mjs 接入 CI）、JSDoc+tsc --checkJs 渐进类型、esbuild 可选打包（devDependency 不影响零依赖）、版本发布流程（tag+Release）、PWA manifest+sw.js（单机游戏最理想场景）、node --watch 热重载、云存档导出、i18n.js 词表、?perf URL 参数 FPS 曲线、权重部署流水线（训练→校验→写 JSON→PR）、nightly 训练验收。
