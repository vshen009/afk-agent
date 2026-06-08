// L3 acceptance-evidence helper: commit a screenshot to the task branch and
// build the GitHub-hosted URLs that embed it into the AC verification report.
//
// Deep module: the public surface is a set of pure builders
// (`ownerRepoFromRemote`, `acSlug`, `normalizeViewport`, `evidenceRelPath`,
// `rawUrl`, `blobPermalink`, `embedMarkdown`) plus one thin side-effecting
// helper used by the CLI (`stageEvidence` copies a screenshot into the evidence
// dir and `git add`s it). The git/fs executors are injectable so unit tests
// never touch the filesystem or shell out.
//
// Path convention: screenshots live at
//   .afk/evidence/issue-<n>/<ac-slug>-<viewport>.png
// committed to the task branch. URLs are pinned to a commit SHA so the embedded
// image is immutable and survives later history edits. For public repos the raw
// URL renders inline in the comment; for private repos it does not (camo cannot
// auth), but the committed PNG is still visible natively in the PR "Files
// changed" tab and the blob permalink opens for repo members — so the report
// always carries both the inline embed and the blob link.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const EVIDENCE_ROOT = ".afk/evidence";

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

// `{ owner, repo }` parsed from a git remote URL (https / ssh, with or without a
// trailing `.git`). Returns null when the URL does not contain an owner/repo pair.
export function ownerRepoFromRemote(remoteUrl) {
  const url = String(remoteUrl ?? "").trim();
  if (!url) return null;

  const cleaned = url
    .replace(/\.git$/i, "")
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, "") // https:// / ssh:// host/
    .replace(/^git@[^:]+:/i, "") // git@host:
    .replace(/^\/+/, "");

  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts.slice(-2);
  if (!owner || !repo) return null;
  return { owner, repo };
}

// Stable, filesystem-safe slug for an AC line. Strips accents, lowercases, and
// collapses non-alphanumerics to single hyphens, capped at `maxLen`.
export function acSlug(text, maxLen = 48) {
  const slug = String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return slug || "ac";
}

// Canonical viewport token: "375×812" / "375 x 812" → "375x812".
export function normalizeViewport(viewport) {
  return String(viewport ?? "")
    .trim()
    .replace(/[×✕✖]/g, "x")
    .replace(/\s+/g, "");
}

// Repo-relative path where the screenshot is committed on the task branch.
export function evidenceRelPath(issueNumber, slug, viewport, ext = "png") {
  const n = String(issueNumber ?? "").replace(/[^0-9]/g, "");
  const vp = normalizeViewport(viewport);
  const base = vp ? `${slug}-${vp}` : String(slug);
  return `${EVIDENCE_ROOT}/issue-${n}/${base}.${ext}`;
}

function encodePath(relPath) {
  return String(relPath)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function assertTarget({ owner, repo, sha, relPath }) {
  if (!owner || !repo) throw new Error("owner and repo are required (pass --owner/--repo or a resolvable origin remote)");
  if (!sha) throw new Error("sha is required (pin the embed to a pushed commit: git rev-parse HEAD)");
  if (!relPath) throw new Error("relPath is required");
}

// SHA-pinned raw URL — renders inline in public-repo markdown.
export function rawUrl({ owner, repo, sha, relPath }) {
  assertTarget({ owner, repo, sha, relPath });
  return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encodePath(relPath)}`;
}

// SHA-pinned blob permalink — clickable for repo members (private-repo fallback).
export function blobPermalink({ owner, repo, sha, relPath }) {
  assertTarget({ owner, repo, sha, relPath });
  return `https://github.com/${owner}/${repo}/blob/${sha}/${encodePath(relPath)}`;
}

// The evidence line for the AC verification report: inline image + blob link.
export function embedMarkdown({ owner, repo, sha, relPath, alt = "L3 screenshot", viewport }) {
  const raw = rawUrl({ owner, repo, sha, relPath });
  const blob = blobPermalink({ owner, repo, sha, relPath });
  const vp = normalizeViewport(viewport);
  const caption = vp ? `${alt} — ${vp}` : alt;
  return `![${caption}](${raw}) ([view on GitHub](${blob}))`;
}

// Copy a screenshot into the evidence dir and stage it. Side effects (copy,
// mkdir, git add, existence check) are injectable for tests. Returns the
// repo-relative path that was staged.
export function stageEvidence({ screenshot, issue, acSlug: slug, viewport, ext = "png" }, deps = {}) {
  const {
    exists = existsSync,
    mkdir = (dir) => mkdirSync(dir, { recursive: true }),
    copy = copyFileSync,
    gitAdd = (path) => execFileSync("git", ["add", "--", path], { stdio: ["ignore", "pipe", "pipe"] }),
  } = deps;

  if (!screenshot) throw new Error("screenshot path is required");
  if (!exists(screenshot)) throw new Error(`screenshot not found: ${screenshot}`);
  if (!slug) throw new Error("ac-slug is required");

  const relPath = evidenceRelPath(issue, slug, viewport, ext);
  mkdir(dirname(relPath));
  copy(screenshot, relPath);
  gitAdd(relPath);
  return relPath;
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function resolveOwnerRepo(flags) {
  if (flags.owner && flags.repo) return { owner: flags.owner, repo: flags.repo };
  const parsed = ownerRepoFromRemote(flags.remote === true ? defaultGitRemote() : flags.remote ?? defaultGitRemote());
  return {
    owner: flags.owner || parsed?.owner,
    repo: flags.repo || parsed?.repo,
  };
}

function runCli(argv) {
  const [sub, ...rest] = argv;
  const flags = parseFlags(rest);

  if (sub === "stage") {
    const relPath = stageEvidence({
      screenshot: flags.screenshot,
      issue: flags.issue,
      acSlug: flags["ac-slug"],
      viewport: flags.viewport,
    });
    process.stdout.write(`${relPath}\n`);
    return;
  }

  if (sub === "url") {
    const { owner, repo } = resolveOwnerRepo(flags);
    const relPath = flags.relpath || evidenceRelPath(flags.issue, flags["ac-slug"], flags.viewport);
    const target = { owner, repo, sha: flags.sha, relPath };
    const payload = {
      relPath,
      rawUrl: rawUrl(target),
      blobUrl: blobPermalink(target),
      embedMarkdown: embedMarkdown({ ...target, alt: flags.alt || flags["ac-slug"], viewport: flags.viewport }),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stderr.write(
    [
      "Usage:",
      "  evidence.mjs stage --screenshot <path> --issue <n> --ac-slug <slug> --viewport <w>x<h>",
      "  evidence.mjs url   --sha <sha> --issue <n> --ac-slug <slug> --viewport <w>x<h> [--owner <o> --repo <r>]",
      "",
      "`stage` copies the screenshot into .afk/evidence/issue-<n>/ and git-adds it (no SHA yet).",
      "`url` prints the SHA-pinned raw URL, blob link, and embed markdown for the report.",
    ].join("\n") + "\n",
  );
  process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) runCli(process.argv.slice(2));
