# afk-agent

[English →](GUIDE.en.md)

> 面向 GitHub issue 的 **AFK（离开键盘）开发编排器**：扫描「就绪可交给 agent」的 issue，按依赖与优先级排期，逐个 issue 跑 TDD 实现、验证验收标准（AC）、在 issue 上勾选已验证项，并开启自动合并到共享**批次分支**的 PR。

## 项目简介

`afk-agent` 把「一批 GitHub issue」自动推进成「一条等待人工 review 的批次分支」。它分成两半，职责清晰：

- **扫描器（scanner）**：`scripts/scan-ready-issues.mjs`，**只读**。它只读取 issue、计算依赖与优先级、产出一份计划——**自己绝不推送、绝不评论、绝不改任何东西**。
- **执行 agent（executing agent）**：调用方（如 Claude / Codex）。它执行计划——认领 issue、用 TDD 实现、验证验收标准、勾选已验证的复选框、开启自动合并到批次分支的 PR。

**批次分支 → `main` 这一步永远由人来做**：agent 绝不把 PR 开到 `main`，也绝不自动并入 `main`。

## 快速开始

在**目标仓库**根目录运行扫描器：

```bash
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs
```

常用模式：

```bash
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --issue 28
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --json
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --self-test
```

在 Claude / Codex 中可直接用 `/afk-agent`（或 `/afk agent`）触发：先扫描、展示计划，再执行。

## 工作模式

扫描器只读、产出计划；执行 agent 按计划推进。单个 issue 的完整生命周期：

1. **扫描（scan）**——筛选带 `ready-for-agent`、无开放阻塞、含「构建什么」与验收标准 checklist 的 issue。
2. **认领（claim）**——打上 `agent-claimed` / `agent-in-progress` 标签并发认领评论，作为并发锁。
3. **TDD**——只针对**未完成**的验收项（`- [ ]`）写红测试，再做最小实现转绿。
4. **验证验收标准（AC verify）**——逐项分级核验：**L1** grep/AST、**L2** 测试、**L3** 无头浏览器、**L4** 仅人工（永不自动勾选）。
5. **勾选复选框**——只把核验通过的 `- [ ]` 翻成 `- [x]`，并回贴一份带证据的核验报告。
6. **自动合并 PR**——把任务分支 PR 合入批次分支 `agent/<theme-slug>`（PR 体内含 `Closes #<issue>`）。

**扫描器自己绝不推送；批次分支 → `main` 始终是人工 review 与合并。** 任一 L1/L2/L3 核验失败则不建 PR、打 `agent-failed`、不勾任何复选框。

## `.afkignore`

`.afkignore` 是放在**仓库根目录**的「按标签忽略」清单（gitignore 风格，完全可选）。命中的 issue 会在其他资格判断**之前**被挡下，落入计划里的 `Ignored (.afkignore)` 分组——可见，但不会被认领或实现。

语法（v1，刻意极简）：每行一个标签；`#` 开头为注释；空行忽略；每行首尾空白去除；与 `issue.labels[].name` **精确、区分大小写**匹配；无通配符 / 正则 / 取反。示例：

```
# 把仍需人来处理的工作挡在 AFK 之外
ready-for-human
needs-info
wontfix
```

模板见 [`references/.afkignore.example`](references/.afkignore.example)。仓库本身不提交任何真实的 `.afkignore`。

## 缓存

扫描器的只读 `gh` 调用（`gh issue list` / `gh issue view`）会被磁盘缓存：短 TTL 窗口内的重复扫描直接读盘，而不再打 GitHub API。

- **缓存内容**：仅缓存只读调用。所有改动型调用（打标签、评论、建 PR、合并）**永不**走缓存。
- **默认 TTL**：**300 秒**（可用 `AFK_CACHE_TTL` 环境变量覆盖）。
- **缓存位置**：`~/.cache/afk-agent/<owner-name>/`，其中 `<owner-name>` 由 `git remote get-url origin` 推导并清洗为文件名安全的 slug。
- **CLI 开关**：
  - `--no-cache` — 绕过缓存，强制实时 `gh` 调用；
  - `--cache-ttl <秒>` — 覆盖本次运行的 TTL；
  - `--clear-cache` — 清空本仓库的缓存后退出；
  - `--cache-stats` — 打印本仓库缓存统计后退出。

## 参考

- [`SKILL.md`](SKILL.md) — 完整的 agent 合约（人读 README，agent 读 SKILL）
- [`references/OPERATING_POLICY.md`](references/OPERATING_POLICY.md) — 允许/禁止动作、认领锁、分支与 PR 规则、部分失败策略
- [`references/ISSUE_SELECTION.md`](references/ISSUE_SELECTION.md) — 分组规则、按子标题解析验收标准
- [`references/AC_VERIFICATION.md`](references/AC_VERIFICATION.md) — L1–L4 分级、证据形态、勾选机制
- [`references/TDD_REQUIREMENTS.md`](references/TDD_REQUIREMENTS.md) — TDD + 验收验证阶段合约
- [`references/.afkignore.example`](references/.afkignore.example) — `.afkignore` 模板
