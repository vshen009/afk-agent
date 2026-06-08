import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeIssue, summarize, printMarkdown } from "./scan-ready-issues.mjs";

const ignoreMatcher = (label) => ({ shouldIgnore: () => ({ ignored: true, matchedLabel: label }) });

function capture(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

function makePlan(issues) {
  return {
    mode: "plan",
    summary: summarize(issues),
    batchBranch: "agent/test",
    maxParallel: 2,
    prMergeStrategy: "auto-merge task PRs into batch branch; batch branch → main stays human",
    cache: { hits: 0, misses: 0 },
    issues,
    dependencyGraph: issues.map((i) => ({
      issue: i.number,
      title: i.title,
      blockers: i.blockers ?? [],
      openBlockers: i.openBlockers ?? [],
    })),
    executionWaves: [],
    executionPlan: [],
  };
}

test("an issue matched by .afkignore lands in the ignored bucket with the afkignore reason", () => {
  const issue = {
    number: 7,
    title: "Spam",
    labels: [{ name: "wontfix" }],
    body: "## What to build\nx\n## Acceptance criteria\n- [ ] do it\n",
  };
  const result = analyzeIssue(issue, new Map(), ignoreMatcher("wontfix"));
  assert.equal(result.bucket, "ignored");
  assert.equal(result.reasons[0], "matches .afkignore: wontfix");
});

test("an ignored issue's reasons contain only the afkignore reason, even when otherwise ineligible", () => {
  // No ready-for-agent label and no sections → would normally be ineligible
  // with several reasons; the afkignore short-circuit must replace all of them.
  const issue = { number: 8, title: "Bad", labels: [{ name: "wontfix" }], body: "nothing useful here" };
  const result = analyzeIssue(issue, new Map(), ignoreMatcher("wontfix"));
  assert.equal(result.bucket, "ignored");
  assert.deepEqual(result.reasons, ["matches .afkignore: wontfix"]);
});

test("summarize includes an ignored count", () => {
  const s = summarize([{ bucket: "ignored" }, { bucket: "ignored" }, { bucket: "eligible" }]);
  assert.equal(s.ignored, 2);
});

test("printMarkdown renders a ## Ignored (.afkignore) section listing matched issues + reasons", () => {
  const out = capture(() =>
    printMarkdown(
      makePlan([
        {
          number: 7,
          title: "Spam",
          bucket: "ignored",
          reasons: ["matches .afkignore: wontfix"],
          blockers: [],
          openBlockers: [],
        },
      ]),
    ),
  );
  assert.match(out, /## Ignored \(\.afkignore\)/);
  assert.match(out, /#7 Spam — matches \.afkignore: wontfix/);
  assert.match(out, /^- ignored: 1$/m);
});

test("with nothing ignored, output has no Ignored section and no ignored summary line (byte-identical)", () => {
  const out = capture(() =>
    printMarkdown(
      makePlan([
        {
          number: 1,
          title: "Normal",
          bucket: "ineligible",
          reasons: ["missing ready-for-agent label"],
          blockers: [],
          openBlockers: [],
        },
      ]),
    ),
  );
  assert.doesNotMatch(out, /Ignored/);
  assert.doesNotMatch(out, /^- ignored:/m);
});
