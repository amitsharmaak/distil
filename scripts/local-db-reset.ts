/**
 * Wipe and re-provision the LOCAL PostgreSQL used for iterating on Distil.
 *
 *   npm run db:local:reset
 *
 * Refuses to run against anything but a loopback host, so it can never touch
 * Neon. Afterwards the database contains every migration, the Phase 3 tenant
 * schema, the runtime login role, and one active owner user matching
 * DISTIL_LEGACY_USER_ID. Content is gone; start capturing again from scratch.
 */
import fs from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import { planMigrations } from "../src/lib/postgres/migration-plan";
import {
  applyTenantMigrationStage,
  buildTenantMigrationReport,
} from "../src/lib/postgres/tenant-migration";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const RUNTIME_ROLE = "distil_app";
const RUNTIME_PASSWORD = "distil_app";

function requireLoopback(url: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`${name} must point at localhost; refusing to reset ${parsed.hostname}`);
  }
  return url;
}

async function applyBaseMigrations(sql: postgres.Sql): Promise<void> {
  const directory = path.resolve("src/lib/postgres/migrations");
  const entries = await fs.readdir(directory);
  await sql`
    CREATE TABLE IF NOT EXISTS distil_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  for (const file of planMigrations(entries, new Set())) {
    const migration = await fs.readFile(path.join(directory, file), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction`INSERT INTO distil_migrations (name) VALUES (${file})`;
    });
    process.stdout.write(`Applied ${file}\n`);
  }
}

async function main(): Promise<void> {
  const ownerUrl = requireLoopback(
    process.env.DATABASE_MIGRATION_URL ?? "",
    "DATABASE_MIGRATION_URL"
  );
  if (process.env.DATABASE_URL) requireLoopback(process.env.DATABASE_URL, "DATABASE_URL");
  const ownerId = process.env.DISTIL_LEGACY_USER_ID;
  if (!ownerId)
    throw new Error("DISTIL_LEGACY_USER_ID is required (any UUID; it is the local owner)");
  const ownerEmail = process.env.DISTIL_LOCAL_OWNER_EMAIL ?? "owner@distil.local";

  const sql = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    process.stdout.write("Dropping local schemas...\n");
    await sql.unsafe(
      "DROP SCHEMA IF EXISTS tenant_api CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public"
    );

    await applyBaseMigrations(sql);
    await sql.unsafe(
      await fs.readFile(path.resolve("src/lib/postgres/roles/phase3_roles.sql"), "utf8")
    );

    const migrationsDirectory = path.resolve("src/lib/postgres/tenant-migrations");
    const stage = async (name: "expand" | "backfill" | "lifecycle" | "returning-auth") => {
      await applyTenantMigrationStage({ sql, stage: name, ownerId, migrationsDirectory });
      process.stdout.write(`Applied tenant stage ${name}\n`);
    };
    await stage("expand");
    const baseline = await buildTenantMigrationReport({ client: sql, stage: "before", ownerId });
    await stage("backfill");
    await applyTenantMigrationStage({
      sql,
      stage: "contract",
      ownerId,
      migrationsDirectory,
      baseline,
    });
    process.stdout.write("Applied tenant stage contract\n");
    await stage("lifecycle");
    await stage("returning-auth");

    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
          CREATE ROLE ${RUNTIME_ROLE} LOGIN PASSWORD '${RUNTIME_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
        END IF;
      END
      $$;
      GRANT distil_runtime TO ${RUNTIME_ROLE};
    `);

    await sql`
      INSERT INTO users (id, status, primary_email)
      VALUES (${ownerId}::uuid, 'active', ${ownerEmail})
      ON CONFLICT (id) DO UPDATE SET status = 'active', primary_email = EXCLUDED.primary_email
    `;
    process.stdout.write(`Local database reset. Owner ${ownerId} is active.\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Local reset failed: ${message}\n`);
  process.exitCode = 1;
});
