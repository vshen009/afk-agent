import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ownerRepoFromRemote,
  acSlug,
  normalizeViewport,
  evidenceRelPath,
  rawUrl,
  blobPermalink,
  embedMarkdown,
  stageEvidence,
  EVIDENCE_ROOT,
} from "./evidence.mjs";

test("ownerRepoFromRemote parses https and ssh remotes with or without .git", () => {
  assert.deepEqual(ownerRepoFromRemote("https://github.com/vshen009/afk-agent.git"), {
    owner: "vshen009",
    repo: "afk-agent",
  });
  assert.deepEqual(ownerRepoFromRemote("https://github.com/vshen009/afk-agent"), {
    owner: "vshen009",
    repo: "afk-agent",
  });
  assert.deepEqual(ownerRepoFromRemote("git@github.com:vshen009/afk-agent.git"), {
    owner: "vshen009",
    repo: "afk-agent",
  });
  assert.deepEqual(ownerRepoFromRemote("ssh://git@github.com/vshen009/afk-agent.git"), {
    owner: "vshen009",
    repo: "afk-agent",
  });
});

test("ownerRepoFromRemote returns null for empty or non-owner/repo input", () => {
  assert.equal(ownerRepoFromRemote(""), null);
  assert.equal(ownerRepoFromRemote("not-a-url"), null);
  assert.equal(ownerRepoFromRemote(null), null);
});

test("acSlug lowercases, hyphenates, strips accents, and caps length", () => {
  assert.equal(acSlug("375px mobile: receipt-side hidden"), "375px-mobile-receipt-side-hidden");
  assert.equal(acSlug("Café Ångström RENDER"), "cafe-angstrom-render");
  assert.equal(acSlug("!!!"), "ac"); // nothing left → fallback
  assert.equal(acSlug("a".repeat(80)).length, 48);
  assert.ok(!acSlug("trailing punctuation !!!").endsWith("-")); // no dangling hyphen
});

test("normalizeViewport canonicalises separators and strips whitespace", () => {
  assert.equal(normalizeViewport("375×812"), "375x812");
  assert.equal(normalizeViewport("375 x 812"), "375x812");
  assert.equal(normalizeViewport(" 1280×720 "), "1280x720");
  assert.equal(normalizeViewport(""), "");
});

test("evidenceRelPath builds the committed path and tolerates a #-prefixed issue", () => {
  assert.equal(
    evidenceRelPath(12, "mobile-receipt-hidden", "375x812"),
    `${EVIDENCE_ROOT}/issue-12/mobile-receipt-hidden-375x812.png`,
  );
  assert.equal(
    evidenceRelPath("#12", "mobile-receipt-hidden", "375×812"),
    `${EVIDENCE_ROOT}/issue-12/mobile-receipt-hidden-375x812.png`,
  );
  assert.equal(
    evidenceRelPath(7, "all-states", ""),
    `${EVIDENCE_ROOT}/issue-7/all-states.png`,
  );
});

test("rawUrl and blobPermalink pin the SHA and keep the .afk path readable", () => {
  const target = {
    owner: "acme",
    repo: "widgets",
    sha: "abc123",
    relPath: `${EVIDENCE_ROOT}/issue-12/mobile-receipt-hidden-375x812.png`,
  };
  assert.equal(
    rawUrl(target),
    "https://raw.githubusercontent.com/acme/widgets/abc123/.afk/evidence/issue-12/mobile-receipt-hidden-375x812.png",
  );
  assert.equal(
    blobPermalink(target),
    "https://github.com/acme/widgets/blob/abc123/.afk/evidence/issue-12/mobile-receipt-hidden-375x812.png",
  );
});

test("rawUrl throws when the SHA is missing so an unpinned embed never ships", () => {
  assert.throws(
    () => rawUrl({ owner: "a", repo: "b", relPath: "x.png" }),
    /sha is required/,
  );
  assert.throws(
    () => rawUrl({ sha: "abc", relPath: "x.png" }),
    /owner and repo are required/,
  );
});

test("embedMarkdown renders the inline image plus a blob fallback link", () => {
  const md = embedMarkdown({
    owner: "acme",
    repo: "widgets",
    sha: "abc123",
    relPath: `${EVIDENCE_ROOT}/issue-12/mobile-receipt-hidden-375x812.png`,
    alt: "375px mobile receipt-side hidden",
    viewport: "375×812",
  });
  assert.equal(
    md,
    "![375px mobile receipt-side hidden — 375x812]" +
      "(https://raw.githubusercontent.com/acme/widgets/abc123/.afk/evidence/issue-12/mobile-receipt-hidden-375x812.png) " +
      "([view on GitHub](https://github.com/acme/widgets/blob/abc123/.afk/evidence/issue-12/mobile-receipt-hidden-375x812.png))",
  );
});

test("stageEvidence copies into the evidence dir and git-adds the staged path", () => {
  const calls = { mkdir: [], copy: [], gitAdd: [] };
  const relPath = stageEvidence(
    { screenshot: "/tmp/shot.png", issue: 12, acSlug: "mobile-receipt-hidden", viewport: "375x812" },
    {
      exists: () => true,
      mkdir: (dir) => calls.mkdir.push(dir),
      copy: (src, dest) => calls.copy.push([src, dest]),
      gitAdd: (path) => calls.gitAdd.push(path),
    },
  );
  const expected = `${EVIDENCE_ROOT}/issue-12/mobile-receipt-hidden-375x812.png`;
  assert.equal(relPath, expected);
  assert.deepEqual(calls.mkdir, [`${EVIDENCE_ROOT}/issue-12`]);
  assert.deepEqual(calls.copy, [["/tmp/shot.png", expected]]);
  assert.deepEqual(calls.gitAdd, [expected]);
});

test("stageEvidence refuses to stage a missing screenshot", () => {
  assert.throws(
    () =>
      stageEvidence(
        { screenshot: "/tmp/missing.png", issue: 12, acSlug: "x", viewport: "375x812" },
        { exists: () => false },
      ),
    /screenshot not found/,
  );
});
