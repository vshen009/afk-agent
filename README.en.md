# vstack

> 📖 中文: [`README.md`](README.md)

**vstack** is a personal collection of agent skills. One git repo holds the skills I
reach for, each self-contained and discoverable by both **Codex** (`~/.codex/skills/`)
and **Claude** (`~/.claude/skills/`).

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
| [`afk-agent`](skills/afk-agent/) | AFK development orchestrator for GitHub issues: scans ready-for-agent work, plans by dependency/priority, implements each issue via TDD, verifies acceptance criteria (L1 grep / L2 test / L3 browser / L4 human-only), ticks verified boxes, and opens auto-merge PRs into a shared batch branch | [README](skills/afk-agent/README.en.md) |

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
