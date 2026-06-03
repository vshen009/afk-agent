// Per-repo `.afkignore` label filter.
//
// Deep module with a tiny interface: `loadAfkIgnore(startDir)` returns a matcher
// whose `shouldIgnore(issue)` reports `{ ignored, matchedLabel? }`. All parsing
// and the upward filesystem walk are hidden inside.
//
// `.afkignore` syntax (v1, intentionally minimal):
//   - one label per line
//   - lines beginning with `#` are comments
//   - blank lines are ignored
//   - leading/trailing whitespace per line is stripped
//   - matching is exact and case-sensitive against `issue.labels[].name`
//   - no glob, no regex, no negation

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function parseAfkIgnore(content) {
  const labels = new Set();
  for (const rawLine of String(content ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    labels.add(line);
  }
  return labels;
}

function buildMatcher(labels) {
  return {
    labels,
    // Returns the first matching label in the issue's own label order, so the
    // result is deterministic when an issue carries more than one ignored label.
    shouldIgnore(issue) {
      const names = (issue?.labels ?? []).map((label) => label?.name ?? label);
      for (const name of names) {
        if (labels.has(name)) return { ignored: true, matchedLabel: name };
      }
      return { ignored: false };
    },
  };
}

// Walk from `startDir` upward to the git root (inclusive). Return a matcher built
// from the first `.afkignore` found, or a no-op matcher (ignores nothing) if none
// exists — so the feature is fully opt-in.
export function loadAfkIgnore(startDir) {
  let dir = resolve(startDir ?? ".");
  while (true) {
    const candidate = join(dir, ".afkignore");
    if (existsSync(candidate)) return buildMatcher(parseAfkIgnore(readFileSync(candidate, "utf8")));
    if (existsSync(join(dir, ".git"))) break; // reached the git root; checked it, stop
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return buildMatcher(new Set());
}
