#!/usr/bin/env node

import { execFileSync } from "node:child_process";

import {
  cachedGh,
  clearCache,
  cacheStats,
  repoIdFromRemote,
  resolveTtlSeconds,
} from "./gh-cache.mjs";

const DISQUALIFYING_LABELS = new Set([
  "ready-for-human",
  "needs-info",
  "needs-triage",
  "wontfix",
]);

const CLAIM_LABELS = new Set([
  "agent-claimed",
  "agent-in-progress",
  "agent-pr-open",
]);

const FAILED_LABEL = "agent-failed";

const MANUAL_PATTERNS = [
  /cannot be automated/i,
  /requires? (the )?(founder|human|maintainer)/i,
  /real .*(wechat|payment|transaction|wallet|scan)/i,
  /¥0\.01/,
  /production verification/i,
  /manual(ly)?\s+verif/i,
  /end-to-end\s+manual/i,
  /人工/,
  /手工/,
  /真实.*(支付|付款|扫码|微信)/,
  /生产.*(验证|验收)/,
];

const LEVEL_APPROACH = {
  L1: "grep / AST match against source files",
  L2: "passing test asserts this behavior",
  L3: "headless browser / preview reproduction with snapshot or screenshot",
  L4: "HUMAN-ONLY — never auto-ticked, flagged in PR body",
};

const EXPLICIT_TAG_MAP = {
  code: "L1",
  test: "L2",
  browser: "L3",
  manual: "L4",
  l1: "L1",
  l2: "L2",
  l3: "L3",
  l4: "L4",
};

function main(argv) {
  const args = parseArgs(argv);
  if (args.selfTest) {
    runSelfTest();
    return;
  }

  const repoId = repoIdFromRemote();

  if (args.clearCache) {
    const removed = clearCache(repoId);
    console.log(`Cleared ${removed} cache entr${removed === 1 ? "y" : "ies"} for ${repoId}.`);
    return;
  }

  if (args.cacheStats) {
    const stats = cacheStats(repoId);
    const oldest = stats.oldestAgeMs == null ? "n/a" : `${Math.round(stats.oldestAgeMs / 1000)}s`;
    console.log(
      `Cache stats for ${repoId}: hit ${stats.hits} / miss ${stats.misses}; ${stats.entries} entries; oldest ${oldest}.`,
    );
    return;
  }

  const cacheRunStats = { hits: 0, misses: 0 };
  const cacheOpts = {
    executor: gh,
    ttlSeconds: resolveTtlSeconds({ noCache: args.noCache, cacheTtl: args.cacheTtl }),
    repoId,
    stats: cacheRunStats,
  };

  const limit = args.limit ?? "500";
  const singleIssue = args.issue;

  const issues = singleIssue ? [viewIssue(singleIssue, cacheOpts)] : listIssues(limit, cacheOpts);
  if (!singleIssue && issues.length >= Number(limit)) {
    process.stderr.write(
      `warning: fetched ${issues.length} issues at --limit ${limit}; some open issues may be missing. Re-run with a higher --limit.\n`,
    );
  }
  const blockerStates = loadBlockerStates(issues, cacheOpts);
  const analyzed = issues.map((issue) => analyzeIssue(issue, blockerStates));
  const eligible = analyzed.filter((issue) => issue.bucket === "eligible");
  const batchSlug = buildBatchSlug(eligible.length > 0 ? eligible : analyzed);
  const plan = {
    mode: "plan",
    generatedAt: new Date().toISOString(),
    summary: summarize(analyzed),
    batchBranch: `agent/${batchSlug}`,
    maxParallel: 2,
    prMergeStrategy: "auto-merge task PRs into batch branch; batch branch → main stays human",
    cache: { hits: cacheRunStats.hits, misses: cacheRunStats.misses },
    issues: analyzed,
    dependencyGraph: analyzed.map((issue) => ({
      issue: issue.number,
      title: issue.title,
      blockers: issue.blockers,
      openBlockers: issue.openBlockers,
    })),
    executionWaves: buildExecutionWaves(analyzed),
    executionPlan: buildExecutionPlan(eligible, batchSlug),
  };

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    printMarkdown(plan);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2));
}

export function parseArgs(argv) {
  const parsed = { json: false, noCache: false, clearCache: false, cacheStats: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--limit") parsed.limit = argv[++index];
    else if (arg === "--issue") parsed.issue = normalizeIssueNumber(argv[++index]);
    else if (arg === "--self-test") parsed.selfTest = true;
    else if (arg === "--no-cache") parsed.noCache = true;
    else if (arg === "--cache-ttl") parsed.cacheTtl = argv[++index];
    else if (arg === "--clear-cache") parsed.clearCache = true;
    else if (arg === "--cache-stats") parsed.cacheStats = true;
    else if (/^#?\d+$/.test(arg)) parsed.issue = normalizeIssueNumber(arg);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(
    [
      "Usage: scan-ready-issues.mjs [--issue 26] [--limit 100] [--json] [--self-test]",
      "                             [--no-cache] [--cache-ttl <seconds>] [--clear-cache] [--cache-stats]",
      "",
      "Read-only gh calls are disk-cached under ~/.cache/afk-agent/<repoId>/ (default TTL 300s,",
      "override with the AFK_CACHE_TTL env var). Cache flags:",
      "  --no-cache             bypass the cache; force live gh calls (TTL 0)",
      "  --cache-ttl <seconds>  override the cache TTL for this run",
      "  --clear-cache          delete all cache entries for this repo, then exit",
      "  --cache-stats          print cache statistics for this repo, then exit",
    ].join("\n"),
  );
}

function normalizeIssueNumber(value) {
  return String(value ?? "").replace(/^#/, "");
}

export function listIssues(listLimit, cacheOpts = {}) {
  const output = cachedGh(
    [
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      String(listLimit),
      "--json",
      "number,title,body,labels,assignees,milestone,comments,state",
    ],
    cacheOpts,
  );
  return JSON.parse(output);
}

export function viewIssue(number, cacheOpts = {}) {
  const output = cachedGh(
    [
      "issue",
      "view",
      String(number),
      "--json",
      "number,title,body,labels,assignees,milestone,comments,state",
    ],
    cacheOpts,
  );
  return JSON.parse(output);
}

function viewIssueState(number, cacheOpts = {}) {
  try {
    const output = cachedGh(["issue", "view", String(number), "--json", "number,title,state"], cacheOpts);
    return JSON.parse(output);
  } catch {
    return { number: Number(number), title: null, state: "UNKNOWN" };
  }
}

// Raw, uncached gh executor. The read-only scanner calls above route through
// `cachedGh`; this stays the executor of record and the path for any future
// mutating gh call (label edit, comment, PR create/merge), which must never be cached.
function gh(commandArgs) {
  return execFileSync("gh", commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function loadBlockerStates(rawIssues, cacheOpts = {}) {
  const blockerNumbers = new Set();
  for (const issue of rawIssues) {
    for (const blocker of parseBlockers(issue.body ?? "")) {
      blockerNumbers.add(blocker);
    }
  }

  const states = new Map();
  for (const blocker of blockerNumbers) {
    states.set(blocker, viewIssueState(blocker, cacheOpts));
  }
  return states;
}

function analyzeIssue(issue, blockerStates) {
  const labels = (issue.labels ?? []).map((label) => label.name ?? label);
  const labelSet = new Set(labels);
  const body = issue.body ?? "";
  const blockers = parseBlockers(body);
  const openBlockers = blockers.filter((number) => {
    const blocker = blockerStates.get(number);
    return !blocker || blocker.state !== "CLOSED";
  });
  const acData = extractAcceptanceCriteria(body);
  const pendingCriteria = acData.pending;
  const completedCriteria = acData.completed;
  const totalCriteriaCount = pendingCriteria.length + completedCriteria.length;
  const manualCriteria = pendingCriteria.filter((c) => c.level === "L4");
  const automatableCriteria = pendingCriteria.filter((c) => c.level !== "L4");
  const hasWhatToBuild = /^##\s+What to build\b/im.test(body) || /^##\s+要构建什么\b/im.test(body);
  const hasAcceptanceCriteria =
    /^##\s+Acceptance criteria\b/im.test(body) || /^##\s+验收标准\b/im.test(body);
  const allPendingAreL4 = pendingCriteria.length > 0 && manualCriteria.length === pendingCriteria.length;
  const humanOnly = labelSet.has("ready-for-human") || allPendingAreL4;
  const claimed = [...CLAIM_LABELS].some((label) => labelSet.has(label));
  const failed = labelSet.has(FAILED_LABEL);

  const reasons = [];
  if (!labelSet.has("ready-for-agent")) reasons.push("missing ready-for-agent label");
  for (const label of DISQUALIFYING_LABELS) {
    if (labelSet.has(label)) reasons.push(`has ${label} label`);
  }
  if (failed) reasons.push(`has ${FAILED_LABEL} label — previous run failed, needs human review`);
  if (claimed) reasons.push("already claimed or in progress");
  if (openBlockers.length > 0) reasons.push(`blocked by open issue(s): ${openBlockers.map((n) => `#${n}`).join(", ")}`);
  if (!hasWhatToBuild) reasons.push("missing What to build section");
  if (!hasAcceptanceCriteria || totalCriteriaCount === 0) reasons.push("missing checklist-style acceptance criteria");
  if (totalCriteriaCount > 0 && pendingCriteria.length === 0) reasons.push("all acceptance criteria already completed");
  if (humanOnly) reasons.push("requires human/manual/external action");

  let bucket = "eligible";
  if (failed) bucket = "failed";
  else if (claimed) bucket = "claimed";
  else if (humanOnly) bucket = "humanOnly";
  else if (openBlockers.length > 0) bucket = "blocked";
  else if (reasons.length > 0) bucket = "ineligible";

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state ?? "OPEN",
    labels,
    bucket,
    reasons,
    blockers,
    openBlockers,
    taskBranch: `afk/issue-${issue.number}-${slugify(issue.title, `issue-${issue.number}`)}`,
    tddPlan: buildTddPlan(pendingCriteria, automatableCriteria, manualCriteria, completedCriteria),
    acVerification: buildAcVerificationPlan(acData),
  };
}

function parseBlockers(body) {
  const blockers = new Set();
  const blockedBySection = extractSection(body, "Blocked by");
  if (blockedBySection) {
    for (const match of blockedBySection.matchAll(/#(\d+)/g)) {
      blockers.add(Number(match[1]));
    }
  }

  for (const match of body.matchAll(/blocked by[^\n#]*(#\d+(?:[,\s]+#\d+)*)/gi)) {
    for (const issueRef of match[1].matchAll(/#(\d+)/g)) {
      blockers.add(Number(issueRef[1]));
    }
  }

  return [...blockers].sort((a, b) => a - b);
}

function extractAcceptanceCriteria(body) {
  const section = extractSection(body, "Acceptance criteria") ?? extractSection(body, "验收标准");

  if (!section) return { subsections: [], pending: [], completed: [] };

  const subsections = [];
  let current = { heading: null, pending: [], completed: [] };
  subsections.push(current);

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    const subHeadingMatch = line.match(/^###+\s+(.+?)\s*$/);
    if (subHeadingMatch) {
      current = { heading: subHeadingMatch[1].trim(), pending: [], completed: [] };
      subsections.push(current);
      continue;
    }
    const itemMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (!itemMatch) continue;
    const text = itemMatch[2].trim();
    if (!text) continue;
    const classified = classifyCriterion(text);
    if (itemMatch[1] === " ") current.pending.push(classified);
    else current.completed.push(classified);
  }

  const nonEmpty = subsections.filter((s) => s.pending.length > 0 || s.completed.length > 0);
  const pending = nonEmpty.flatMap((s) => s.pending);
  const completed = nonEmpty.flatMap((s) => s.completed);
  return { subsections: nonEmpty, pending, completed };
}

function classifyCriterion(rawText) {
  const text = rawText.trim();

  const tagMatch = text.match(/^\[(L[1-4]|code|test|browser|manual)\]\s+(.*)$/i);
  if (tagMatch) {
    const key = tagMatch[1].toLowerCase();
    const level = EXPLICIT_TAG_MAP[key] ?? key.toUpperCase();
    return {
      text: tagMatch[2].trim(),
      level,
      explicit: true,
      approach: LEVEL_APPROACH[level],
    };
  }

  if (isManualText(text)) {
    return { text, level: "L4", explicit: false, approach: LEVEL_APPROACH.L4 };
  }

  if (
    /\bstate(s)?\b|\brender(s|ed)?\b|\bvisible\b|\bhidden\b|\bviewport\b|\b\d+px\b|\bmobile\b|\bdesktop\b|\bUI\b|\bclick\b|\btoast\b|\boutline\b|\bcss\b|\blayout\b|\bcolumn\b|\bstack(s|ed)?\b|\bscreenshot\b/i.test(
      text,
    )
  ) {
    return { text, level: "L3", explicit: false, approach: LEVEL_APPROACH.L3 };
  }

  if (
    /\bapi\b|\bendpoint\b|\breturn(s|ed)?\b|\bresponse\b|\bstatus code\b|\bthrows?\b|\baccept(s|ed)?\s+only\b|\breject(s|ed)?\b|\bdecrement(s|ed)?\b|\btriggers?\b|\bcurl\b/i.test(
      text,
    ) ||
    /\b(POST|GET|PUT|DELETE|PATCH)\s+\//i.test(text)
  ) {
    return { text, level: "L2", explicit: false, approach: LEVEL_APPROACH.L2 };
  }

  return { text, level: "L1", explicit: false, approach: LEVEL_APPROACH.L1 };
}

function extractSection(body, heading) {
  const lines = String(body ?? "").split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\b`, "i");
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start === -1) return null;

  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index].trim())) break;
    collected.push(lines[index]);
  }
  return collected.join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isManualText(text) {
  return MANUAL_PATTERNS.some((pattern) => pattern.test(text));
}

function buildTddPlan(pendingCriteria, automatableCriteria, manualCriteria, completedCriteria) {
  const firstRedTest = automatableCriteria[0]
    ? `Write the first failing behavior test for: ${automatableCriteria[0].text}`
    : "No safe automated first test identified; require explicit exception and closest verification.";

  return {
    pendingCount: pendingCriteria.length,
    completedCount: completedCriteria.length,
    completedCriteria: completedCriteria.map((c) => c.text),
    automatableBehaviors: automatableCriteria.map((c) => c.text),
    manualVerification: manualCriteria.map((c) => c.text),
    firstRedTest,
    redGreenSlices: automatableCriteria.slice(0, 8).map((criterion, index) => ({
      step: index + 1,
      red: `Add failing test for: ${criterion.text}`,
      green: "Implement the smallest vertical slice that makes this behavior pass.",
    })),
  };
}

function buildAcVerificationPlan(acData) {
  const subsections = acData.subsections.map((sub) => {
    const items = [...sub.pending, ...sub.completed].map((c, index) => ({
      index: index + 1,
      text: c.text,
      level: c.level,
      explicit: c.explicit,
      approach: c.approach,
      status: sub.pending.includes(c) ? "pending" : "completed",
    }));
    const rollup = countByLevel(items);
    return {
      heading: sub.heading,
      items,
      rollup,
    };
  });

  const allItems = subsections.flatMap((s) => s.items);
  const rollup = countByLevel(allItems);
  const autoVerifiable = allItems.filter((i) => i.level !== "L4" && i.status === "pending");
  const humanOnly = allItems.filter((i) => i.level === "L4");

  return {
    subsections,
    rollup,
    totals: {
      pending: allItems.filter((i) => i.status === "pending").length,
      completed: allItems.filter((i) => i.status === "completed").length,
      autoVerifiable: autoVerifiable.length,
      humanOnly: humanOnly.length,
    },
    partialFailPolicy:
      "Any L1/L2/L3 verification failure blocks PR creation and applies agent-failed label. L4 items are flagged in the PR body but never block.",
  };
}

function countByLevel(items) {
  const counts = { L1: 0, L2: 0, L3: 0, L4: 0 };
  for (const item of items) {
    if (counts[item.level] != null) counts[item.level] += 1;
  }
  return counts;
}

function summarize(issues) {
  return {
    total: issues.length,
    eligible: issues.filter((issue) => issue.bucket === "eligible").length,
    blocked: issues.filter((issue) => issue.bucket === "blocked").length,
    humanOnly: issues.filter((issue) => issue.bucket === "humanOnly").length,
    claimed: issues.filter((issue) => issue.bucket === "claimed").length,
    failed: issues.filter((issue) => issue.bucket === "failed").length,
    ineligible: issues.filter((issue) => issue.bucket === "ineligible").length,
  };
}

function buildExecutionWaves(issues) {
  const eligible = issues
    .filter((issue) => issue.bucket === "eligible")
    .sort((a, b) => a.openBlockers.length - b.openBlockers.length || a.number - b.number);

  const waves = [];
  for (let index = 0; index < eligible.length; index += 2) {
    waves.push({
      wave: waves.length + 1,
      issues: eligible.slice(index, index + 2).map((issue) => issue.number),
    });
  }
  return waves;
}

function buildExecutionPlan(eligible, batchSlug) {
  return eligible.map((issue) => ({
    issue: issue.number,
    labelsToAdd: ["agent-claimed", "agent-in-progress"],
    claimCommentPrefix: "> *This was generated by AI during afk-agent run <run-id>.*",
    batchBranch: `agent/${batchSlug}`,
    taskBranch: issue.taskBranch,
    steps: [
      "startup reconciliation: scan stale agent-* issues, close any whose linked PR merged, mark agent-failed for any whose PR was closed unmerged",
      "post CLAIM comment (run id, branches, started-at, test gates, AC plan summary)",
      "read repo agent docs and relevant framework docs",
      `git fetch origin && git checkout -B ${issue.taskBranch} origin/agent/${batchSlug}`,
      "invoke /tdd for the issue using only pending acceptance criteria",
      "run repo test gates (default: pnpm lint && pnpm test && pnpm build)",
      "run AC verification: L1 = grep/AST, L2 = test discovery, L3 = headless browser snapshot",
      "if any L1/L2/L3 fails → post FAILURE comment, set agent-failed, leave task branch pushed, stop (no PR)",
      "for each verified pending AC, edit issue body to flip [ ] → [x]",
      "post AC VERIFICATION REPORT comment (per-AC evidence, level, status)",
      `git push origin ${issue.taskBranch}`,
      `gh pr create --base agent/${batchSlug} --head ${issue.taskBranch} --title "..." --body "... Closes #${issue.number} ..."`,
      `gh pr merge <pr-number> --auto --squash`,
      "post COMPLETION comment (run id, PR link, auto-merge status, AC tick stats, L4 list, elapsed time, close strategy)",
      "poll `gh pr view <pr-number> --json state` every 5s up to 60s; if MERGED within window → `gh issue close` with brief reference to completion comment",
      "if poll times out → leave issue open; next run's startup reconciliation will close it once auto-merge completes",
    ],
    abortConditions: [
      "ANY L1/L2/L3 acceptance criterion fails verification",
      "lint/test/build fails after /tdd completes",
      "issue body changed between read and write of AC checkboxes",
      "another agent already holds agent-claimed when we attempt to lock",
    ],
    commentTimeline: [
      "1. CLAIM (start of run)",
      "2. AC VERIFICATION REPORT (after AC verify, success path)",
      "3. COMPLETION (after gh pr merge --auto, success path)",
      "4. FAILURE (replaces 2+3 on any failure)",
    ],
    prBodyMustContain: [
      `Closes #${issue.number}`,
      "run id",
      "AC verification rollup (L1/L2/L3/L4 counts)",
      "explicit list of L4 ACs needing human verification",
    ],
  }));
}

function buildBatchSlug(issues) {
  const titles = issues.map((issue) => issue.title).join(" ");
  const words = titles
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);

  if (!words) return "afk-batch";

  const stop = new Set([
    "a",
    "an",
    "and",
    "the",
    "to",
    "of",
    "for",
    "with",
    "page",
    "issue",
    "task",
    "build",
    "add",
    "new",
  ]);

  const selected = [];
  for (const word of words) {
    if (stop.has(word)) continue;
    if (!selected.includes(word)) selected.push(word);
    if (selected.length >= 6) break;
  }

  return selected.join("-") || "afk-batch";
}

function slugify(value, fallback = "afk-batch") {
  const words = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);

  if (!words || words.length === 0) return fallback;

  const stop = new Set(["a", "an", "and", "the", "to", "of", "for", "with", "page", "issue", "task"]);
  return words.filter((word) => !stop.has(word)).slice(0, 8).join("-") || fallback;
}

function printMarkdown(currentPlan) {
  console.log(`# afk-agent plan\n`);
  console.log(`Mode: ${currentPlan.mode} (scanner is read-only; execution is performed by the calling agent)`);
  console.log(`Batch branch: \`${currentPlan.batchBranch}\``);
  console.log(`Max parallel: ${currentPlan.maxParallel}`);
  console.log(`PR merge strategy: ${currentPlan.prMergeStrategy}`);
  const cache = currentPlan.cache ?? { hits: 0, misses: 0 };
  console.log(`Cache: hit ${cache.hits} / miss ${cache.misses}\n`);

  console.log(`## Summary\n`);
  for (const [bucket, count] of Object.entries(currentPlan.summary)) {
    console.log(`- ${bucket}: ${count}`);
  }

  printBucket("Eligible", currentPlan.issues, "eligible");
  printBucket("Failed (needs human review)", currentPlan.issues, "failed");
  printBucket("Blocked", currentPlan.issues, "blocked");
  printBucket("Human-only", currentPlan.issues, "humanOnly");
  printBucket("Claimed", currentPlan.issues, "claimed");
  printBucket("Ineligible", currentPlan.issues, "ineligible");

  console.log(`\n## Dependency graph\n`);
  for (const item of currentPlan.dependencyGraph) {
    const blockers = item.blockers.length ? item.blockers.map((n) => `#${n}`).join(", ") : "none";
    const open = item.openBlockers.length ? item.openBlockers.map((n) => `#${n}`).join(", ") : "none";
    console.log(`- #${item.issue}: blockers ${blockers}; open ${open}`);
  }

  console.log(`\n## Execution waves\n`);
  if (currentPlan.executionWaves.length === 0) {
    console.log("- No eligible issues.");
  } else {
    for (const wave of currentPlan.executionWaves) {
      console.log(`- Wave ${wave.wave}: ${wave.issues.map((number) => `#${number}`).join(", ")}`);
    }
  }

  console.log(`\n## TDD plan\n`);
  for (const issue of currentPlan.issues.filter((item) => item.bucket === "eligible")) {
    console.log(`### #${issue.number} ${issue.title}`);
    console.log(`- Task branch: \`${issue.taskBranch}\``);
    console.log(
      `- Criteria: ${issue.tddPlan.pendingCount} pending, ${issue.tddPlan.completedCount} already completed`,
    );
    console.log(`- First red test: ${issue.tddPlan.firstRedTest}`);
    for (const slice of issue.tddPlan.redGreenSlices.slice(0, 5)) {
      console.log(`- Slice ${slice.step}: ${slice.red}`);
    }
    if (issue.tddPlan.completedCriteria.length > 0) {
      console.log(`- Already-completed criteria (reference, not retested):`);
      for (const item of issue.tddPlan.completedCriteria) {
        console.log(`  - ${item}`);
      }
    }
  }

  console.log(`\n## Acceptance criteria verification plan\n`);
  for (const issue of currentPlan.issues.filter((item) => item.bucket === "eligible")) {
    const ac = issue.acVerification;
    console.log(`### #${issue.number} ${issue.title}`);
    console.log(
      `- Totals: ${ac.totals.pending} pending / ${ac.totals.completed} completed; auto-verifiable: ${ac.totals.autoVerifiable}, human-only (L4): ${ac.totals.humanOnly}`,
    );
    console.log(
      `- Rollup: L1 ${ac.rollup.L1} · L2 ${ac.rollup.L2} · L3 ${ac.rollup.L3} · L4 ${ac.rollup.L4}`,
    );
    for (const sub of ac.subsections) {
      const heading = sub.heading ?? "(unnamed)";
      console.log(`- **${heading}** — L1 ${sub.rollup.L1} · L2 ${sub.rollup.L2} · L3 ${sub.rollup.L3} · L4 ${sub.rollup.L4}`);
      for (const item of sub.items) {
        const tag = item.explicit ? `${item.level}*` : item.level;
        const status = item.status === "completed" ? " ✓" : "";
        console.log(`  - [${tag}] ${item.text}${status}`);
        console.log(`    → ${item.approach}`);
      }
    }
    console.log(`- Partial-fail policy: ${ac.partialFailPolicy}`);
  }

  console.log(`\n## Execution plan\n`);
  for (const item of currentPlan.executionPlan) {
    console.log(`### #${item.issue}`);
    console.log(`- Add labels: ${item.labelsToAdd.join(", ")}`);
    console.log(`- Task branch: \`${item.taskBranch}\` (base \`${item.batchBranch}\`)`);
    console.log(`- Steps:`);
    for (const step of item.steps) {
      console.log(`  - ${step}`);
    }
    console.log(`- Abort conditions:`);
    for (const cond of item.abortConditions) {
      console.log(`  - ${cond}`);
    }
    console.log(`- Comment timeline:`);
    for (const c of item.commentTimeline) {
      console.log(`  - ${c}`);
    }
    console.log(`- PR body must contain:`);
    for (const req of item.prBodyMustContain) {
      console.log(`  - ${req}`);
    }
  }
}

function printBucket(title, issues, bucket) {
  const items = issues.filter((issue) => issue.bucket === bucket);
  console.log(`\n## ${title}\n`);
  if (items.length === 0) {
    console.log("- None");
    return;
  }
  for (const issue of items) {
    const reason = issue.reasons.length ? ` — ${issue.reasons.join("; ")}` : "";
    console.log(`- #${issue.number} ${issue.title}${reason}`);
  }
}

function runSelfTest() {
  const cases = [
    ["## Blocked by\n\n- #26", [26]],
    ["Blocked by: #26", [26]],
    ["Blocked by #26, #27", [26, 27]],
    ["## Blocked by\n\nNone - can start immediately.", []],
  ];

  for (const [body, expected] of cases) {
    const actual = parseBlockers(body);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`parseBlockers failed for ${JSON.stringify(body)}: got ${actual}, expected ${expected}`);
    }
  }

  const branch = `agent/${buildBatchSlug([{ title: "book-sale: shared nav/foot components" }])}`;
  if (branch === "main" || branch.endsWith("/main")) {
    throw new Error(`unsafe batch branch: ${branch}`);
  }

  const criteriaBody = [
    "## Acceptance criteria",
    "",
    "### Backend",
    "- [x] Done thing one",
    "- [ ] ARTIFACTS has single bundle entry in src/lib/payment/artifacts.ts",
    "",
    "### Download page UI",
    "- [ ] All 5 states render correctly at 375px mobile",
    "- [ ] /api/card/download returns presigned URL and decrements credits",
    "- [ ] [manual] End-to-end manual verify: real zip downloads from R2",
  ].join("\n");
  const acData = extractAcceptanceCriteria(criteriaBody);
  if (acData.subsections.length !== 2) {
    throw new Error(`expected 2 subsections, got ${acData.subsections.length}`);
  }
  if (acData.subsections[0].heading !== "Backend" || acData.subsections[1].heading !== "Download page UI") {
    throw new Error(`subsection headings wrong: ${JSON.stringify(acData.subsections.map((s) => s.heading))}`);
  }
  if (acData.pending.length !== 4 || acData.completed.length !== 1) {
    throw new Error(
      `extractAcceptanceCriteria split failed: pending=${acData.pending.length}, completed=${acData.completed.length}`,
    );
  }

  const findByPrefix = (prefix) => acData.pending.find((c) => c.text.startsWith(prefix));
  const l1 = findByPrefix("ARTIFACTS has single bundle");
  const l3 = findByPrefix("All 5 states");
  const l2 = findByPrefix("/api/card/download");
  const l4 = acData.pending.find((c) => c.text.startsWith("End-to-end manual"));
  if (!l1 || l1.level !== "L1") throw new Error(`L1 classification failed: got ${l1?.level}`);
  if (!l2 || l2.level !== "L2") throw new Error(`L2 classification failed: got ${l2?.level}`);
  if (!l3 || l3.level !== "L3") throw new Error(`L3 classification failed: got ${l3?.level}`);
  if (!l4 || l4.level !== "L4" || !l4.explicit) {
    throw new Error(`explicit [manual] → L4 classification failed: ${JSON.stringify(l4)}`);
  }

  const failedIssue = {
    number: 999,
    title: "previously failed task",
    body: [
      "## What to build",
      "Do the thing.",
      "## Acceptance criteria",
      "- [ ] Thing happens",
    ].join("\n"),
    labels: [{ name: "ready-for-agent" }, { name: "agent-failed" }],
    state: "OPEN",
  };
  const analyzedFailed = analyzeIssue(failedIssue, new Map());
  if (analyzedFailed.bucket !== "failed") {
    throw new Error(`agent-failed issue should land in failed bucket, got ${analyzedFailed.bucket}`);
  }

  const allDoneIssue = {
    number: 1000,
    title: "all criteria done",
    body: [
      "## What to build",
      "Already shipped.",
      "## Acceptance criteria",
      "- [x] Already done",
    ].join("\n"),
    labels: [{ name: "ready-for-agent" }],
    state: "OPEN",
  };
  const analyzedDone = analyzeIssue(allDoneIssue, new Map());
  if (analyzedDone.bucket === "eligible") {
    throw new Error("issue with only completed criteria should not be eligible");
  }
  if (!analyzedDone.reasons.some((r) => r.includes("already completed"))) {
    throw new Error("missing 'already completed' reason for all-done issue");
  }

  console.log("afk-agent scanner self-test passed");
}
