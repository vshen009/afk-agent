# vstack

> 📖 中文: [`README.md`](README.md)

**vstack** is a personal collection of agent skills. One git repo holds the skills I
reach for, each self-contained and discoverable by both **Codex** (`~/.codex/skills/`)
and **Claude** (`~/.claude/skills/`).

Some of these skills I wrote myself; others are collected from the community and around
the web. Not all original — just a toolkit I find handy. Copyright for collected skills
stays with their original authors.

## Install

```bash
git clone https://github.com/vshen009/vstack.git ~/vstack
cd ~/vstack && ./install.sh
```

`install.sh` symlinks every skill under `skills/` into both discovery dirs. Idempotent —
re-run any time. Use `./uninstall.sh` to remove the links (it only deletes symlinks that
point back into this repo, never a real directory).

## Skill index

| Skill | What it does | Docs |
|-------|--------------|------|
| [`afk-agent`](skills/afk-agent/) | AFK development orchestrator for GitHub issues: scans ready-for-agent work, plans by dependency/priority, implements each issue via TDD, verifies acceptance criteria (L1 grep / L2 test / L3 browser / L4 human-only), ticks verified boxes, and opens auto-merge PRs into a shared batch branch | [GUIDE](skills/afk-agent/GUIDE.en.md) |
| [`grill-me`](skills/grill-me/) | Interview you relentlessly about a plan/design, resolving each branch of the decision tree until shared understanding | — |
| [`grill-with-docs`](skills/grill-with-docs/) | Grill a plan against the project's domain model and recorded decisions, updating CONTEXT.md / ADRs inline | — |
| [`to-prd`](skills/to-prd/) | Turn the current conversation context into a PRD and publish it to the issue tracker | — |
| [`to-issues`](skills/to-issues/) | Break a plan/spec/PRD into independently-grabbable issues using tracer-bullet vertical slices | — |
| [`tdd`](skills/tdd/) | Test-driven development: red-green-refactor loop | — |
| [`diagnose`](skills/diagnose/) | Disciplined diagnosis loop for hard bugs / perf regressions: reproduce → minimise → hypothesise → instrument → fix → regression-test | — |
| [`handoff`](skills/handoff/) | Compact the current conversation into a handoff document for another agent to pick up | — |
| [`cn-humanizer`](skills/cn-humanizer/) | Humanize Chinese text + de-translationese for EN→ZH: detects 20+ AI-writing tells, rewrites into natural native phrasing | — |
| [`humanizer-zh`](skills/humanizer-zh/) | Remove the AI flavour from long-form Chinese prose (blogs/essays/nonfiction); ships author-voice corpora under references/voices/ | — |
| [`image2-api`](skills/image2-api/) | Provider-neutral OpenAI-compatible Image2 client for generation, image-to-image, and masked edits with configurable endpoints, auth, and model | [README](skills/image2-api/README.md) |

## Add a new skill

```bash
mkdir -p ~/vstack/skills/<name>
# add SKILL.md (required) + optional scripts/, references/, package.json
cd ~/vstack && ./install.sh        # auto-links into both Codex and Claude
```

Then trigger it with `/<name>` in Codex / Claude.

## Test

```bash
cd ~/vstack && ./test.sh           # runs node --test for each skill with a package.json
```

## Layout

```
vstack/
├── install.sh        symlink each skill into ~/.codex/skills + ~/.claude/skills
├── uninstall.sh      remove those symlinks
├── test.sh           run node --test across skills/*
└── skills/
    └── afk-agent/    each skill carries its own SKILL.md (+ scripts/ references/ package.json)
```
