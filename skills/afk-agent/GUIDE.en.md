# afk-agent

[中文 →](GUIDE.md)

> An **AFK (away-from-keyboard) development orchestrator** for GitHub issues: it scans "ready-for-agent" work, plans by dependency and priority, runs TDD per issue, verifies acceptance criteria (AC), ticks verified boxes on the issue, and opens auto-merge PRs into a shared **batch branch**.

## Overview

`afk-agent` drives a batch of GitHub issues forward into a single batch branch that waits for human review. It has two clearly separated halves:

- **Scanner**: `scripts/scan-ready-issues.mjs`, **read-only**. It only reads issues, computes dependencies and priority, and emits a plan — it **never pushes, comments, or mutates anything by itself**.
- **Executing agent**: the caller (e.g. Claude / Codex). It runs the plan — claiming issues, implementing via TDD, verifying acceptance criteria, ticking verified checkboxes, and opening PRs that auto-merge into the batch branch.

**The batch branch → `main` step is always human**: the agent never opens a PR against `main` and never merges into `main` automatically.

## Quick start

Run the scanner from the root of the **target repository**:

```bash
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs
```

Useful modes:

```bash
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --issue 28
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --json
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --self-test
```

In Claude / Codex you can trigger it with `/afk-agent` (or `/afk agent`): scan first, show the plan, then execute.

## How it works

The scanner is read-only and produces a plan; the executing agent drives it. The full lifecycle of one issue:

1. **Scan** — select issues labelled `ready-for-agent`, with no open blockers and a clear "what to build" plus a checklist of acceptance criteria.
2. **Claim** — add `agent-claimed` / `agent-in-progress` labels and post a claim comment as a concurrency lock.
3. **TDD** — write a red test for each **pending** acceptance criterion (`- [ ]`), then the smallest implementation that turns it green.
4. **AC verify** — classify and check each item: **L1** grep/AST, **L2** test, **L3** headless browser (the screenshot is committed to the task branch and embedded into the verification report), **L4** human-only (never auto-ticked).
5. **Tick checkboxes** — flip only the verified `- [ ]` to `- [x]` and post a verification report with evidence.
6. **Auto-merge PR** — merge the task-branch PR into the batch branch `agent/<theme-slug>` (the PR body carries `Closes #<issue>`).

**The scanner never pushes by itself; the batch branch → `main` is always human review and merge.** If any L1/L2/L3 check fails, no PR is created, the issue gets `agent-failed`, and no checkboxes are flipped.

## L3 evidence

L3 (browser-observable) acceptance criteria are proven with a screenshot. To make that proof visible on GitHub — not just a dangling local path — every passing L3 screenshot is **committed to the task branch** under `.afk/evidence/issue-<n>/` and **embedded into the AC verification report** via a commit-pinned raw URL plus a blob permalink. This is a hard gate: an L3 box is only ticked once its screenshot is committed and referenced in the report; if it can't be, the AC fails like any other. Public repos render the image inline in the comment; private repos show it in the PR's **Files changed** tab and via the blob link. The [`scripts/evidence.mjs`](scripts/evidence.mjs) helper builds the paths and URLs.

## `.afkignore`

`.afkignore` is a per-repo, gitignore-style list of labels placed in the **repository root** (fully opt-in). A matched issue is filtered out **before** any other eligibility check and lands in the plan's `Ignored (.afkignore)` bucket — visible, but never claimed or implemented.

Syntax (v1, intentionally minimal): one label per line; lines beginning with `#` are comments; blank lines are ignored; leading/trailing whitespace is stripped; matching is **exact and case-sensitive** against `issue.labels[].name`; no glob, regex, or negation. Example:

```
# keep human-owned work out of AFK runs
ready-for-human
needs-info
wontfix
```

See [`references/.afkignore.example`](references/.afkignore.example) for the template. No live `.afkignore` is committed to the skill repo itself.

## Cache

The scanner's read-only `gh` calls (`gh issue list` / `gh issue view`) are disk-cached: repeat scans within a short TTL window read from disk instead of hitting the GitHub API.

- **What is cached**: read-only calls only. Every mutating call (labels, comments, PR create, merge) **always** bypasses the cache.
- **Default TTL**: **300 seconds** (override with the `AFK_CACHE_TTL` env var).
- **Cache location**: `~/.cache/afk-agent/<owner-name>/`, where `<owner-name>` is derived from `git remote get-url origin` and sanitised to a filesystem-safe slug.
- **CLI flags**:
  - `--no-cache` — bypass the cache; force live `gh` calls;
  - `--cache-ttl <seconds>` — override the TTL for this run;
  - `--clear-cache` — delete this repo's cache, then exit;
  - `--cache-stats` — print this repo's cache statistics, then exit.

## References

- [`SKILL.md`](SKILL.md) — the full agent contract (humans read the README, agents read SKILL)
- [`references/OPERATING_POLICY.md`](references/OPERATING_POLICY.md) — allowed/forbidden actions, claim lock, branch & PR rules, partial-fail policy
- [`references/ISSUE_SELECTION.md`](references/ISSUE_SELECTION.md) — bucket rules, subsection-grouped AC parsing
- [`references/AC_VERIFICATION.md`](references/AC_VERIFICATION.md) — L1–L4 taxonomy, evidence shape, tick-off mechanics
- [`references/TDD_REQUIREMENTS.md`](references/TDD_REQUIREMENTS.md) — TDD + AC verification phase contract
- [`references/.afkignore.example`](references/.afkignore.example) — `.afkignore` template
