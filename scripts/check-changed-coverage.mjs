#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COVERAGE_PATH = path.resolve("coverage/coverage-final.json");
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const TYPE_ONLY_FILES = new Set([
  "src/components/phase2/types.ts",
  "src/lib/contracts/capture.ts",
  "src/lib/digests/types.ts",
  "src/lib/intelligence/types.ts",
  "src/lib/knowledge/types.ts",
  "src/lib/auth/ports.ts",
  "src/lib/repositories/ports.ts",
  "src/lib/types.ts",
]);

export function selectBaseRef(git, configuredBase) {
  const candidates = [configuredBase, "origin/main", "main", "HEAD^"].filter(Boolean);
  for (const candidate of candidates) {
    if (/^0+$/.test(candidate)) continue;
    try {
      git(["rev-parse", "--verify", candidate]);
      if (git(["rev-parse", candidate]) !== git(["rev-parse", "HEAD"])) return candidate;
    } catch {
      // Try the next deterministic base candidate.
    }
  }
  return undefined;
}

export function parseChangedLines(diff) {
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
  return changed;
}

function percent(covered, total) {
  return total === 0 ? 100 : (covered / total) * 100;
}

function lineCounts(data, selectedLines) {
  const counts = new Map();
  for (const [id, location] of Object.entries(data.statementMap || {})) {
    const line = location.start.line;
    if (selectedLines && !selectedLines.has(line)) continue;
    counts.set(line, (counts.get(line) || 0) + (data.s?.[id] || 0));
  }
  return { total: counts.size, covered: [...counts.values()].filter((count) => count > 0).length };
}

export function changedCoverage(coverage, changed, root = process.cwd()) {
  const result = { lines: 0, coveredLines: 0, branches: 0, coveredBranches: 0, missing: [] };
  for (const [file, selectedLines] of changed) {
    if (file.includes("/__tests__/") || /\.test\.[jt]sx?$/.test(file) || TYPE_ONLY_FILES.has(file))
      continue;
    const data = coverage[path.resolve(root, file)];
    if (!data) {
      result.missing.push(file);
      continue;
    }
    const fileLines = lineCounts(data, selectedLines);
    result.lines += fileLines.total;
    result.coveredLines += fileLines.covered;
    for (const [id, branch] of Object.entries(data.branchMap || {})) {
      if (!selectedLines.has(branch.loc?.start?.line)) continue;
      const counts = data.b?.[id] || [];
      result.branches += counts.length;
      result.coveredBranches += counts.filter((count) => count > 0).length;
    }
  }
  return result;
}

const CRITICAL_GROUPS = {
  auth: (file) => file.includes("/src/lib/auth/"),
  capture: (file) => file.includes("/src/lib/capture/") && !file.endsWith("/url-safety.ts"),
  queue: (file) => file.includes("/src/lib/queue/"),
  "URL safety": (file) => file.endsWith("/src/lib/capture/url-safety.ts"),
  migration: (file) =>
    file.includes("/src/lib/import/") || file.endsWith("/src/lib/postgres/migration-plan.ts"),
};

export function criticalCoverage(coverage) {
  return Object.entries(CRITICAL_GROUPS).map(([name, matches]) => {
    const totals = {
      statements: 0,
      coveredStatements: 0,
      branches: 0,
      coveredBranches: 0,
      functions: 0,
      coveredFunctions: 0,
      lines: 0,
      coveredLines: 0,
    };
    for (const [file, data] of Object.entries(coverage)) {
      if (!matches(file) || file.includes("/__tests__/") || /\.test\.[jt]sx?$/.test(file)) continue;
      const statements = Object.values(data.s || {});
      const branches = Object.values(data.b || {}).flat();
      const functions = Object.values(data.f || {});
      const lines = lineCounts(data);
      totals.statements += statements.length;
      totals.coveredStatements += statements.filter((count) => count > 0).length;
      totals.branches += branches.length;
      totals.coveredBranches += branches.filter((count) => count > 0).length;
      totals.functions += functions.length;
      totals.coveredFunctions += functions.filter((count) => count > 0).length;
      totals.lines += lines.total;
      totals.coveredLines += lines.covered;
    }
    return { name, totals };
  });
}

export function evaluateCoverage(coverage, changed, root = process.cwd()) {
  const changedResult = changedCoverage(coverage, changed, root);
  const failures = [];
  const changedLines = percent(changedResult.coveredLines, changedResult.lines);
  const changedBranches = percent(changedResult.coveredBranches, changedResult.branches);
  if (changedResult.missing.length)
    failures.push(`Missing coverage data: ${changedResult.missing.join(", ")}`);
  if (changedLines < 80 || changedBranches < 80)
    failures.push("Changed-code coverage must be at least 80% for lines and branches.");
  const critical = criticalCoverage(coverage).map(({ name, totals }) => {
    const metrics = {
      statements: percent(totals.coveredStatements, totals.statements),
      branches: percent(totals.coveredBranches, totals.branches),
      functions: percent(totals.coveredFunctions, totals.functions),
      lines: percent(totals.coveredLines, totals.lines),
    };
    if (Object.values(metrics).some((value) => value < 90))
      failures.push(`${name} coverage must be at least 90% for every metric.`);
    return { name, metrics };
  });
  return { changedResult, changedLines, changedBranches, critical, failures };
}

function run() {
  if (!existsSync(COVERAGE_PATH))
    throw new Error("coverage/coverage-final.json is missing; run Jest with --coverage first.");
  // The first push to a long-lived branch compares against main and can exceed
  // Node's 1 MiB default buffer even with a zero-context diff.
  const git = (args) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES }).trim();
  const base = selectBaseRef(git, process.env.COVERAGE_BASE_REF);
  if (!base) throw new Error("Unable to determine a coverage base distinct from HEAD.");
  const diff = git(["diff", "--unified=0", `${base}...HEAD`, "--", "src/**/*.ts", "src/**/*.tsx"]);
  const result = evaluateCoverage(
    JSON.parse(readFileSync(COVERAGE_PATH, "utf8")),
    parseChangedLines(diff)
  );
  console.log(
    `Changed lines: ${result.changedResult.coveredLines}/${result.changedResult.lines} (${result.changedLines.toFixed(1)}%)`
  );
  console.log(
    `Changed branches: ${result.changedResult.coveredBranches}/${result.changedResult.branches} (${result.changedBranches.toFixed(1)}%)`
  );
  for (const group of result.critical) {
    console.log(
      `${group.name}: ${Object.entries(group.metrics)
        .map(([key, value]) => `${key} ${value.toFixed(1)}%`)
        .join(", ")}`
    );
  }
  if (result.failures.length) {
    for (const failure of result.failures) console.error(failure);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
