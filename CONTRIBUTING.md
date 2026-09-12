# 参与指南（CONTRIBUTING）

适用于直接推送与 Fork PR 两种方式。**开工前请完整读完本文件**——这里的每一条都来自真实踩坑。

## 项目铁律

1. **禁止恢复/引用 3D 与第一人称渲染**。相关代码在 `attic/`（含恢复指南 `attic/README.md`），游戏固定 2D 俯视视角。不要 import attic 下任何模块，不要新增 fps 分支逻辑。
2. **每次 commit 前必须全绿**：
   ```bash
   npm run check        # 语法门禁（全文件 node --check）
   npm run check:arch   # 循环依赖守卫（新循环会拒绝）
   npm test             # 全量测试（自研 runner，禁止跳过失败）
   ```
3. **确定性模拟契约**（详见 `docs/ADR/0005-确定性模拟契约.md`）：
   - 游戏逻辑（非渲染）内禁止 `Math.random` / `Date.now` 写入对局状态；用 `ctx.rand`（seed 驱动）与 `game.time`
   - 特效一律拆成「纯 spec 函数 + 绘制函数」，spec 可被测试断言（参考 `src/*-fx.js` 与 `test/fx-*.mjs`）
   - 改动模拟逻辑时，跑一遍同 seed 双跑对比（参考 `test/manager-determinism.mjs`）
4. **直接推送只允许绿树**：本地三关没跑过不要 push。推送即触发 CI（`check → arch → test → train smoke`），红了立刻修或 revert。

## 分支与 PR 流程

- 维护者：`main` 直推（自治迭代管线），每次里程碑收尾打 tag。
- 协作者：Fork → 分支开发 → 向 `main` 发 PR → CI 绿 + 维护者 review 后合并。PR 请：
  - 一个 PR 一件事，标题用 conventional 风格（`feat(scope): …` / `fix(scope): …` / `docs: …`）
  - 描述里写清**动机**与**验证方式**（跑了哪些测试、采样了几局）
  - 新增行为要带契约测试（本项目惯例：纯函数导出 + `test/*.mjs` 断言）
- 大型/有争议的改动（经济数值、AI 行为、server 协议）请先开 Issue 讨论。

## 代码惯例速查

| 主题 | 惯例 |
|---|---|
| 模块 | ES Modules，零 npm 运行时依赖（新增依赖需 ADR） |
| 特效/渲染 | 纯 spec 函数（可测）+ draw 函数分离；渐变/字体等昂贵对象缓存 |
| 状态字段 | 新增存档字段必须进 `migrateManagerState` / `createGame` 声明链，兼容旧档 |
| 注释密度 | 与周边一致；只解释"为什么"，不复述"做了什么" |
| 提交信息 | `type(scope): 中文摘要`，正文列要点与验证结果 |

## 本地运行

```bash
npm start                                  # http://localhost:8080
node scripts/map-balance.mjs --runs 8      # 平衡采样（T 胜率 30-70% 区间外退出码 1）
npm run soak                               # 多图多难度无崩溃压测
node test/cdp-live-smooth.mjs              # 实机浏览器 60fps 冒烟（需本机 Edge/Chrome）
```

注意：`test/cdp-*.mjs` 报 "debugger not ready" 时先清理残留 headless 浏览器进程（会占 `%TEMP%/cdp-profile` 单例锁）。

## 已知悬而未决的设计决策

见 `docs/ADR/` 与 GitHub Issues 中标记 `design-needed` 的条目。动手前先查，避免重走已证伪的路线（例：atrium 平衡的地图调参路线已被数据证伪）。
