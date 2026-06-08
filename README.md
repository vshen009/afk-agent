# vstack

> 📖 English: [`README.en.md`](README.en.md)

**vstack** 是一个个人 agent 技能集合仓库。一个 git 仓库装一堆我自己顺手的技能，
每个技能各自独立、可同时被 **Codex**（`~/.codex/skills/`）和 **Claude**（`~/.claude/skills/`）发现。

## 安装

```bash
git clone https://github.com/vshen009/vstack.git ~/vstack
cd ~/vstack && ./install.sh
```

`install.sh` 会把 `skills/` 下每个技能软链接进两个发现目录。可重复运行（幂等）。
卸载用 `./uninstall.sh`（只删指回本仓库的软链，不碰真实目录）。

## 技能索引

| 技能 | 说明 | 文档 |
|------|------|------|
| [`afk-agent`](skills/afk-agent/) | GitHub issue 的 AFK 开发编排器：扫描 ready-for-agent issue、按依赖/优先级排程、逐个 TDD 实现、验证验收标准（L1 grep / L2 test / L3 browser / L4 人工）、勾选已验证项、开 auto-merge PR 到共享 batch 分支 | [README](skills/afk-agent/README.md) |
| [`grill-me`](skills/grill-me/) | 对计划/设计反复追问，逐个决策分支推敲，直到达成共识 | — |
| [`grill-with-docs`](skills/grill-with-docs/) | 结合项目领域模型与已记录决策来 grill 计划，并就地更新 CONTEXT.md / ADR | — |
| [`to-prd`](skills/to-prd/) | 把当前对话上下文整理成 PRD 并发布到 issue tracker | — |
| [`to-issues`](skills/to-issues/) | 用 tracer-bullet 垂直切片把计划/spec/PRD 拆成可独立认领的 issue | — |
| [`tdd`](skills/tdd/) | 测试驱动开发：red-green-refactor 循环 | — |
| [`diagnose`](skills/diagnose/) | 硬骨头 bug / 性能回归的纪律化诊断循环：复现 → 最小化 → 假设 → 埋点 → 修复 → 回归测试 | — |

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
