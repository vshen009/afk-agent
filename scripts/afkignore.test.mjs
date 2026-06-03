import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadAfkIgnore, parseAfkIgnore } from "./afkignore.mjs";

function issue(...labelNames) {
  return { number: 1, labels: labelNames.map((name) => ({ name })) };
}

function tmpRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, ".git"), ""); // marker so the walk stops here
  return dir;
}

test("parseAfkIgnore parses mixed comments, blanks, and labels into the expected set", () => {
  const content = [
    "# ignore everything a human still owns",
    "",
    "  ready-for-human  ",
    "wontfix",
    "   ",
    "# infra",
    "needs-info",
  ].join("\n");
  assert.deepEqual([...parseAfkIgnore(content)].sort(), ["needs-info", "ready-for-human", "wontfix"]);
});

test("shouldIgnore returns ignored:true and the correct matchedLabel for a matching issue", () => {
  const dir = tmpRepo("afkignore-match-");
  writeFileSync(join(dir, ".afkignore"), "wontfix\nneeds-info\n");
  const res = loadAfkIgnore(dir).shouldIgnore(issue("enhancement", "needs-info"));
  assert.deepEqual(res, { ignored: true, matchedLabel: "needs-info" });
});

test("shouldIgnore returns ignored:false when no labels overlap", () => {
  const dir = tmpRepo("afkignore-nomatch-");
  writeFileSync(join(dir, ".afkignore"), "wontfix\n");
  assert.deepEqual(loadAfkIgnore(dir).shouldIgnore(issue("enhancement", "bug")), { ignored: false });
});

test("when no .afkignore exists, the matcher returns ignored:false for every input", () => {
  const dir = tmpRepo("afkignore-absent-");
  const matcher = loadAfkIgnore(dir);
  assert.deepEqual(matcher.shouldIgnore(issue("wontfix")), { ignored: false });
  assert.deepEqual(matcher.shouldIgnore(issue("anything")), { ignored: false });
});

test("loadAfkIgnore from a nested subdirectory finds the repo-root .afkignore", () => {
  const root = tmpRepo("afkignore-root-");
  writeFileSync(join(root, ".afkignore"), "blocked\n");
  const nested = join(root, "a", "b", "c");
  mkdirSync(nested, { recursive: true });
  assert.equal(loadAfkIgnore(nested).shouldIgnore(issue("blocked")).ignored, true);
});

test("matching is case-sensitive: 'Bug' in file does not match 'bug' on the issue", () => {
  const dir = tmpRepo("afkignore-case-");
  writeFileSync(join(dir, ".afkignore"), "Bug\n");
  const matcher = loadAfkIgnore(dir);
  assert.equal(matcher.shouldIgnore(issue("bug")).ignored, false);
  assert.equal(matcher.shouldIgnore(issue("Bug")).ignored, true);
});

test("for an issue with two matching labels, matchedLabel is deterministic (first in issue order)", () => {
  const dir = tmpRepo("afkignore-two-");
  writeFileSync(join(dir, ".afkignore"), "wontfix\nneeds-info\n");
  const res = loadAfkIgnore(dir).shouldIgnore(issue("needs-info", "wontfix"));
  assert.deepEqual(res, { ignored: true, matchedLabel: "needs-info" });
});
