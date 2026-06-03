import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cachedGh,
  clearCache,
  cacheStats,
  repoIdFromRemote,
  cacheDirFor,
} from "./gh-cache.mjs";

function tmpBase() {
  return mkdtempSync(join(tmpdir(), "afk-cache-test-"));
}

function entryFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.json$/.test(name));
  } catch {
    return [];
  }
}

test("fresh cachedGh invokes the executor once and writes a cache entry to disk", () => {
  const baseDir = tmpBase();
  let calls = 0;
  const executor = (args) => {
    calls += 1;
    return `out:${args.join(",")}`;
  };
  const out = cachedGh(["issue", "list"], {
    executor,
    baseDir,
    repoId: "r",
    ttlSeconds: 300,
    now: () => 1000,
  });
  assert.equal(out, "out:issue,list");
  assert.equal(calls, 1);
  assert.equal(entryFiles(cacheDirFor("r", baseDir)).length, 1);
});

test("a second call with the same args within TTL returns cache without invoking executor", () => {
  const baseDir = tmpBase();
  let calls = 0;
  const executor = () => `v${(calls += 1)}`;
  const a = cachedGh(["x"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1000 });
  const b = cachedGh(["x"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1000 + 299_000 });
  assert.equal(calls, 1);
  assert.equal(a, "v1");
  assert.equal(b, "v1");
});

test("a second call after TTL re-invokes the executor and overwrites the entry", () => {
  const baseDir = tmpBase();
  let calls = 0;
  const executor = () => `v${(calls += 1)}`;
  const a = cachedGh(["x"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1000 });
  const b = cachedGh(["x"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1000 + 300_001 });
  assert.equal(calls, 2);
  assert.equal(a, "v1");
  assert.equal(b, "v2");
  const dir = cacheDirFor("r", baseDir);
  const entry = JSON.parse(readFileSync(join(dir, entryFiles(dir)[0]), "utf8"));
  assert.equal(entry.output, "v2");
});

test("bypass:true always invokes the executor and still updates the cache entry", () => {
  const baseDir = tmpBase();
  let calls = 0;
  const executor = () => `v${(calls += 1)}`;
  cachedGh(["x"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1000 });
  const b = cachedGh(["x"], { executor, baseDir, repoId: "r", ttlSeconds: 300, bypass: true, now: () => 1000 });
  assert.equal(calls, 2);
  assert.equal(b, "v2");
  const dir = cacheDirFor("r", baseDir);
  const entry = JSON.parse(readFileSync(join(dir, entryFiles(dir)[0]), "utf8"));
  assert.equal(entry.output, "v2");
});

test("two calls with different argument arrays produce two distinct cache files", () => {
  const baseDir = tmpBase();
  const executor = (args) => args.join("-");
  cachedGh(["a"], { executor, baseDir, repoId: "r", now: () => 1 });
  cachedGh(["b"], { executor, baseDir, repoId: "r", now: () => 1 });
  assert.equal(entryFiles(cacheDirFor("r", baseDir)).length, 2);
});

test("a truncated / non-JSON cache file is treated as a miss and silently overwritten", () => {
  const baseDir = tmpBase();
  let calls = 0;
  const executor = () => `fresh${(calls += 1)}`;
  cachedGh(["x"], { executor, baseDir, repoId: "r", now: () => 1000 });
  const dir = cacheDirFor("r", baseDir);
  const file = join(dir, entryFiles(dir)[0]);
  writeFileSync(file, "{ this is not valid json", "utf8");
  let out;
  assert.doesNotThrow(() => {
    out = cachedGh(["x"], { executor, baseDir, repoId: "r", now: () => 1000 });
  });
  assert.equal(calls, 2);
  assert.equal(out, "fresh2");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).output, "fresh2");
});

test("clearCache removes entries for a repoId but leaves other repos untouched", () => {
  const baseDir = tmpBase();
  const executor = (a) => a.join("");
  cachedGh(["a"], { executor, baseDir, repoId: "keep", now: () => 1 });
  cachedGh(["a"], { executor, baseDir, repoId: "drop", now: () => 1 });
  cachedGh(["b"], { executor, baseDir, repoId: "drop", now: () => 1 });
  const removed = clearCache("drop", { baseDir });
  assert.equal(removed, 2);
  assert.equal(entryFiles(cacheDirFor("drop", baseDir)).length, 0);
  assert.equal(entryFiles(cacheDirFor("keep", baseDir)).length, 1);
});

test("cacheStats returns hit/miss counts and oldest-entry age matching the setup", () => {
  const baseDir = tmpBase();
  const executor = (a) => a.join("");
  cachedGh(["a"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1_000_000 }); // miss
  cachedGh(["b"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1_100_000 }); // miss
  cachedGh(["a"], { executor, baseDir, repoId: "r", ttlSeconds: 300, now: () => 1_100_000 }); // hit
  const stats = cacheStats("r", { baseDir, now: () => 1_200_000 });
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 2);
  assert.equal(stats.entries, 2);
  assert.equal(stats.oldestAgeMs, 200_000);
});

test("repoId derives from owner/name of the origin remote and is filesystem-safe", () => {
  assert.equal(repoIdFromRemote("https://github.com/vshen009/afk-agent.git"), "vshen009-afk-agent");
  assert.equal(repoIdFromRemote("git@github.com:vshen009/afk-agent.git"), "vshen009-afk-agent");
});

test("repoId falls back to the literal string 'local' when no remote is configured", () => {
  assert.equal(repoIdFromRemote(""), "local");
});
