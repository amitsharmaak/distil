import fs from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import {
  buildDryRunPlan,
  parseTenantMigrationArgs,
  TENANT_MIGRATION_USAGE,
} from "../src/lib/postgres/tenant-migration/cli";
import {
  buildTenantMigrationReport,
  verifyAfterAgainstBaseline,
} from "../src/lib/postgres/tenant-migration/verifier";
import type {
  ReadonlyQueryClient,
  TenantMigrationReport,
} from "../src/lib/postgres/tenant-migration/types";

async function writeJsonAtomic(output: string, value: unknown): Promise<void> {
  const destination = path.resolve(output);
  const temporary = `${destination}.tmp-${process.pid}`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporary, destination);
}

async function readBaseline(file: string): Promise<TenantMigrationReport> {
  const value = JSON.parse(await fs.readFile(path.resolve(file), "utf8")) as unknown;
  if (!value || typeof value !== "object" || !("contractVersion" in value)) {
    throw new Error("Baseline is not a tenant migration report");
  }
  return value as TenantMigrationReport;
}

async function main(): Promise<void> {
  const options = parseTenantMigrationArgs(process.argv.slice(2));
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(buildDryRunPlan(options.ownerId), null, 2)}\n`);
    return;
  }

  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_MIGRATION_URL is required; the pooled runtime URL is not accepted");
  }
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql.unsafe("SET TIME ZONE 'UTC'");
    await sql.unsafe("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    let report = await buildTenantMigrationReport({
      client: sql as unknown as ReadonlyQueryClient,
      ownerId: options.ownerId,
      stage: options.stage!,
      // The documented before/after gate runs before contract and lifecycle.
      // Operators can opt into the stronger post-lifecycle schema inventory.
      through: options.through ?? "expand",
    });
    if (options.baseline) {
      const comparisonFailures = verifyAfterAgainstBaseline(
        await readBaseline(options.baseline),
        report
      );
      if (comparisonFailures.length > 0) {
        report = {
          ...report,
          verification: {
            passed: false,
            failures: [...report.verification.failures, ...comparisonFailures],
          },
        };
      }
    }
    await writeJsonAtomic(options.output!, report);
    process.stdout.write(
      `${report.verification.passed ? "PASS" : "FAIL"} ${report.stage} verification: ${path.resolve(options.output!)}\n`
    );
    if (!report.verification.passed) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Tenant migration verification failed: ${message}\n\n${TENANT_MIGRATION_USAGE}\n`
  );
  process.exitCode = 1;
});
