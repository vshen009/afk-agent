---
name: afk-agent
description: AFK development orchestrator for GitHub issues. Scans ready-for-agent work, builds dependency and priority plans, runs TDD implementation per issue, verifies acceptance criteria (L1 grep / L2 test / L3 browser, with L4 human-only flagged), ticks verified AC checkboxes on the issue, and opens auto-merge PRs into a shared batch branch. Use when the user invokes /afk-agent, /afk agent, asks to scan AFK-ready GitHub issues, or wants semi-automated agent development.
---

# afk-agent

`afk-agent` orchestrates AFK (away-from-keyboard) development across multiple GitHub issues. The **scanner** is read-only — it produces a plan. The **calling agent** executes that plan: claims issues, implements via TDD, verifies acceptance criteria, ticks verified boxes on the issue body, and opens PRs that auto-merge into a shared batch branch.

Never PR to `main`. The batch branch → `main` step is always human.

## Quick Start

Run from the target repository:

```bash
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs
```

Useful modes:

```bash
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --issue 28
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --json
node ~/.codex/skills/afk-agent/scripts/scan-ready-issues.mjs --self-test
node ~/.codex/skills/afk-agent/scripts/slugify-batch-name.mjs "book-sale: shared nav/foot components"
```

## Interface

- `/afk-agent` or `/afk agent`: run a scan, present the plan, then execute it (claim → TDD → verify AC → tick boxes → PR with auto-merge).
- `/afk-agent scan`: read-only scan, no execution.
- `/afk-agent plan #<issue>`: focused plan for one issue (`--issue N`).
- `/afk-agent run`: execute the plan produced by the most recent scan.

## Required Repo Context

Before executing, read the repo's agent configuration when present:

- `AGENTS.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`
- `CONTEXT.md`
- relevant `docs/adr/*.md`

If the repo has framework-specific agent rules, obey them. For Next.js repos, read the relevant guide in `node_modules/next/dist/docs/` before writing code.

If `graphify-out/graph.json` exists, prefer `graphify query "<issue title>"` over raw source browsing during the planning phase.

## Plan Output

Every scan response includes:

- eligible, failed (needs human review), blocked, human-only, claimed, and otherwise ineligible issues
- dependency graph and recommended order
- max-2 concurrency execution waves
- batch branch: `agent/<theme-slug>`
- task branches: `afk/issue-<number>-<slug>`
- TDD plan for each eligible issue (first red test + red-green slices over pending non-L4 AC)
- AC verification plan per issue, grouped by `### subsection`, with each AC classified L1/L2/L3/L4 and the chosen verification approach
- execution plan: claim labels, branch commands, test gates, AC verification step, PR creation with `--auto --squash` into the batch branch

## Execution Policy

When executing a plan:

- every issue's implementation uses `/tdd`, driven by **pending** acceptance criteria (`- [ ]`); already-completed ACs (`- [x]`) are not retested
- claim lock uses label (`agent-claimed`, `agent-in-progress`) plus a structured comment
- max parallel issues per wave: 2
- after lint/test/build pass, the AC verification step runs:
  - L1 (grep/AST) and L2 (test) ACs are verified via concrete evidence references
  - L3 (browser) ACs are verified via headless browser snapshot/screenshot
  - L4 (human-only) ACs are flagged in the PR body and never auto-ticked
- if **any** L1/L2/L3 AC fails → no PR, label `agent-failed`, comment failure details
- if all L1/L2/L3 AC pass → flip the matching `- [ ]` to `- [x]` on the issue body, post AC verification report, push branch, open PR with `gh pr merge --auto --squash --base agent/<theme-slug>`
- PRs are **not** drafts; auto-merge is enabled so the batch branch fills up without per-PR human review
- task PR body **must** contain `Closes #<issue>` (builds PR↔issue link; auto-closes the issue when the batch branch eventually merges to main)
- after queueing auto-merge, the agent posts a **completion comment** (PR link + auto-merge status + AC tick stats + L4 list + elapsed time) and polls up to 60s for `gh pr view --json state` to flip to `MERGED`; if merged within the window, the agent explicitly runs `gh issue close <n>` so the user sees the dev package as done immediately
- if the poll times out, the issue stays open; the next afk-agent run's **startup reconciliation** step closes any issue whose linked task PR has merged in the interim
- on failure, the agent posts a **failure comment** (failed step + error excerpt + task branch left pushed for inspection + recovery steps); the issue is **not** closed and zero AC checkboxes are flipped
- `main` is never a PR base and is never merged into automatically — that step stays human

## Acceptance Criteria Format Contract

The issue author guarantees every dev package contains a `## Acceptance criteria` section with checklist items (`- [ ]`). Subsections (`### Backend`, `### Download page UI`, etc.) are preserved in the verification report. ACs may carry explicit level tags that override the heuristic classifier:

- `- [ ] [L1] ...` or `- [ ] [code] ...` → grep/AST verification
- `- [ ] [L2] ...` or `- [ ] [test] ...` → automated-test verification
- `- [ ] [L3] ...` or `- [ ] [browser] ...` → headless browser verification
- `- [ ] [L4] ...` or `- [ ] [manual] ...` → human-only, flagged not ticked

Untagged ACs are classified by heuristic; the executing agent does an LLM cross-check before running the verification.

## References

- [Operating policy](references/OPERATING_POLICY.md) — allowed/forbidden actions, claim lock, branch & PR rules, partial-fail policy
- [Issue selection](references/ISSUE_SELECTION.md) — bucket rules, subsection-grouped AC parsing
- [TDD requirements](references/TDD_REQUIREMENTS.md) — TDD + AC verification phase contract
- [AC verification](references/AC_VERIFICATION.md) — full L1–L4 taxonomy, evidence shape, tick-off mechanics
