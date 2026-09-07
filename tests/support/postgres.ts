import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres, { type Sql } from "postgres";

const MIGRATION_TABLE = "__distil_test_migrations";
const MIGRATION_FILE_PATTERN = /^\d+[A-Za-z0-9._-]*\.sql$/;

export interface SqlMigration {
  name: string;
  checksum: string;
  sql: string;
}

export interface PostgresTestHarnessOptions {
  image?: string;
  database?: string;
  username?: string;
  password?: string;
  connectionUri?: string;
}

export async function loadSqlMigrations(migrationsDirectory: string): Promise<SqlMigration[]> {
  const directory = resolve(migrationsDirectory);
  const names = (await readdir(directory))
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(directory, name), "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    })
  );
}

/** Apply immutable, ordered SQL files once inside a single transaction. */
export async function migrateTestDatabase(sql: Sql, migrationsDirectory: string): Promise<void> {
  const migrations = await loadSqlMigrations(migrationsDirectory);

  await sql.begin(async (transaction) => {
    await transaction.unsafe(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = await transaction<{ name: string; checksum: string }[]>`
      SELECT name, checksum
      FROM ${transaction(MIGRATION_TABLE)}
    `;
    const appliedByName = new Map(applied.map((migration) => [migration.name, migration.checksum]));

    for (const migration of migrations) {
      const appliedChecksum = appliedByName.get(migration.name);
      if (appliedChecksum && appliedChecksum !== migration.checksum) {
        throw new Error(`Applied migration ${migration.name} differs from the file on disk`);
      }
      if (appliedChecksum) continue;

      await transaction.unsafe(migration.sql);
      await transaction`
        INSERT INTO ${transaction(MIGRATION_TABLE)} (name, checksum)
        VALUES (${migration.name}, ${migration.checksum})
      `;
    }
  });
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Truncate every application table and restart identities between tests. */
export async function resetTestDatabase(
  sql: Sql,
  options: { preserveMigrationHistory?: boolean } = {}
): Promise<void> {
  const preserveMigrationHistory = options.preserveMigrationHistory ?? true;
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  const names = tables
    .map(({ tablename }) => tablename)
    .filter((name) => !preserveMigrationHistory || name !== MIGRATION_TABLE);

  if (names.length === 0) return;

  const identifiers = names.map(quoteIdentifier).join(", ");
  await sql.unsafe(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`);
}

export class PostgresTestHarness {
  private container?: StartedPostgreSqlContainer;
  private client?: Sql;
  private activeConnectionUri?: string;

  constructor(private readonly options: PostgresTestHarnessOptions = {}) {}

  get sql(): Sql {
    if (!this.client) {
      throw new Error("PostgreSQL test harness has not been started");
    }
    return this.client;
  }

  get connectionUri(): string {
    if (!this.activeConnectionUri) {
      throw new Error("PostgreSQL test harness has not been started");
    }
    return this.activeConnectionUri;
  }

  async start(): Promise<this> {
    if (this.container || this.client) {
      throw new Error("PostgreSQL test harness is already started");
    }

    const suppliedConnectionUri =
      this.options.connectionUri ?? process.env.DISTIL_TEST_POSTGRES_URL;
    const container = suppliedConnectionUri
      ? undefined
      : await new PostgreSqlContainer(this.options.image ?? "postgres:16-alpine")
          .withDatabase(this.options.database ?? "distil_test")
          .withUsername(this.options.username ?? "distil")
          .withPassword(this.options.password ?? "distil_test_password")
          .start();
    const connectionUri = suppliedConnectionUri ?? container?.getConnectionUri();
    if (!connectionUri)
      throw new Error("PostgreSQL test harness could not determine a connection URI");

    try {
      const client = postgres(connectionUri, {
        max: 2,
        prepare: false,
        connect_timeout: 10,
        onnotice: () => undefined,
      });
      await client`SELECT 1`;
      this.container = container;
      this.client = client;
      this.activeConnectionUri = connectionUri;
      return this;
    } catch (error) {
      await container?.stop();
      throw error;
    }
  }

  async migrate(migrationsDirectory: string): Promise<void> {
    await migrateTestDatabase(this.sql, migrationsDirectory);
  }

  async reset(options?: { preserveMigrationHistory?: boolean }): Promise<void> {
    await resetTestDatabase(this.sql, options);
  }

  async stop(): Promise<void> {
    const client = this.client;
    const container = this.container;
    this.client = undefined;
    this.container = undefined;
    this.activeConnectionUri = undefined;

    let clientError: unknown;
    if (client) {
      try {
        await client.end({ timeout: 5 });
      } catch (error) {
        clientError = error;
      }
    }
    if (container) {
      await container.stop();
    }
    if (clientError) throw clientError;
  }
}
