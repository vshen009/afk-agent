#!/usr/bin/env node

const input = process.argv.slice(2).join(" ").trim();

if (!input) {
  console.error("Usage: slugify-batch-name.mjs <title or theme>");
  process.exit(1);
}

console.log(slugify(input));

export function slugify(value, fallback = "afk-batch") {
  const words = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);

  if (!words || words.length === 0) return fallback;

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

  return words
    .filter((word) => !stop.has(word))
    .slice(0, 8)
    .join("-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}
