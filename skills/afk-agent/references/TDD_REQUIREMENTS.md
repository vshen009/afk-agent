# TDD Requirements

Every development task uses `/tdd`. The TDD phase is followed by an AC verification phase before any PR is opened.

## TDD Phase

Driven by **pending** acceptance criteria only (`- [ ]`). Already-completed ACs (`- [x]`) are kept as reference but not retested.

For every eligible issue, the plan produces:

- observable behaviors extracted from pending acceptance criteria
- first red test behavior (taken from the first non-L4 pending AC)
- red-green vertical slice order, capped at 8 slices, drawn from non-L4 pending AC
- list of L4 (human-only) ACs that will be flagged but not implemented as tests

## AC Verification Phase

Runs after `pnpm lint && pnpm test && pnpm build` (or the repo's overridden test gates) pass. Each pending AC is verified according to its level:

| Level | Verification | Evidence captured |
|---|---|---|
| **L1** grep/AST | Match a literal symbol, file content, or AST shape in source | file:line, matched snippet |
| **L2** test | A passing test asserts this behavior | test file:line, test name, test output |
| **L3** browser | Headless browser / preview reproduces the behavior | screenshot committed to the task branch under `.afk/evidence/issue-<n>/`, embedded via a SHA-pinned raw URL + blob link, viewport |
| **L4** human-only | Not executed by the agent | flagged in PR body for human |

Evidence references are stored in the AC verification report comment posted to the issue. L3 screenshots are committed to the task branch and embedded into that report (see `AC_VERIFICATION.md` "L3 evidence upload"); an L3 AC whose screenshot is not committed and embedded is treated as a verification failure.

## Tick-off Mechanics

After verification:

1. For every AC whose verification passed, the agent edits the issue body and flips that exact line's `- [ ]` to `- [x]`. AC text is never modified.
2. Before editing, the agent re-fetches the issue body; if the body changed since the planning read, the run aborts without ticking.
3. L4 items are never ticked, even if the agent believes the human verification could plausibly succeed.
4. After ticking, the agent posts a single AC verification report comment listing every AC (passed / failed / skipped-L4) with its evidence reference.

## Partial-fail Policy

If **any** L1/L2/L3 AC fails verification:

- the PR is not created
- the issue body is not edited (no boxes flipped in this run)
- `agent-failed` is applied, `agent-in-progress` removed
- a failure comment names the failed AC text, its level, the command that ran, and the observed output

This is the strict mode: partial AC delivery is treated as failure, not as incremental progress. Human intervention is required before the issue can be re-queued.

## PR Body Contract

Every task PR description includes:

- the run id
- `Closes #<issue>` on its own line (creates PR↔issue link in GitHub UI; provides fallback auto-close when the batch branch eventually merges to main — see `OPERATING_POLICY.md` "Completion & Issue Close")
- first failing test behavior
- test commands that passed
- AC verification rollup: `L1 N · L2 N · L3 N · L4 N (human-only flagged)`
- for each L3 AC, a link to its committed screenshot evidence (`.afk/evidence/issue-<n>/…`)
- explicit list of L4 ACs that need human verification before the batch branch merges to main

## Exception Rule

If a criterion is mis-classified (e.g. heuristic said L1 but the AC is actually L3), the executing agent's LLM cross-check should upgrade the level before verification runs. If the AC genuinely cannot be classified or verified, the agent must comment with a proposed reclassification and treat the run as failed — never silently tick an unverifiable AC.
