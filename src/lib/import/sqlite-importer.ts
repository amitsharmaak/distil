import postgres, { type Sql } from "postgres";
import { config } from "../config";
import {
  createSqliteImportPlan,
  type ImportRow,
  type PlannedTable,
  type SqliteImportPlan,
} from "./sqlite-plan";

export interface ImportTransaction {
  upsert(table: PlannedTable): Promise<void>;
  readKeys(table: string, keys: string[]): Promise<ImportRow[]>;
}

export interface ImportTarget {
  transaction<T>(operation: (transaction: ImportTransaction) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

export interface TableVerification {
  table: string;
  sourceCount: number;
  matchedCount: number;
  targetCount: number;
  missingKeys: string[];
  verified: boolean;
}

export interface SqliteImportResult {
  mode: "dry-run" | "executed";
  sourcePath: string;
  tables: TableVerification[];
  excludedTables: string[];
  ignoredTables: string[];
  verified: boolean;
}

const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const keyString = (row: ImportRow, keys: string[]) =>
  JSON.stringify(keys.map((key) => row[key] ?? null));

export function createPostgresImportTarget(url: string): ImportTarget {
  if (!url) {
    throw new Error("DATABASE_MIGRATION_URL is required when --execute is used");
  }
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  return {
    async transaction<T>(operation: (transaction: ImportTransaction) => Promise<T>): Promise<T> {
      return sql.begin(async (transactionSql) =>
        operation(createTransactionAdapter(transactionSql as unknown as Sql))
      ) as Promise<T>;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

function createTransactionAdapter(sql: Sql): ImportTransaction {
  return {
    async upsert({ table, keys, rows }) {
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const values = columns.map((column) => row[column]);
        const updates = columns.filter((column) => !keys.includes(column));
        const conflictAction =
          updates.length === 0
            ? "DO NOTHING"
            : `DO UPDATE SET ${updates
                .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
                .join(", ")}`;
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        const statement = `INSERT INTO ${quoteIdentifier(table)} (${columns
          .map(quoteIdentifier)
          .join(", ")}) VALUES (${placeholders}) ON CONFLICT (${keys
          .map(quoteIdentifier)
          .join(", ")}) ${conflictAction}`;
        await sql.unsafe(statement, values as never[]);
      }
    },
    async readKeys(table, keys) {
      const columns = keys.map(quoteIdentifier).join(", ");
      return (await sql.unsafe(
        `SELECT ${columns} FROM ${quoteIdentifier(table)}`
      )) as unknown as ImportRow[];
    },
  };
}

function dryRunVerification(plan: SqliteImportPlan): TableVerification[] {
  return plan.tables.map(({ table, rows }) => ({
    table,
    sourceCount: rows.length,
    matchedCount: 0,
    targetCount: 0,
    missingKeys: [],
    verified: true,
  }));
}

async function executePlan(
  plan: SqliteImportPlan,
  target: ImportTarget
): Promise<TableVerification[]> {
  return target.transaction(async (transaction) => {
    for (const table of plan.tables) await transaction.upsert(table);

    const verification: TableVerification[] = [];
    for (const table of plan.tables) {
      const targetRows = await transaction.readKeys(table.table, table.keys);
      const targetKeys = new Set(targetRows.map((row) => keyString(row, table.keys)));
      const sourceKeys = table.rows.map((row) => keyString(row, table.keys));
      const missingKeys = sourceKeys.filter((key) => !targetKeys.has(key));
      verification.push({
        table: table.table,
        sourceCount: table.rows.length,
        matchedCount: sourceKeys.length - missingKeys.length,
        targetCount: targetRows.length,
        missingKeys,
        verified: missingKeys.length === 0,
      });
    }
    if (verification.some((table) => !table.verified)) {
      throw new Error("PostgreSQL verification failed; transaction rolled back");
    }
    return verification;
  });
}

export async function importSqlite(options: {
  sourcePath: string;
  execute?: boolean;
  target?: ImportTarget;
  migrationUrl?: string;
}): Promise<SqliteImportResult> {
  const plan = createSqliteImportPlan(options.sourcePath);
  if (!options.execute) {
    return {
      mode: "dry-run",
      sourcePath: options.sourcePath,
      tables: dryRunVerification(plan),
      excludedTables: plan.excludedTables,
      ignoredTables: plan.ignoredTables,
      verified: true,
    };
  }

  const ownsTarget = !options.target;
  const target =
    options.target ??
    createPostgresImportTarget(options.migrationUrl ?? config.databaseMigrationUrl);
  try {
    const tables = await executePlan(plan, target);
    return {
      mode: "executed",
      sourcePath: options.sourcePath,
      tables,
      excludedTables: plan.excludedTables,
      ignoredTables: plan.ignoredTables,
      verified: tables.every((table) => table.verified),
    };
  } finally {
    if (ownsTarget) await target.close?.();
  }
}

export function formatImportResult(result: SqliteImportResult): string {
  const heading =
    result.mode === "dry-run"
      ? "DRY RUN — source validated; PostgreSQL was not modified."
      : result.verified
        ? "IMPORT COMPLETE — every source key was verified in PostgreSQL."
        : "IMPORT FAILED — verification did not pass.";
  const rows = result.tables.map((table) =>
    result.mode === "dry-run"
      ? `${table.table}: source=${table.sourceCount} (planned)`
      : `${table.table}: source=${table.sourceCount}, matched=${table.matchedCount}, target=${table.targetCount}`
  );
  if (result.excludedTables.length) {
    rows.push(`Excluded sensitive/transient tables: ${result.excludedTables.join(", ")}`);
  }
  if (result.ignoredTables.length) rows.push(`Ignored tables: ${result.ignoredTables.join(", ")}`);
  return [heading, ...rows].join("\n");
}
