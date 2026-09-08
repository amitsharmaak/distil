#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const integrationPattern = /\.integration\.test\.[jt]sx?$/;
const sqlitePattern = /\.sqlite-integration\.test\.[jt]sx?$/;

function findIntegrationTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        [".git", ".next", "coverage", "node_modules", "playwright-report", "test-results"].includes(
          entry.name
        )
      ) {
        return [];
      }
      return findIntegrationTests(path);
    }
    return integrationPattern.test(entry.name) && !sqlitePattern.test(entry.name) ? [path] : [];
  });
}

const tests = findIntegrationTests(root).sort();
if (tests.length === 0) {
  console.error("No PostgreSQL integration tests found.");
  process.exit(1);
}

async function resetSuppliedTestDatabase() {
  const connectionUri = process.env.DISTIL_TEST_POSTGRES_URL;
  if (!connectionUri) return;
  const sql = postgres(connectionUri, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    // CI supplies one disposable service database to multiple isolated Jest
    // processes. Reset its schema so a suite that intentionally drops the
    // migration ledger cannot contaminate the next suite.
    await sql.unsafe(
      "DROP SCHEMA IF EXISTS tenant_api CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public"
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Testcontainers' runtime client is process-scoped. Starting and stopping several
// independent harnesses in one Jest process can leave its Docker sidecar socket
// stale on GitHub runners (the next suite then fails with write EPIPE). Give each
// suite a fresh runtime client while keeping every PostgreSQL test in the gate.
for (const test of tests) {
  await resetSuppliedTestDatabase();
  const displayPath = relative(root, test);
  console.log(`\nRunning PostgreSQL integration suite: ${displayPath}`);
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "node_modules/jest/bin/jest.js"),
      "--runInBand",
      "--testPathIgnorePatterns=\\.sqlite-integration\\.test\\.",
      "--runTestsByPath",
      test,
    ],
    { cwd: root, env: process.env, stdio: "inherit" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
