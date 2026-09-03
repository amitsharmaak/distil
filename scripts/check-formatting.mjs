#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

let base = process.env.COVERAGE_BASE_REF || "origin/main";
try {
  git(["rev-parse", "--verify", base]);
} catch {
  base = "main";
}

const changed = git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
const files = changed.split("\n").filter(Boolean);

if (files.length === 0) {
  console.log("No changed files to format-check.");
  process.exit(0);
}

const result = spawnSync("npx", ["prettier", "--check", "--ignore-unknown", ...files], {
  encoding: "utf8",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
