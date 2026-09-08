import fs from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import {
  applyTenantMigrationStage,
  TENANT_MIGRATION_STAGES,
  type TenantSchemaMigrationStage,
} from "../src/lib/postgres/tenant-migration/migrator";
import type { TenantMigrationReport } from "../src/lib/postgres/tenant-migration/types";
import { normalizeExplicitAmitUserId } from "../src/lib/postgres/tenant-migration/verifier";

const USAGE = `Usage:
  npm run db:tenant:migrate -- --stage expand --amit-user-id <uuid>
  npm run db:tenant:migrate -- --stage backfill --amit-user-id <uuid>
  npm run db:tenant:migrate -- --stage contract --amit-user-id <uuid> --baseline <before.json>
  npm run db:tenant:migrate -- --stage lifecycle --amit-user-id <uuid>

Only one stage is applied per invocation. Contract re-runs after verification inside the same transaction.`;

interface Options {
  stage: TenantSchemaMigrationStage;
  ownerId: string;
  baseline?: string;
}

function parseArgs(argv: readonly string[]): Options {
  let stage: TenantSchemaMigrationStage | undefined;
  let ownerId: string | undefined;
  let baseline: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      return value;
    };
    if (argument === "--stage") {
      const value = next();
      if (!TENANT_MIGRATION_STAGES.includes(value as TenantSchemaMigrationStage)) {
        throw new Error(`Invalid --stage: ${value}`);
      }
      stage = value as TenantSchemaMigrationStage;
    } else if (argument === "--amit-user-id") ownerId = next();
    else if (argument === "--baseline") baseline = next();
    else if (argument === "--help" || argument === "-h") throw new Error(USAGE);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!stage) throw new Error("--stage is required");
  if (!ownerId) throw new Error("--amit-user-id is required; ownership is never inferred");
  ownerId = normalizeExplicitAmitUserId(ownerId);
  if (stage === "contract" && !baseline) throw new Error("--baseline is required for contract");
  if (stage !== "contract" && baseline) throw new Error("--baseline is only valid for contract");
  return { stage, ownerId, ...(baseline ? { baseline } : {}) };
}

async function readBaseline(file: string | undefined): Promise<TenantMigrationReport | undefined> {
  if (!file) return undefined;
  const value = JSON.parse(await fs.readFile(path.resolve(file), "utf8")) as unknown;
  if (!value || typeof value !== "object" || !("contractVersion" in value)) {
    throw new Error("Baseline is not a tenant migration report");
  }
  return value as TenantMigrationReport;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_MIGRATION_URL is required; the pooled runtime URL is not accepted");
  }
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql.unsafe("SET TIME ZONE 'UTC'");
    const result = await applyTenantMigrationStage({
      sql,
      stage: options.stage,
      ownerId: options.ownerId,
      baseline: await readBaseline(options.baseline),
    });
    process.stdout.write(
      `${result.alreadyApplied ? "Verified" : "Applied"} ${result.stage}: ${result.file}\n`
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Tenant migration failed: ${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
