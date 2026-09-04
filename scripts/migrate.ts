import fs from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import { config } from "../src/lib/config";
import { planMigrations } from "../src/lib/postgres/migration-plan";

async function migrate(): Promise<void> {
  if (!config.databaseMigrationUrl) {
    throw new Error("DATABASE_MIGRATION_URL is required for migrations");
  }

  const migrationsDirectory = path.resolve("src/lib/postgres/migrations");
  const directoryEntries = await fs.readdir(migrationsDirectory);
  const sql = postgres(config.databaseMigrationUrl, { max: 1, prepare: false });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS distil_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const applied = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM distil_migrations`).map((row) => row.name)
    );
    const files = planMigrations(directoryEntries, applied);

    for (const file of files) {
      if (applied.has(file)) continue;
      const migration = await fs.readFile(path.join(migrationsDirectory, file), "utf8");
      await sql.begin(async (transaction) => {
        await transaction.unsafe(migration);
        await transaction`
          INSERT INTO distil_migrations (name) VALUES (${file})
        `;
      });
      process.stdout.write(`Applied ${file}\n`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
});
