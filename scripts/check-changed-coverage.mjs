#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const COVERAGE_PATH = path.resolve("coverage/coverage-final.json");
const MINIMUM = 80;

if (!existsSync(COVERAGE_PATH)) {
  console.error("coverage/coverage-final.json is missing; run Jest with --coverage first.");
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

let base = process.env.COVERAGE_BASE_REF || "origin/main";
try {
  git(["rev-parse", "--verify", base]);
} catch {
  base = "main";
}

const diff = git(["diff", "--unified=0", `${base}...HEAD`, "--", "src/**/*.ts", "src/**/*.tsx"]);
if (!diff) {
  console.log("No changed TypeScript application lines to coverage-check.");
  process.exit(0);
}

const changed = new Map();
let currentFile;
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice(6);
    if (!changed.has(currentFile)) changed.set(currentFile, new Set());
    continue;
  }
  const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (!match || !currentFile) continue;
  const start = Number(match[1]);
  const count = match[2] === undefined ? 1 : Number(match[2]);
  for (let offset = 0; offset < count; offset++) changed.get(currentFile).add(start + offset);
}

const coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf8"));
let statements = 0;
let coveredStatements = 0;
let branches = 0;
let coveredBranches = 0;

for (const [file, lines] of changed) {
  const absolute = path.resolve(file);
  const data = coverage[absolute];
  if (!data) continue;

  for (const [id, location] of Object.entries(data.statementMap || {})) {
    if (!lines.has(location.start.line)) continue;
    statements++;
    if ((data.s?.[id] || 0) > 0) coveredStatements++;
  }

  for (const [id, branch] of Object.entries(data.branchMap || {})) {
    if (!lines.has(branch.loc?.start?.line)) continue;
    const counts = data.b?.[id] || [];
    branches += counts.length;
    coveredBranches += counts.filter((count) => count > 0).length;
  }
}

function percent(covered, total) {
  return total === 0 ? 100 : (covered / total) * 100;
}

const statementPercent = percent(coveredStatements, statements);
const branchPercent = percent(coveredBranches, branches);
console.log(
  `Changed statements: ${coveredStatements}/${statements} (${statementPercent.toFixed(1)}%)`
);
console.log(`Changed branches: ${coveredBranches}/${branches} (${branchPercent.toFixed(1)}%)`);

if (statementPercent < MINIMUM || branchPercent < MINIMUM) {
  console.error(`Changed-code coverage must be at least ${MINIMUM}% for statements and branches.`);
  process.exit(1);
}
