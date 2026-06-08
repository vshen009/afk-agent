import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { listIssues, parseArgs } from "./scan-ready-issues.mjs";
import { resolveTtlSeconds } from "./gh-cache.mjs";

const SCANNER = fileURLToPath(new URL("./scan-ready-issues.mjs", import.meta.url));

function tmpBase(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("scanner read (listIssues) is cached: two runs within TTL invoke the executor once", () => {
  const baseDir = tmpBase("afk-scan-cache-");
  let calls = 0;
  const fakeGh = () => {
    calls += 1;
    return JSON.stringify([{ number: 1, title: "t", body: "", labels: [], state: "OPEN" }]);
  };
  const opts = { executor: fakeGh, baseDir, repoId: "scan", ttlSeconds: 300, now: () => 5000 };
  const a = listIssues(500, opts);
  const b = listIssues(500, opts);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});

test("--no-cache (ttl 0) invokes the executor on every read even when a valid entry exists", () => {
  const baseDir = tmpBase("afk-nocache-");
  let calls = 0;
  const fakeGh = () => {
    calls += 1;
    return "[]";
  };
  listIssues(500, { executor: fakeGh, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1 }); // primes a live entry
  listIssues(500, { executor: fakeGh, baseDir, repoId: "r", ttlSeconds: 0, now: () => 1 });
  listIssues(500, { executor: fakeGh, baseDir, repoId: "r", ttlSeconds: 0, now: () => 1 });
  assert.equal(calls, 3);
});

test("TTL precedence: --no-cache > --cache-ttl > AFK_CACHE_TTL > default", () => {
  assert.equal(resolveTtlSeconds({ noCache: true, cacheTtl: "120", env: "60" }), 0);
  assert.equal(resolveTtlSeconds({ cacheTtl: "120", env: "60" }), 120); // CLI wins over env
  assert.equal(resolveTtlSeconds({ env: "60" }), 60); // env used when no CLI override
  assert.equal(resolveTtlSeconds({}), 300); // module default
});

test("parseArgs accepts the four cache flags", () => {
  assert.equal(parseArgs(["--no-cache"]).noCache, true);
  assert.equal(parseArgs(["--cache-ttl", "45"]).cacheTtl, "45");
  assert.equal(parseArgs(["--clear-cache"]).clearCache, true);
  assert.equal(parseArgs(["--cache-stats"]).cacheStats, true);
});

test("--clear-cache exits 0 and reports cleared entries", () => {
  const baseDir = tmpBase("afk-clear-");
  const out = execFileSync("node", [SCANNER, "--clear-cache"], {
    encoding: "utf8",
    env: { ...process.env, AFK_CACHE_DIR: baseDir },
  });
  assert.match(out, /Cleared \d+ cache entr/);
});

test("--self-test still passes unchanged (regression)", () => {
  const out = execFileSync("node", [SCANNER, "--self-test"], { encoding: "utf8" });
  assert.match(out, /self-test passed/);
});
