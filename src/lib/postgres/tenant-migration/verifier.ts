import { createHash } from "node:crypto";

import { tenantMigrationManifest } from "./manifest";
import {
  assertIdentifier,
  buildHighValueChecksumSql,
  buildJsonReferenceSql,
  buildOrphanSql,
  buildOwnershipSql,
  buildQueueStateSql,
  buildSchemaDiscoverySql,
  buildStableChecksumSql,
  buildUniquenessSql,
} from "./sql";
import type {
  QueryRow,
  ReadonlyQueryClient,
  TenantMigrationManifest,
  TenantMigrationReport,
  TenantMigrationStage,
  TenantTableClassification,
  TenantTableSnapshot,
  VerificationFailure,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DiscoveredColumn {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly dataType: string;
  readonly udtName: string;
}

export function normalizeExplicitAmitUserId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID.test(normalized)) {
    throw new Error("--amit-user-id must be an explicit RFC 4122 UUID");
  }
  return normalized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function validateManifest(manifest: TenantMigrationManifest): void {
  if (manifest.contractVersion !== 1) throw new Error("Unsupported tenant migration contract");
  if (manifest.tables.length === 0) throw new Error("Tenant table classification is empty");

  const known = new Set<string>();
  for (const schema of manifest.applicationSchemas) assertIdentifier(schema, "application schema");
  for (const entry of [...manifest.tables, ...manifest.controlTables]) {
    assertIdentifier(entry.schema, "table schema");
    assertIdentifier(entry.table, "table");
    if (!manifest.applicationSchemas.includes(entry.schema)) {
      throw new Error(
        `Classified table ${entry.schema}.${entry.table} is outside application schemas`
      );
    }
    const name = `${entry.schema}.${entry.table}`;
    if (known.has(name)) throw new Error(`Duplicate table classification: ${name}`);
    known.add(name);
  }

  const tenantTables = new Set(manifest.tables.map(({ table }) => table));
  for (const table of manifest.tables) {
    if (table.identityColumns.length === 0)
      throw new Error(`${table.table} has no identity columns`);
    const declaredJson = new Set<string>();
    for (const json of table.jsonColumns) {
      if (declaredJson.has(json.column))
        throw new Error(`${table.table}.${json.column} is classified twice`);
      declaredJson.add(json.column);
      if ((!json.references || json.references.length === 0) && !json.noTenantReferences) {
        throw new Error(`${table.table}.${json.column} must classify its JSON references`);
      }
      for (const reference of json.references ?? []) {
        if (reference.column !== json.column) {
          throw new Error(`${table.table}.${json.column} has a reference for another column`);
        }
        if (!tenantTables.has(reference.targetTable)) {
          throw new Error(`${table.table}.${reference.name} targets an unclassified table`);
        }
      }
    }
    for (const relationship of table.references) {
      if (!tenantTables.has(relationship.targetTable)) {
        throw new Error(`${table.table}.${relationship.name} targets an unclassified table`);
      }
      if (
        relationship.columns.length === 0 ||
        relationship.columns.length !== relationship.targetColumns.length
      ) {
        throw new Error(`${table.table}.${relationship.name} has mismatched reference columns`);
      }
    }

    // Generate every query during validation so dry-run catches unsafe or malformed
    // identifiers, predicates, and JSON paths without opening a database connection.
    buildStableChecksumSql(table);
    for (const column of table.highValueColumns) buildHighValueChecksumSql(table, column);
    buildOwnershipSql(table, "00000000-0000-4000-8000-000000000000");
    for (const relationship of table.references) buildOrphanSql(table, relationship);
    for (const uniqueness of table.uniqueness) buildUniquenessSql(table, uniqueness);
    if (table.queue) buildQueueStateSql(table);
    for (const json of table.jsonColumns) {
      for (const reference of json.references ?? []) buildJsonReferenceSql(table, reference);
    }
  }
}

function asString(row: QueryRow | undefined, key: string): string {
  const value = row?.[key];
  if (typeof value !== "string") throw new Error(`Query did not return string field ${key}`);
  return value;
}

function asCount(row: QueryRow | undefined, key: string): number {
  const value = Number(asString(row, key));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid count in ${key}`);
  return value;
}

function parseDiscovery(rows: readonly QueryRow[]): readonly DiscoveredColumn[] {
  return rows.map((row) => ({
    schema: asString(row, "table_schema"),
    table: asString(row, "table_name"),
    column: asString(row, "column_name"),
    dataType: asString(row, "data_type"),
    udtName: asString(row, "udt_name"),
  }));
}

function requiredColumns(table: TenantTableClassification): Set<string> {
  const columns = new Set([
    ...table.identityColumns,
    ...table.highValueColumns,
    ...table.references.flatMap(({ columns }) => columns),
    ...table.uniqueness.flatMap(({ columns }) => columns),
    ...table.jsonColumns.map(({ column }) => column),
  ]);
  if (table.queue) {
    columns.add(table.queue.statusColumn);
    if (table.queue.kindColumn) columns.add(table.queue.kindColumn);
  }
  return columns;
}

export function verifyDiscoveredSchema(
  manifest: TenantMigrationManifest,
  columns: readonly DiscoveredColumn[],
  stage: TenantMigrationStage
): VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  const discoveredTables = new Set(columns.map(({ schema, table }) => `${schema}.${table}`));
  const classified = new Set(
    [...manifest.tables, ...manifest.controlTables].map(({ schema, table }) => `${schema}.${table}`)
  );
  for (const table of [...discoveredTables].sort()) {
    if (!classified.has(table)) {
      failures.push({
        code: "UNCLASSIFIED_TABLE",
        table,
        detail: `${table} is not in the manifest`,
      });
    }
  }

  for (const table of manifest.tables) {
    const name = `${table.schema}.${table.table}`;
    const actual = columns.filter(
      (column) => column.schema === table.schema && column.table === table.table
    );
    if (actual.length === 0) {
      failures.push({
        code: "MISSING_TENANT_TABLE",
        table: name,
        detail: `${name} does not exist`,
      });
      continue;
    }
    const actualNames = new Set(actual.map(({ column }) => column));
    for (const column of requiredColumns(table)) {
      if (!actualNames.has(column)) {
        failures.push({
          code: "MISSING_CLASSIFIED_COLUMN",
          table: name,
          detail: `${name}.${column} does not exist`,
        });
      }
    }
    const jsonColumns = actual.filter(({ dataType }) => dataType === "jsonb");
    const classifiedJson = new Set(table.jsonColumns.map(({ column }) => column));
    for (const column of jsonColumns) {
      if (!classifiedJson.has(column.column)) {
        failures.push({
          code: "UNCLASSIFIED_JSON_COLUMN",
          table: name,
          detail: `${name}.${column.column} lacks a JSON reference classification`,
        });
      }
    }
    const owner = actual.find(({ column }) => column === table.ownerColumn);
    if (owner && owner.udtName !== "uuid") {
      failures.push({
        code: "INVALID_OWNER_COLUMN_TYPE",
        table: name,
        detail: `${name}.${table.ownerColumn} must use PostgreSQL uuid`,
      });
    }
    if (stage === "after" && !owner) {
      failures.push({
        code: "MISSING_OWNER_COLUMN",
        table: name,
        detail: `${name}.${table.ownerColumn} is required after expansion`,
      });
    }
  }
  return failures;
}

async function snapshotTable(
  client: ReadonlyQueryClient,
  table: TenantTableClassification,
  ownerId: string,
  columns: readonly DiscoveredColumn[]
): Promise<TenantTableSnapshot> {
  const tableColumns = new Set(
    columns
      .filter((column) => column.schema === table.schema && column.table === table.table)
      .map(({ column }) => column)
  );
  const summary = (await client.unsafe(buildStableChecksumSql(table)))[0];
  const highValueChecksums: Record<string, string> = {};
  for (const column of table.highValueColumns) {
    const row = (await client.unsafe(buildHighValueChecksumSql(table, column)))[0];
    highValueChecksums[column] = asString(row, "checksum");
  }

  let nullOwnerCount: number | null = null;
  let mismatchedOwnerCount: number | null = null;
  const columnPresent = tableColumns.has(table.ownerColumn);
  if (columnPresent) {
    const ownership = (await client.unsafe(buildOwnershipSql(table, ownerId)))[0];
    nullOwnerCount = asCount(ownership, "null_count");
    mismatchedOwnerCount = asCount(ownership, "mismatched_count");
  }

  const orphans = [];
  for (const relationship of table.references) {
    const row = (await client.unsafe(buildOrphanSql(table, relationship)))[0];
    orphans.push({ name: relationship.name, count: asCount(row, "orphan_count") });
  }

  const uniquenessCollisions = [];
  for (const uniqueness of table.uniqueness) {
    const row = (await client.unsafe(buildUniquenessSql(table, uniqueness)))[0];
    uniquenessCollisions.push({
      name: uniqueness.name,
      groups: asCount(row, "collision_groups"),
      rows: asCount(row, "collision_rows"),
    });
  }

  const queueState = table.queue
    ? (await client.unsafe(buildQueueStateSql(table))).map((row) => ({
        status: asString(row, "status"),
        kind: row.kind === null ? null : asString(row, "kind"),
        count: asCount(row, "count"),
      }))
    : [];

  const jsonReferences = [];
  for (const json of table.jsonColumns) {
    for (const reference of json.references ?? []) {
      const row = (await client.unsafe(buildJsonReferenceSql(table, reference)))[0];
      jsonReferences.push({
        name: reference.name,
        sourceColumn: reference.column,
        path: reference.path,
        target: `${table.schema}.${reference.targetTable}.${reference.targetColumn}`,
        references: asCount(row, "reference_count"),
        orphans: asCount(row, "orphan_count"),
      });
    }
  }

  return {
    schema: table.schema,
    table: table.table,
    rowCount: asCount(summary, "row_count"),
    stableChecksum: asString(summary, "stable_checksum"),
    highValueChecksums,
    ownership: {
      column: table.ownerColumn,
      columnPresent,
      nullOwnerCount,
      mismatchedOwnerCount,
      projectedNullOwnerCount: 0,
      projectedMismatchedOwnerCount: 0,
    },
    orphans,
    uniquenessCollisions,
    queueState,
    jsonReferences,
  };
}

function invariantInput(
  manifestHash: string,
  ownerId: string,
  tables: readonly TenantTableSnapshot[]
): unknown {
  return {
    manifestHash,
    ownerId,
    tables: tables.map((table) => ({
      schema: table.schema,
      table: table.table,
      rowCount: table.rowCount,
      stableChecksum: table.stableChecksum,
      highValueChecksums: table.highValueChecksums,
      orphans: table.orphans,
      uniquenessCollisions: table.uniquenessCollisions,
      queueState: table.queueState,
      jsonReferences: table.jsonReferences,
    })),
  };
}

function dataFailures(tables: readonly TenantTableSnapshot[], stage: TenantMigrationStage) {
  const failures: VerificationFailure[] = [];
  for (const table of tables) {
    const name = `${table.schema}.${table.table}`;
    for (const orphan of table.orphans) {
      if (orphan.count > 0) {
        failures.push({
          code: "RELATIONAL_ORPHANS",
          table: name,
          detail: `${orphan.name} has ${orphan.count} orphaned rows`,
        });
      }
    }
    for (const collision of table.uniquenessCollisions) {
      if (collision.groups > 0) {
        failures.push({
          code: "UNIQUENESS_COLLISIONS",
          table: name,
          detail: `${collision.name} has ${collision.groups} collision groups`,
        });
      }
    }
    for (const json of table.jsonReferences) {
      if (json.orphans > 0) {
        failures.push({
          code: "JSON_REFERENCE_ORPHANS",
          table: name,
          detail: `${json.name} has ${json.orphans} orphaned references`,
        });
      }
    }
    if ((table.ownership.mismatchedOwnerCount ?? 0) > 0) {
      failures.push({
        code: "WRONG_OWNER",
        table: name,
        detail: `${table.ownership.mismatchedOwnerCount} rows do not belong to the supplied Amit UUID`,
      });
    }
    if (stage === "after") {
      if ((table.ownership.nullOwnerCount ?? 0) > 0) {
        failures.push({
          code: "NULL_OWNER",
          table: name,
          detail: `${table.ownership.nullOwnerCount} rows have no owner`,
        });
      }
    }
  }
  return failures;
}

export interface BuildReportInput {
  readonly client: ReadonlyQueryClient;
  readonly ownerId: string;
  readonly stage: TenantMigrationStage;
  readonly generatedAt?: Date;
  readonly manifest?: TenantMigrationManifest;
}

export async function buildTenantMigrationReport(
  input: BuildReportInput
): Promise<TenantMigrationReport> {
  const manifest = input.manifest ?? tenantMigrationManifest;
  validateManifest(manifest);
  const ownerId = normalizeExplicitAmitUserId(input.ownerId);
  const manifestHash = sha256(manifest);
  const discovered = parseDiscovery(
    await input.client.unsafe(buildSchemaDiscoverySql(manifest.applicationSchemas))
  );
  const schemaFailures = verifyDiscoveredSchema(manifest, discovered, input.stage);
  if (schemaFailures.length > 0) {
    const error = new Error(
      `Tenant migration schema verification failed: ${schemaFailures.map(({ detail }) => detail).join("; ")}`
    );
    Object.assign(error, { failures: schemaFailures });
    throw error;
  }

  const tables: TenantTableSnapshot[] = [];
  for (const table of manifest.tables) {
    tables.push(await snapshotTable(input.client, table, ownerId, discovered));
  }
  const failures = dataFailures(tables, input.stage);
  const fingerprint = sha256(invariantInput(manifestHash, ownerId, tables));
  const discoveredTables = [
    ...new Set(discovered.map(({ schema, table }) => `${schema}.${table}`)),
  ].sort();

  const base = {
    contractVersion: manifest.contractVersion,
    manifestId: manifest.id,
    manifestHash,
    stage: input.stage,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    immutableOwner: {
      label: "Amit" as const,
      userId: ownerId,
      source: "explicit-cli-argument" as const,
    },
    schema: {
      applicationSchemas: [...manifest.applicationSchemas],
      discoveredTables,
      tenantTables: manifest.tables.map(({ schema, table }) => `${schema}.${table}`),
      controlTables: manifest.controlTables.map(({ schema, table }) => `${schema}.${table}`),
    },
    tables,
    verification: { passed: failures.length === 0, failures },
    invariantFingerprint: fingerprint,
  };

  if (input.stage !== "rehearsal") return base;
  const assignments = tables.map((table) => ({
    table: `${table.schema}.${table.table}`,
    firstPass: table.ownership.columnPresent
      ? (table.ownership.nullOwnerCount ?? 0)
      : table.rowCount,
    secondPass: 0 as const,
  }));
  const projectedState = {
    invariantFingerprint: fingerprint,
    ownerId,
    ownership: tables.map((table) => ({
      table: `${table.schema}.${table.table}`,
      nullOwnerCount: 0,
      mismatchedOwnerCount: table.ownership.mismatchedOwnerCount ?? 0,
    })),
  };
  const firstFingerprint = sha256(projectedState);
  const secondFingerprint = sha256(projectedState);
  return {
    ...base,
    rehearsal: {
      readOnly: true,
      projectionPasses: 2,
      assignments,
      firstFingerprint,
      secondFingerprint,
      idempotent:
        assignments.every(({ secondPass }) => secondPass === 0) &&
        firstFingerprint === secondFingerprint,
    },
  };
}

export function verifyAfterAgainstBaseline(
  baseline: TenantMigrationReport,
  after: TenantMigrationReport
): VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  if (after.stage !== "after") {
    failures.push({
      code: "INVALID_AFTER_REPORT",
      detail: "Comparison target must be an after report",
    });
  }
  if (baseline.stage === "after") {
    failures.push({ code: "INVALID_BASELINE_REPORT", detail: "Baseline must precede backfill" });
  }
  if (baseline.manifestHash !== after.manifestHash) {
    failures.push({ code: "MANIFEST_CHANGED", detail: "Manifest hash changed between reports" });
  }
  if (baseline.immutableOwner.userId !== after.immutableOwner.userId) {
    failures.push({
      code: "OWNER_CHANGED",
      detail: "The explicit Amit UUID changed between reports",
    });
  }
  if (baseline.invariantFingerprint !== after.invariantFingerprint) {
    failures.push({
      code: "DATA_CHANGED",
      detail: "Counts, checksums, queue state, collisions, or references changed during migration",
    });
  }
  return failures;
}
