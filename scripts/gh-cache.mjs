// Disk cache for read-only `gh` shell-outs.
//
// Deep module: the public surface is `cachedGh`, `clearCache`, `cacheStats`
// (plus `repoIdFromRemote` / `cacheDirFor` for the scanner and tests). All key
// derivation, filesystem layout, and TTL handling is hidden inside. The
// underlying `gh` executor is injectable so unit tests never shell out.
//
// Cache entries are JSON `{ writtenAt, args, output }`, keyed by
// `sha256(JSON.stringify(args))`, and live under
// `~/.cache/afk-agent/<repoId>/<key>.json`. Lifetime hit/miss counters live in
// a sibling `_stats.json` that is never treated as a cache entry.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";

export const DEFAULT_TTL_SECONDS = 300;

const ENTRY_FILE = /^[a-f0-9]{64}\.json$/;
const STATS_FILE = "_stats.json";

function defaultExecutor(commandArgs) {
  return execFileSync("gh", commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function defaultGitRemote() {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function defaultBaseDir() {
  return process.env.AFK_CACHE_DIR || join(homedir(), ".cache", "afk-agent");
}

// `owner/name` parsed from a remote URL, sanitised to a single filesystem-safe
// slug. Falls back to the literal string "local" when no remote is configured.
export function repoIdFromRemote(remoteUrl) {
  const url = (remoteUrl ?? defaultGitRemote()).trim();
  if (!url) return "local";

  const cleaned = url
    .replace(/\.git$/i, "")
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, "") // https:// / ssh:// host/
    .replace(/^git@[^:]+:/i, ""); // git@host:

  const parts = cleaned.split("/").filter(Boolean);
  const ownerName = parts.slice(-2).join("/");
  return sanitizeRepoId(ownerName || "local");
}

function sanitizeRepoId(id) {
  const slug = id.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "local";
}

export function cacheDirFor(repoId, baseDir) {
  return join(baseDir ?? defaultBaseDir(), repoId);
}

function cacheKey(commandArgs) {
  return createHash("sha256").update(JSON.stringify(commandArgs)).digest("hex");
}

function readJson(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null; // missing or corrupted → treated as a miss
  }
}

function bumpPersistentStats(dir, field) {
  mkdirSync(dir, { recursive: true });
  const current = readJson(join(dir, STATS_FILE)) ?? {};
  const next = {
    hits: typeof current.hits === "number" ? current.hits : 0,
    misses: typeof current.misses === "number" ? current.misses : 0,
  };
  next[field] += 1;
  writeFileSync(join(dir, STATS_FILE), JSON.stringify(next), "utf8");
}

// Run `commandArgs` through the disk cache. A fresh or expired entry invokes the
// executor and (over)writes the entry; a live entry is returned without running
// the executor. `bypass` (and `ttlSeconds <= 0`) force the executor while still
// refreshing the entry. An optional `stats` object accumulates per-run hit/miss
// counts for the scanner header.
export function cachedGh(commandArgs, options = {}) {
  const {
    executor = defaultExecutor,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    bypass = false,
    repoId = repoIdFromRemote(),
    baseDir,
    now = Date.now,
    stats,
  } = options;

  const dir = cacheDirFor(repoId, baseDir);
  const file = join(dir, `${cacheKey(commandArgs)}.json`);
  const currentTime = now();

  if (!bypass && ttlSeconds > 0) {
    const entry = readJson(file);
    if (entry && typeof entry.output === "string" && typeof entry.writtenAt === "number") {
      if (currentTime - entry.writtenAt <= ttlSeconds * 1000) {
        if (stats) stats.hits = (stats.hits ?? 0) + 1;
        bumpPersistentStats(dir, "hits");
        return entry.output;
      }
    }
  }

  const output = executor(commandArgs);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ writtenAt: currentTime, args: commandArgs, output }), "utf8");
  if (stats) stats.misses = (stats.misses ?? 0) + 1;
  bumpPersistentStats(dir, "misses");
  return output;
}

// Remove every cache entry for `repoId`, leaving other repos' entries (and the
// stats counter) for those repos untouched. Returns the number of entries removed.
export function clearCache(repoId, options = {}) {
  const dir = cacheDirFor(repoId, options.baseDir);
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (ENTRY_FILE.test(name)) {
        rmSync(join(dir, name));
        removed += 1;
      }
    }
    rmSync(join(dir, STATS_FILE), { force: true });
  } catch {
    // dir missing → nothing to clear
  }
  return removed;
}

// Report `{ hits, misses, entries, oldestAgeMs }` for `repoId` by reading disk.
export function cacheStats(repoId, options = {}) {
  const { baseDir, now = Date.now } = options;
  const dir = cacheDirFor(repoId, baseDir);
  const persisted = readJson(join(dir, STATS_FILE)) ?? {};
  const result = {
    hits: typeof persisted.hits === "number" ? persisted.hits : 0,
    misses: typeof persisted.misses === "number" ? persisted.misses : 0,
    entries: 0,
    oldestAgeMs: null,
  };

  let oldestWrittenAt = null;
  try {
    for (const name of readdirSync(dir)) {
      if (!ENTRY_FILE.test(name)) continue;
      const entry = readJson(join(dir, name));
      if (!entry || typeof entry.writtenAt !== "number") continue;
      result.entries += 1;
      if (oldestWrittenAt === null || entry.writtenAt < oldestWrittenAt) {
        oldestWrittenAt = entry.writtenAt;
      }
    }
  } catch {
    // dir missing → zero entries
  }

  if (oldestWrittenAt !== null) result.oldestAgeMs = now() - oldestWrittenAt;
  return result;
}

// Resolve the effective TTL. Precedence, highest wins:
//   --no-cache (forces 0) → --cache-ttl <s> → AFK_CACHE_TTL env → default 300.
export function resolveTtlSeconds({ noCache = false, cacheTtl, env } = {}) {
  if (noCache) return 0;
  if (cacheTtl != null && cacheTtl !== "") {
    const n = Number(cacheTtl);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const envValue = env ?? process.env.AFK_CACHE_TTL;
  if (envValue != null && envValue !== "") {
    const n = Number(envValue);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_TTL_SECONDS;
}
