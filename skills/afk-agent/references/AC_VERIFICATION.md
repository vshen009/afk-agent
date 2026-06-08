# Acceptance Criteria Verification

This is the authoritative reference for the AC verification phase. The scanner produces a classification plan; the executing agent runs the matching verification and ticks passing boxes.

## Levels

### L1 — Source-level claim (grep / AST)

The AC claims that a specific symbol, file, or literal exists in source. Verifiable by a deterministic match without running the code.

Examples:

- `` `ARTIFACTS` has single `bundle` entry with `key: "latest/aboutDuan-v1.0.0.zip"` ``
- `` `ArtifactName = "bundle"`; `isArtifactName` accepts only `"bundle"` ``
- `metadata.robots = { index: false, follow: false }`
- `No DB migration; existing schema unchanged`

Evidence: `path/to/file.ts:42 matched /pattern/`.

### L2 — Behavior assertion (passing test)

The AC claims a runtime behavior that is best verified by a test. Verified by discovering or producing a passing test whose assertion matches the AC text.

Examples:

- `/api/card/download returns presigned URL and decrements credits`
- `Bundle download → POST /api/card/download → triggers real download → credits decrement → history adds entry`
- `getCardStatus exposes a distinguishable failure reason`

Evidence: `tests/api/card-download.test.ts:18 "decrements credits when artifact=bundle" → passed`.

### L3 — Browser-observable behavior (headless reproduction)

The AC claims a UI behavior, layout property, or interactive flow that requires running the app in a browser. Verified via headless browser / preview MCP tools with a snapshot or screenshot.

Examples:

- `All 5 states render correctly (empty, prefilled, loading, success, error variants)`
- `375px mobile: receipt-side hidden, bundle bar stacks vertically, history rows single-column`
- `Inline error variants for invalid / revoked / exhausted, no toast, input outline turns red`

Evidence: a screenshot **committed to the task branch** under `.afk/evidence/issue-<n>/`, **embedded into the AC verification report** via a SHA-pinned raw URL + blob permalink, plus viewport + interaction trace. An L3 box may **not** be ticked unless its screenshot is committed and referenced in the report — see [L3 evidence upload (gating)](#l3-evidence-upload-gating).

### L4 — Human-only

The AC requires real third-party state, real money, real production data, or human judgment. The agent **never** ticks these and **never** decides they passed.

Examples:

- `End-to-end manual verify: input test card → see result → click bundle download → real zip downloads from R2 → credits go from N to N-1`
- `Founder verifies WeChat payment notification end-to-end with ¥0.01 test order`
- `Production canary smoke test passes on prod URL`

Evidence: not collected. Flagged in PR body for human verification on the batch branch before it merges to main.

## Author Tags (override heuristic)

The AC author may prefix any item with an explicit tag. Tags map to levels:

| Tag | Level |
|---|---|
| `[L1]` or `[code]` | L1 |
| `[L2]` or `[test]` | L2 |
| `[L3]` or `[browser]` | L3 |
| `[L4]` or `[manual]` | L4 |

Tagged ACs bypass heuristic classification. The displayed level in scanner output is suffixed with `*` (e.g. `[L4*]`) to mark explicit author tags.

## Heuristic Classifier (fallback)

Applied in order; first match wins.

1. **L4** — matches one of the manual-verification patterns (`manual verify`, `end-to-end manual`, `real (wechat|payment|transaction|wallet|scan)`, `production verification`, `人工`, `手工`, `真实.*(支付|付款|扫码|微信)`, `生产.*(验证|验收)`, `cannot be automated`, `requires founder/human/maintainer`)
2. **L3** — mentions `state`, `render`, `visible/hidden`, `viewport`, `\d+px`, `mobile/desktop`, `UI`, `click`, `toast`, `outline`, `css`, `layout`, `column`, `stack`, `screenshot`
3. **L2** — mentions `api`, `endpoint`, `return`, `response`, `status code`, `throws`, `accepts only`, `rejects`, `decrement`, `triggers`, `curl`, or HTTP verb + path (`POST /api/...`)
4. **L1** — default fallback

Because the heuristic is approximate, the executing agent should run an LLM cross-check on every heuristic-classified AC before verification. The LLM cross-check may upgrade a level (e.g. L1 → L3 because the AC is actually about UI behavior), but it may **never** downgrade an L4.

## L3 evidence upload (gating)

L3 evidence is only "concrete" once the screenshot is actually visible on GitHub — a local path like `runs/<id>/shot.png` proves nothing to a reviewer. So every L3 AC that passes must have its screenshot **committed to the task branch and embedded in the AC verification report**. The helper [`scripts/evidence.mjs`](../scripts/evidence.mjs) builds the paths and URLs deterministically.

Per passing L3 AC:

1. Capture the screenshot with the headless browser / preview MCP tool.
2. Stage it into the evidence dir:

   ```bash
   node ~/.codex/skills/afk-agent/scripts/evidence.mjs stage \
     --screenshot <captured.png> --issue <n> --ac-slug <slug> --viewport 375x812
   ```

   This copies it to `.afk/evidence/issue-<n>/<slug>-<viewport>.png` and `git add`s it.
3. Commit the evidence — a dedicated `chore(afk): L3 evidence #<n>` commit keeps it easy for the human to drop before the batch branch merges to `main` — and `git push` the task branch.
4. Build the embed line, pinned to the pushed commit:

   ```bash
   node ~/.codex/skills/afk-agent/scripts/evidence.mjs url \
     --sha "$(git rev-parse HEAD)" --issue <n> --ac-slug <slug> --viewport 375x812
   ```

   Use the `embedMarkdown` field as that AC's evidence line in the report.

**Gate.** If a passing L3 AC's screenshot cannot be captured, committed, or embedded, treat that AC as a verification failure and follow the [Failure Mode](#failure-mode): tick no boxes, apply `agent-failed`, open no PR. The gate is "committed + referenced", **not** "renders inline" — public repos render the raw URL inline in the comment; private repos do not (camo cannot authenticate), but the committed PNG is still visible in the PR's **Files changed** tab and the blob permalink opens for repo members, so the report always carries both the embed and the blob link.

## Tick-off Mechanics

For each AC whose verification passed:

1. Re-fetch the issue body via `gh issue view --json body`.
2. Locate the exact AC line. The match must be unique within the body; if it is not, abort and comment for human review.
3. Replace `- [ ]` with `- [x]` on that one line only. Preserve the surrounding AC text exactly (including code spans, links, and unicode).
4. Re-validate the new body against a diff: only the single checkbox state should change.
5. Push the updated body via `gh issue edit --body-file <tmp>`.

After all eligible ticks succeed, post the AC verification report comment.

## AC Verification Report (comment template)

This is **one of four comments** the agent posts on the issue. The full timeline (claim → AC verification report → completion / failure) is defined in [`OPERATING_POLICY.md`](OPERATING_POLICY.md) under "Comment Timeline". This section covers only the AC report itself — the completion comment (PR link + close strategy) is a separate, later comment.



```markdown
> *AC verification report — afk-agent run <run-id>, issue #<n>*

**Rollup:** L1 N · L2 N · L3 N · L4 N · ticked: N / N pending

### Backend

- [x] L1 — ARTIFACTS has single bundle entry
  - evidence: `src/lib/payment/artifacts.ts:8` matched `bundle: {`
- [x] L2 — /api/card/download serves bundle presigned URL
  - evidence: `tests/api/card-download.test.ts:42` "serves bundle URL" passed

### Download page UI

- [x] L3 — 375px mobile receipt-side hidden
  - evidence: ![375px mobile receipt-side hidden — 375x812](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/.afk/evidence/issue-<n>/mobile-receipt-hidden-375x812.png) ([view on GitHub](https://github.com/<owner>/<repo>/blob/<sha>/.afk/evidence/issue-<n>/mobile-receipt-hidden-375x812.png)), viewport 375×812
- [ ] L4 — End-to-end manual verify (real zip downloads from R2)
  - flagged for human verification before batch branch → main merge
```

## Failure Mode

If any L1/L2/L3 verification fails:

- no boxes are ticked in this run (no partial state on the issue)
- `agent-failed` label is applied; `agent-in-progress` is removed
- a single failure comment names the failed AC, the level, the verification command, and the observed output
- the task branch is left pushed but no PR is created
- the human re-queues the issue (after editing AC or fixing the cause) by removing `agent-failed` and `agent-claimed`
