# Issue Selection

## Strict Eligibility

An issue is eligible only when all are true:

- has `ready-for-agent`
- does not have `ready-for-human`, `needs-info`, `needs-triage`, or `wontfix`
- does not have claim/active labels such as `agent-claimed`, `agent-in-progress`, or `agent-pr-open`
- has no open blockers in `Blocked by`
- includes a clear `What to build` section
- includes checklist-style acceptance criteria
- does not require external/manual work such as real payments, founder action, dashboard access, production-only verification, or human judgment

## Blocker Parsing

Parse blocker references from:

- a `## Blocked by` section
- inline `Blocked by #12`
- bullets such as `- #12`

Treat an issue as blocked when any referenced blocker issue is still open.

## Buckets

- `eligible`: strict eligibility passes
- `failed`: carries `agent-failed` label — a previous agent run failed, needs human review before re-queue (takes precedence over every other bucket)
- `blocked`: otherwise eligible but blocked by open issue references
- `humanOnly`: marked human-only or containing manual/external-only requirements
- `claimed`: already claimed or in progress
- `ineligible`: missing labels, missing sections, missing acceptance criteria, all acceptance criteria already completed, or conflicting state labels

## Completed Acceptance Criteria

Acceptance criteria checkboxes are split into `pending` (`- [ ] ...`) and `completed` (`- [x] ...`). TDD planning only consumes pending items. Completed items are surfaced as reference context but are not retested. If every criterion is already completed, the issue is moved to `ineligible` with reason `all acceptance criteria already completed`.

## Subsection Grouping

`## Acceptance criteria` may contain `### Backend`, `### Download page UI`, etc. The parser preserves these as ordered subsections. Each subsection carries its own L1/L2/L3/L4 rollup. Items written outside any `###` heading are grouped under an anonymous first subsection.

## Human-only Detection

The `humanOnly` bucket is now derived from **AC-level classification**, not body-wide text matching:

- if the issue has the `ready-for-human` label, it is humanOnly
- if **every pending AC** is classified `L4`, it is humanOnly
- otherwise, an issue with a mix of L1/L2/L3 and L4 ACs is **eligible** — L4 items are flagged in the PR body but not ticked

This means a dev package can contain a single "End-to-end manual verify" item without making the entire issue human-only. See [`AC_VERIFICATION.md`](AC_VERIFICATION.md) for the L1–L4 taxonomy.

## Priority

Sort eligible issues by:

1. no open blockers
2. dependency depth, shallowest first
3. smaller issue number first

Plan no more than 2 parallel issues in the first execution wave.
