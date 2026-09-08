import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Sql, TransactionSql } from "postgres";

import type { TenantMigrationReport } from "./types";
import {
  buildTenantMigrationReport,
  normalizeExplicitAmitUserId,
  verifyAfterAgainstBaseline,
} from "./verifier";

export const TENANT_MIGRATION_STAGES = ["expand", "backfill", "contract", "lifecycle"] as const;
export type TenantSchemaMigrationStage = (typeof TENANT_MIGRATION_STAGES)[number];

const STAGE_FILE: Record<TenantSchemaMigrationStage, string> = {
  expand: "0005_phase3_tenant_expand.sql",
  backfill: "0006_phase3_tenant_backfill.sql",
  contract: "0007_phase3_tenant_contract.sql",
  lifecycle: "0008_phase3_lifecycle.sql",
};

interface AppliedMigrationRow {
  stage: TenantSchemaMigrationStage;
  name: string;
  checksum: string;
  owner_id: string;
}

export interface ApplyTenantMigrationOptions {
  readonly sql: Sql;
  readonly stage: TenantSchemaMigrationStage;
  readonly ownerId: string;
  readonly migrationsDirectory?: string;
  /** Required for contract and compared again inside the contract transaction. */
  readonly baseline?: TenantMigrationReport;
  readonly generatedAt?: Date;
}

export interface AppliedTenantMigration {
  readonly stage: TenantSchemaMigrationStage;
  readonly file: string;
  readonly checksum: string;
  readonly ownerId: string;
  readonly alreadyApplied: boolean;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertBaseline(
  baseline: TenantMigrationReport | undefined,
  ownerId: string
): TenantMigrationReport {
  if (!baseline) throw new Error("Contract migration requires the frozen before report");
  if (baseline.stage !== "before") throw new Error("Contract baseline must be a before report");
  if (!baseline.verification.passed) throw new Error("Contract baseline verification did not pass");
  if (baseline.immutableOwner.userId !== ownerId) {
    throw new Error("Contract baseline was created for a different owner UUID");
  }
  return baseline;
}

async function assertContractVerification(
  transaction: TransactionSql,
  ownerId: string,
  baseline: TenantMigrationReport,
  generatedAt?: Date
): Promise<void> {
  const report = await buildTenantMigrationReport({
    client: transaction,
    ownerId,
    stage: "after",
    through: "expand",
    ...(generatedAt ? { generatedAt } : {}),
  });
  const failures = [
    ...report.verification.failures,
    ...verifyAfterAgainstBaseline(baseline, report),
  ];
  if (failures.length > 0) {
    throw new Error(
      `Contract verification failed:\n${failures
        .map((failure) => `- ${failure.code}: ${failure.detail}`)
        .join("\n")}`
    );
  }
}

/** Apply exactly one lifecycle stage; callers must pause for each gate. */
export async function applyTenantMigrationStage(
  options: ApplyTenantMigrationOptions
): Promise<AppliedTenantMigration> {
  const ownerId = normalizeExplicitAmitUserId(options.ownerId);
  const file = STAGE_FILE[options.stage];
  const directory = resolve(
    options.migrationsDirectory ?? resolve(process.cwd(), "src/lib/postgres/tenant-migrations")
  );
  const migration = await readFile(resolve(directory, file), "utf8");
  const checksum = sha256Text(migration);
  const baseline =
    options.stage === "contract" ? assertBaseline(options.baseline, ownerId) : undefined;

  await options.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS distil_tenant_migrations (
      stage text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum text NOT NULL,
      owner_id uuid NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT distil_tenant_migrations_stage_check
        CHECK (stage IN ('expand','backfill','contract'))
    )
  `);

  let alreadyApplied = false;
  await options.sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext('distil-phase3-tenant-migration'))`;
    const applied = await transaction<AppliedMigrationRow[]>`
      SELECT stage, name, checksum, owner_id::text AS owner_id
      FROM distil_tenant_migrations
      ORDER BY applied_at
    `;
    const existing = applied.find(({ stage }) => stage === options.stage);
    if (existing) {
      if (existing.name !== file || existing.checksum !== checksum) {
        throw new Error(`Applied tenant migration ${options.stage} differs from the file on disk`);
      }
      if (existing.owner_id !== ownerId) {
        throw new Error(`Applied tenant migration ${options.stage} used a different owner UUID`);
      }
      alreadyApplied = true;
      return;
    }

    const requiredStages = TENANT_MIGRATION_STAGES.slice(
      0,
      TENANT_MIGRATION_STAGES.indexOf(options.stage)
    );
    for (const required of requiredStages) {
      const record = applied.find(({ stage }) => stage === required);
      if (!record) throw new Error(`${options.stage} requires the ${required} stage first`);
      if (record.owner_id !== ownerId) throw new Error(`${required} used a different owner UUID`);
    }

    await transaction`SELECT set_config('app.migration_user_id', ${ownerId}, true)`;
    if (options.stage === "contract") {
      await assertContractVerification(transaction, ownerId, baseline!, options.generatedAt);
    }
    await transaction.unsafe(migration);
    await transaction`
      INSERT INTO distil_tenant_migrations (stage, name, checksum, owner_id)
      VALUES (${options.stage}, ${file}, ${checksum}, ${ownerId}::uuid)
    `;
  });

  return { stage: options.stage, file, checksum, ownerId, alreadyApplied };
}
