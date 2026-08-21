# vstack

> 📖 English: [`README.en.md`](README.en.md)

**vstack** 是我自己的 agent 技能集合仓库。一个 git 仓库装着一堆顺手的技能，
每个都各自独立，**Codex**（`~/.codex/skills/`）和 **Claude**（`~/.claude/skills/`）都能发现。

这里的技能有些是我自己写的，有些是从社区和网上收集来的——不全是原创，只是我用着比较顺手的一套工具集。原作者的版权归原作者。

---

## 来源与致谢

`grill-me`、`grill-with-docs`、`grilling`、`domain-modeling`、`to-spec`、`to-tickets`、`tdd`、`diagnosing-bugs` 和 `handoff` 来自或同步自 [Matt Pocock 的 skills 仓库](https://github.com/mattpocock/skills)。本仓库保留其原始版权，并在需要时提供兼容入口。

---

## AI 时代，开发者角色正在经历一场换挡

<img src="img/ChatGPT Image 2026年6月8日 14_21_36.png" width="600" alt="马车与 AI 开发室的时代对照" />

一百年前，街上跑的是马车。驾驶马车是一门手艺：要懂马的性格、会判断路况、知道何时勒缰何时松绳，还得会喂料、换蹄铁、在马疲了的时候停下来休息。那些驾驶技术娴熟的人，靠的是多年和马打交道积累下来的直觉。

汽车出现以后，出行这件事本质上没变，还是从 A 到 B。但驾驶技能体系完全不一样了。不需要再懂马，但需要懂离合、节气门、看地图、遵守交通规则。更关键的是，你坐进驾驶室，你和车是一对协作关系：你给方向，车给力量。能力强的司机，靠的是把车用好，自己跑多快这件事，和他没关系。

软件开发正在经历同一种换挡。

过去，一个好工程师的核心能力是"写出正确代码的能力"。每一行逻辑自己把关，每一个边界情况自己想清楚，每一处优化自己来。开发的速度和质量，主要取决于一个人的编码功力有多深。这是马车时代，驾驭的能力和马力本身几乎是同一件事。

现在，AI 可以写代码，可以跑测试，可以同时并行处理十几个任务。但它不知道你真正想要什么，不知道哪个功能值得做、哪个 edge case 重要、哪个验收标准算通过。把一个模糊的想法交给 AI，得到的是一个模糊的实现。

工程师的价值重心，正在从"执行层"迁移到"判断层"。

需求想清楚了吗？任务拆得够细够独立吗？验收标准有没有说清楚"什么叫完成"？这些问题，AI 答不上来，那是只有你才能做的事。能把这些做好的工程师，才是拿到了新时代驾照的人。

---

## 从想法到交付：一次完整的 AI 开发冲刺

<img src="img/ChatGPT Image 2026年6月8日 14_36_25.png" width="600" alt="从 /grill-me 到 main branch 的完整 AI 开发流程图示" />

vstack 里的技能，是按照一套真实的开发节奏设计的。从需求的第一个模糊念头，到代码合进主分支，每一步都有对应的工具接手。整个循环大概是这样：

```
/grill-me  →  /to-spec  →  /to-tickets  →  /afk-agent
需求对齐       生成 PRD     拆解任务       并行开发 + 验收
```

**第一步：`/grill-me` — 把想法逼清楚**

很多开发问题，根子不在代码，在需求没想透。`/grill-me` 会扮演一个不好糊弄的产品经理，一个问题一个问题地往下问：边界在哪儿？这个功能服务谁？异常情况怎么处理？对话结束的时候，你脑子里那个"大概是这样"的想法，会变成一个每个决策分支都讨论过的方案。

**第二步：`/to-prd` — 把共识落成文档**

对齐了之后，`/to-prd` 把这次对话的上下文整理成一份结构化的 PRD，推进 issue tracker，打上 `ready-for-agent` 标签。这份文档是后续所有开发工作的基准，相当于给整个流程钉下一个参照点，不管后面 Agent 怎么跑，都有东西可以对齐。

**第三步：`/to-tickets` — 切成可以独立交付的任务**

PRD 是整体，issue 是切片。`/to-tickets` 用 tracer-bullet 方式把 PRD 打散：每个 issue 垂直穿透所有层，小到一个 PR 就能搞定，带着明确的验收标准，什么叫做完、怎么验、人工要不要介入，都要说清楚。依赖关系也在这一步理清楚，为并行开发做好准备。

**第四步：`/afk-agent` — 让 Agent 接管，你去干别的**

issue 列表备好之后，`/afk-agent` 开始工作。它扫描 `ready-for-agent` 的 issue，按依赖和优先级排队，逐个 TDD 实现，跑多级验收（L1 代码搜索 / L2 自动化测试 / L3 浏览器验证）。验收过的 issue 会在上面打勾，然后开 PR 合进 batch 分支。整个过程不需要你守着。AFK 就是字面意思：Away From Keyboard。

**最后一步：人工验收，合进主分支**

需要人工判断的 issue（L4）会被单独标出来等你回来看。其余的，自动合并。一次冲刺结束。

这套流程不改变"谁来做决策"，只改变"谁来执行代码"。需求要怎么拆、任务要怎么排、验收算不算通过，这些判断还是你的事。代码本身，交出去就好。

---

## 安装

```bash
git clone https://github.com/vshen009/vstack.git ~/vstack
cd ~/vstack && ./install.sh
```

`install.sh` 会把 `skills/` 下的每个技能软链进这两个发现目录，重复跑也没事（幂等）。
卸载用 `./uninstall.sh`，它只删指回本仓库的软链，不碰真实目录。

Windows 请在 vstack 克隆目录运行：

```powershell
.\install.ps1
```

它会优先建立目录符号链接，权限不允许时改用 directory junction。已有的实体技能目录会移动到 `~/.vstack-backups/<时间戳>/`，不会直接删除；可先用 `.\install.ps1 -WhatIfMode` 预览。

## 版本检查与更新

每个 vstack 技能运行前都会检查本地 `main` 与 `origin/main` 的版本，显示提交号、时间和摘要：

- 已是最新：直接继续任务；
- 发现更新：提示选择“现在更新”或“本次跳过”；
- 现在更新：仅在工作树干净且位于 `main` 时执行 `git pull --ff-only origin main`；
- 远端不可访问：说明检查失败后继续当前任务，不阻塞离线使用。

更新守卫由 [`vstack-update`](skills/vstack-update/) 统一提供，所有技能复用同一实现。

## 技能索引

| 技能 | 说明 | 文档 |
|------|------|------|
| [`afk-agent`](skills/afk-agent/) | GitHub issue 的 AFK 开发编排器：扫描 ready-for-agent issue、按依赖/优先级排程、逐个 TDD 实现、验证验收标准（L1 grep / L2 test / L3 browser / L4 人工）、勾选已验证项、开 auto-merge PR 到共享 batch 分支 | [GUIDE](skills/afk-agent/GUIDE.md) |
| [`grill-me`](skills/grill-me/) | 计划/设计追问的入口；调用实际的 `grilling` 技能 | — |
| [`grilling`](skills/grilling/) | 按设计树的可决策前沿分轮追问，直至达成共识 | — |
| [`grill-with-docs`](skills/grill-with-docs/) | 结合领域建模来追问，并就地维护 CONTEXT.md / ADR | — |
| [`domain-modeling`](skills/domain-modeling/) | 建立和维护项目术语、CONTEXT.md 与 ADR | — |
| [`to-spec`](skills/to-spec/) | 将已讨论的上下文整理为规格说明并发布到 issue tracker | — |
| [`to-tickets`](skills/to-tickets/) | 用 tracer-bullet 垂直切片拆为带阻塞关系的 tickets | — |
| [`tdd`](skills/tdd/) | 测试驱动开发：red-green-refactor 循环 | — |
| [`diagnosing-bugs`](skills/diagnosing-bugs/) | 硬骨头 bug / 性能回归的纪律化诊断循环：复现 → 最小化 → 假设 → 埋点 → 修复 → 回归测试 | — |
| [`handoff`](skills/handoff/) | 把当前对话压缩成交接文档，供另一个 agent 接手 | — |
| [`cn-humanizer`](skills/cn-humanizer/) | 中文文本拟人化 + 英中翻译去翻译腔：识别 20+ 种中文 AI 写作特征，改写成自然母语表达 | — |
| [`humanizer-zh`](skills/humanizer-zh/) | 中文长文去 AI 味：博客/随笔/非虚构等，含多位作者风格语料（references/voices/） | — |
| [`image2-api`](skills/image2-api/) | 通用 OpenAI 兼容 Image2 客户端：支持文生图、图生图与蒙版编辑，可配置接口地址、鉴权和模型 | [README](skills/image2-api/README.md) |

## 加一个新技能

```bash
mkdir -p ~/vstack/skills/<新技能名>
# 在里面写 SKILL.md（必需）+ 可选的 scripts/、references/、package.json
cd ~/vstack && ./install.sh        # 自动软链进 Codex 和 Claude
```

之后即可在 Codex / Claude 里用 `/<新技能名>` 触发。

## 测试

```bash
cd ~/vstack && ./test.sh           # 对每个带 package.json 的技能跑 node --test
```

## 目录结构

```
vstack/
├── install.sh        软链每个技能进 ~/.codex/skills + ~/.claude/skills
├── uninstall.sh      移除这些软链
├── test.sh           遍历 skills/* 跑 node --test
└── skills/
    └── afk-agent/    每个技能自带 SKILL.md（+ scripts/ references/ package.json）
```
