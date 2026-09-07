import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Sql } from "postgres";
import type { TenantMigrationManifest } from "@/lib/postgres/tenant-migration/types";

export type RlsPolicyCommand = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export interface TenantTableInvariantSpec {
  tableName: string;
  ownerColumn?: string;
  tenantReferences?: {
    tableName: string;
    columnName?: string;
  };
  /**
   * Every relation between tenant-owned tables must include ownership on both
   * sides. A standalone foreign key (for example item_id -> items.id) can
   * otherwise join an alpha row to beta's item when ids are guessed or copied.
   */
  ownershipReferences?: readonly {
    name: string;
    sourceColumns: readonly string[];
    targetTable: string;
    targetColumns: readonly string[];
  }[];
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
    userColumn: boolean;
    rlsEnabled: boolean;
    policyCreated: boolean;
  };
}

export interface TenantIsolationActivation {
  ready: boolean;
  /** Missing feature markers, intentionally specific to the immutable inventory. */
  missing: string[];
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
    return /\buser_id\b/i.test(source) || /ROW\s+LEVEL\s+SECURITY/i.test(source);
  });
  const source = files.map((name) => readFileSync(resolve(directory, name), "utf8")).join("\n");
  const signals = {
    userColumn: /\buser_id\b/i.test(source),
    rlsEnabled: /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(source),
    policyCreated: /CREATE\s+POLICY/i.test(source),
  };
  return {
    present: Object.values(signals).every(Boolean),
    files: tenantFiles,
    signals,
  };
}

/**
 * Do not turn the real RLS gate on for a partial migration. A Phase 3 migration
 * is considered present only when its SQL explicitly names every frozen tenant
 * table and the three security primitives. Catalog assertions still make the
 * suite fail as soon as that precise handoff is attempted incorrectly.
 */
export function findTenantIsolationActivation(
  migrationsDirectory: string,
  manifest: Pick<TenantMigrationManifest, "tables">
): TenantIsolationActivation {
  const directory = resolve(migrationsDirectory);
  const files = readdirSync(directory)
    .filter((name) => SQL_FILE.test(name))
    .sort((left, right) => left.localeCompare(right));
  const source = files.map((name) => readFileSync(resolve(directory, name), "utf8")).join("\n");
  const missing: string[] = [];
  if (!/\buser_id\b/i.test(source)) missing.push("user_id ownership column");
  if (!/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(source)) missing.push("ENABLE ROW LEVEL SECURITY");
  if (!/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(source)) missing.push("FORCE ROW LEVEL SECURITY");
  if (!/CREATE\s+POLICY/i.test(source)) missing.push("CREATE POLICY");
  for (const { table } of manifest.tables) {
    if (!new RegExp(`\\b${table}\\b`, "i").test(source)) missing.push(`table marker: ${table}`);
  }
  return { ready: missing.length === 0, missing };
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

interface CompositeForeignKeyRow {
  constraint_name: string;
  source_columns: string[];
  foreign_table: string;
  foreign_columns: string[];
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

/** Generate catalog checks from the immutable Phase 2 / Wave 0 manifest. */
export function tenantManifestInvariantSpecs(
  manifest: Pick<TenantMigrationManifest, "tables">
): TenantTableInvariantSpec[] {
  return manifest.tables.map((table) => ({
    tableName: table.table,
    tenantReferences: { tableName: "users" },
    policySetting: "app.user_id",
    ownershipReferences: table.references.map((reference) => ({
      name: reference.name,
      sourceColumns: reference.columns,
      targetTable: reference.targetTable,
      targetColumns: reference.targetColumns,
    })),
    tenantScopedUniqueKeys: table.uniqueness.map((uniqueness) => [...uniqueness.columns]),
  }));
}

/** Inspect migrated PostgreSQL catalogs instead of relying on SQL regexes. */
export async function tenantMigrationInvariantIssues(
  sql: Sql,
  specs: readonly TenantTableInvariantSpec[]
): Promise<string[]> {
  const issues: string[] = [];

  for (const spec of specs) {
    const userColumn = spec.ownerColumn ?? "user_id";
    const columns = await sql<ColumnRow[]>`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${spec.tableName}
        AND column_name = ${userColumn}
    `;
    if (columns.length === 0) {
      issues.push(`${spec.tableName} is missing ${userColumn}`);
      continue;
    }
    if ((spec.requireNotNull ?? true) && columns[0].is_nullable !== "NO") {
      issues.push(`${spec.tableName}.${userColumn} must be NOT NULL`);
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
          AND source_attribute.attname = ${userColumn}
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
          `${spec.tableName}.${userColumn} must reference ${spec.tenantReferences.tableName}.${referenceColumn}`
        );
      }
    }

    if (spec.ownershipReferences && spec.ownershipReferences.length > 0) {
      const foreignKeys = await sql<CompositeForeignKeyRow[]>`
        SELECT constraint_row.conname AS constraint_name,
               array_agg(source_attribute.attname ORDER BY keys.ordinality)::text[] AS source_columns,
               foreign_table.relname AS foreign_table,
               array_agg(foreign_attribute.attname ORDER BY keys.ordinality)::text[] AS foreign_columns
        FROM pg_catalog.pg_constraint constraint_row
        JOIN pg_catalog.pg_class source_table ON source_table.oid = constraint_row.conrelid
        JOIN pg_catalog.pg_namespace source_namespace
          ON source_namespace.oid = source_table.relnamespace
        JOIN pg_catalog.pg_class foreign_table ON foreign_table.oid = constraint_row.confrelid
        JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey) WITH ORDINALITY
          AS keys(source_attnum, foreign_attnum, ordinality) ON true
        JOIN pg_catalog.pg_attribute source_attribute
          ON source_attribute.attrelid = source_table.oid
         AND source_attribute.attnum = keys.source_attnum
        JOIN pg_catalog.pg_attribute foreign_attribute
          ON foreign_attribute.attrelid = foreign_table.oid
         AND foreign_attribute.attnum = keys.foreign_attnum
        WHERE constraint_row.contype = 'f'
          AND source_namespace.nspname = 'public'
          AND source_table.relname = ${spec.tableName}
        GROUP BY constraint_row.conname, foreign_table.relname
      `;
      for (const reference of spec.ownershipReferences) {
        const expectedSource = [userColumn, ...reference.sourceColumns];
        const expectedTarget = [userColumn, ...reference.targetColumns];
        if (
          !foreignKeys.some(
            (key) =>
              key.foreign_table === reference.targetTable &&
              containsColumns(key.source_columns, expectedSource) &&
              containsColumns(key.foreign_columns, expectedTarget)
          )
        ) {
          issues.push(
            `${spec.tableName}.${reference.name} must use ownership FK (${expectedSource.join(
              ", "
            )}) -> ${reference.targetTable}(${expectedTarget.join(", ")})`
          );
        }
      }
    }

    const policies = await sql<PolicyRow[]>`
      SELECT policyname, cmd, qual, with_check
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = ${spec.tableName}
    `;
    for (const command of spec.requiredPolicyCommands ?? ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const commandPolicies = policies.filter(
        (policy) => policy.cmd === command || policy.cmd === "ALL"
      );
      if (commandPolicies.length === 0) {
        issues.push(`${spec.tableName} has no RLS policy covering ${command}`);
      }
      if (spec.policySetting) {
        for (const policy of commandPolicies) {
          const policySql = [policy.qual, policy.with_check]
            .filter((value): value is string => Boolean(value))
            .join(" ");
          if (!policySql.includes(userColumn) || !policySql.includes(spec.policySetting)) {
            issues.push(
              `${spec.tableName} policy ${policy.policyname} covering ${command} must bind ${userColumn} to ${spec.policySetting}`
            );
          }
        }
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
        const expected = [userColumn, ...businessKey];
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
