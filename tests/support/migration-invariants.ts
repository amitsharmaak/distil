import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Sql } from "postgres";

export type RlsPolicyCommand = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export interface TenantTableInvariantSpec {
  tableName: string;
  tenantColumn?: string;
  tenantReferences?: {
    tableName: string;
    columnName?: string;
  };
  requireNotNull?: boolean;
  requireRls?: boolean;
  requireForcedRls?: boolean;
  requiredPolicyCommands?: RlsPolicyCommand[];
  policySetting?: string;
  /** Business keys that must be unique within, rather than across, tenants. */
  tenantScopedUniqueKeys?: string[][];
}

export interface TenantMigrationEvidence {
  present: boolean;
  files: string[];
  signals: {
    tenantColumn: boolean;
    rlsEnabled: boolean;
    policyCreated: boolean;
  };
}

const SQL_FILE = /^\d+[A-Za-z0-9._-]*\.sql$/;

/**
 * Detect the production handoff without naming a migration number. The RLS
 * suite remains skipped until all three structural signals exist somewhere in
 * the ordered migration set.
 */
export function findTenantMigrationEvidence(migrationsDirectory: string): TenantMigrationEvidence {
  const directory = resolve(migrationsDirectory);
  const files = readdirSync(directory)
    .filter((name) => SQL_FILE.test(name))
    .sort((left, right) => left.localeCompare(right));
  const tenantFiles = files.filter((name) => {
    const source = readFileSync(resolve(directory, name), "utf8");
    return /\b(?:user_id|workspace_id)\b/i.test(source) || /ROW\s+LEVEL\s+SECURITY/i.test(source);
  });
  const source = files.map((name) => readFileSync(resolve(directory, name), "utf8")).join("\n");
  const signals = {
    tenantColumn: /\b(?:user_id|workspace_id)\b/i.test(source),
    rlsEnabled: /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(source),
    policyCreated: /CREATE\s+POLICY/i.test(source),
  };
  return {
    present: Object.values(signals).every(Boolean),
    files: tenantFiles,
    signals,
  };
}

interface ColumnRow {
  is_nullable: "YES" | "NO";
}

interface TableSecurityRow {
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
}

interface ForeignKeyRow {
  foreign_table: string;
  foreign_column: string;
}

interface PolicyRow {
  policyname: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

interface UniqueIndexRow {
  index_name: string;
  columns: string[];
}

function containsColumns(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((column) => actual.includes(column));
}

/** Inspect migrated PostgreSQL catalogs instead of relying on SQL regexes. */
export async function tenantMigrationInvariantIssues(
  sql: Sql,
  specs: readonly TenantTableInvariantSpec[]
): Promise<string[]> {
  const issues: string[] = [];

  for (const spec of specs) {
    const tenantColumn = spec.tenantColumn ?? "user_id";
    const columns = await sql<ColumnRow[]>`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${spec.tableName}
        AND column_name = ${tenantColumn}
    `;
    if (columns.length === 0) {
      issues.push(`${spec.tableName} is missing ${tenantColumn}`);
      continue;
    }
    if ((spec.requireNotNull ?? true) && columns[0].is_nullable !== "NO") {
      issues.push(`${spec.tableName}.${tenantColumn} must be NOT NULL`);
    }

    const tableSecurity = await sql<TableSecurityRow[]>`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ${spec.tableName}
    `;
    if ((spec.requireRls ?? true) && tableSecurity[0]?.relrowsecurity !== true) {
      issues.push(`${spec.tableName} must ENABLE ROW LEVEL SECURITY`);
    }
    if ((spec.requireForcedRls ?? true) && tableSecurity[0]?.relforcerowsecurity !== true) {
      issues.push(`${spec.tableName} must FORCE ROW LEVEL SECURITY`);
    }

    if (spec.tenantReferences) {
      const foreignKeys = await sql<ForeignKeyRow[]>`
        SELECT foreign_table.relname AS foreign_table,
               foreign_attribute.attname AS foreign_column
        FROM pg_catalog.pg_constraint constraint_row
        JOIN pg_catalog.pg_class source_table ON source_table.oid = constraint_row.conrelid
        JOIN pg_catalog.pg_namespace source_namespace
          ON source_namespace.oid = source_table.relnamespace
        JOIN pg_catalog.pg_class foreign_table ON foreign_table.oid = constraint_row.confrelid
        JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey)
          AS keys(source_attnum, foreign_attnum) ON true
        JOIN pg_catalog.pg_attribute source_attribute
          ON source_attribute.attrelid = source_table.oid
         AND source_attribute.attnum = keys.source_attnum
        JOIN pg_catalog.pg_attribute foreign_attribute
          ON foreign_attribute.attrelid = foreign_table.oid
         AND foreign_attribute.attnum = keys.foreign_attnum
        WHERE constraint_row.contype = 'f'
          AND source_namespace.nspname = 'public'
          AND source_table.relname = ${spec.tableName}
          AND source_attribute.attname = ${tenantColumn}
      `;
      const referenceColumn = spec.tenantReferences.columnName ?? "id";
      if (
        !foreignKeys.some(
          (key) =>
            key.foreign_table === spec.tenantReferences?.tableName &&
            key.foreign_column === referenceColumn
        )
      ) {
        issues.push(
          `${spec.tableName}.${tenantColumn} must reference ${spec.tenantReferences.tableName}.${referenceColumn}`
        );
      }
    }

    const policies = await sql<PolicyRow[]>`
      SELECT policyname, cmd, qual, with_check
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = ${spec.tableName}
    `;
    for (const command of spec.requiredPolicyCommands ?? ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      if (!policies.some((policy) => policy.cmd === command || policy.cmd === "ALL")) {
        issues.push(`${spec.tableName} has no RLS policy covering ${command}`);
      }
    }
    if (spec.policySetting) {
      const policySql = policies
        .flatMap((policy) => [policy.qual, policy.with_check])
        .filter((value): value is string => Boolean(value))
        .join(" ");
      if (!policySql.includes(tenantColumn) || !policySql.includes(spec.policySetting)) {
        issues.push(
          `${spec.tableName} policies must bind ${tenantColumn} to ${spec.policySetting}`
        );
      }
    }

    if (spec.tenantScopedUniqueKeys && spec.tenantScopedUniqueKeys.length > 0) {
      const uniqueIndexes = await sql<UniqueIndexRow[]>`
        SELECT index_class.relname AS index_name,
               array_agg(attribute.attname ORDER BY key.ordinality)::text[] AS columns
        FROM pg_catalog.pg_class table_class
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = table_class.relnamespace
        JOIN pg_catalog.pg_index index_row ON index_row.indrelid = table_class.oid
        JOIN pg_catalog.pg_class index_class ON index_class.oid = index_row.indexrelid
        CROSS JOIN LATERAL unnest(index_row.indkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_catalog.pg_attribute attribute
          ON attribute.attrelid = table_class.oid AND attribute.attnum = key.attnum
        WHERE namespace.nspname = 'public'
          AND table_class.relname = ${spec.tableName}
          AND index_row.indisunique
        GROUP BY index_class.relname
      `;
      for (const businessKey of spec.tenantScopedUniqueKeys) {
        const expected = [tenantColumn, ...businessKey];
        if (!uniqueIndexes.some((index) => containsColumns(index.columns, expected))) {
          issues.push(`${spec.tableName} needs tenant-scoped unique key (${expected.join(", ")})`);
        }
      }
    }
  }

  return issues;
}

export async function assertTenantMigrationInvariants(
  sql: Sql,
  specs: readonly TenantTableInvariantSpec[]
): Promise<void> {
  const issues = await tenantMigrationInvariantIssues(sql, specs);
  if (issues.length > 0) {
    throw new Error(`Tenant migration invariants failed:\n- ${issues.join("\n- ")}`);
  }
}
