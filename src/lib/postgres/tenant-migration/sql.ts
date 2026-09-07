import type {
  JsonReferenceClassification,
  ReferenceClassification,
  TenantTableClassification,
  UniquenessClassification,
} from "./types";

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const SAFE_PREDICATE = /^[a-zA-Z0-9_ ()',.=<>-]+$/;
const SAFE_JSON_PATH = /^\$[a-zA-Z0-9_.*\[\]]*$/;

export function assertIdentifier(value: string, label = "identifier"): void {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid ${label}: ${value}`);
}

export function quoteIdentifier(value: string): string {
  assertIdentifier(value);
  return `"${value}"`;
}

function tableName(table: Pick<TenantTableClassification, "schema" | "table">): string {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.table)}`;
}

function qualifiedColumns(alias: string, columns: readonly string[]): string {
  assertIdentifier(alias, "alias");
  return columns.map((column) => `${quoteIdentifier(alias)}.${quoteIdentifier(column)}`).join(", ");
}

export function buildSchemaDiscoverySql(applicationSchemas: readonly string[]): string {
  if (applicationSchemas.length === 0)
    throw new Error("At least one application schema is required");
  for (const schema of applicationSchemas) assertIdentifier(schema, "schema");
  const schemas = applicationSchemas.map((schema) => `'${schema}'`).join(", ");
  return `
SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema IN (${schemas}) AND t.table_type = 'BASE TABLE'
ORDER BY c.table_schema, c.table_name, c.ordinal_position`;
}

export function buildStableChecksumSql(table: TenantTableClassification): string {
  const identity = `jsonb_build_array(${qualifiedColumns("source", table.identityColumns)})::text`;
  return `
SELECT count(*)::text AS row_count,
       md5(coalesce(string_agg(row_digest, '' ORDER BY identity_key), '')) AS stable_checksum
FROM (
  SELECT ${identity} AS identity_key,
         md5((to_jsonb(source) - '${table.ownerColumn}')::text) AS row_digest
  FROM ${tableName(table)} AS source
) checksums`;
}

export function buildHighValueChecksumSql(
  table: TenantTableClassification,
  column: string
): string {
  assertIdentifier(column, "high-value column");
  const identity = `jsonb_build_array(${qualifiedColumns("source", table.identityColumns)})::text`;
  return `
SELECT md5(coalesce(string_agg(value_digest, '' ORDER BY identity_key), '')) AS checksum
FROM (
  SELECT ${identity} AS identity_key,
         md5(jsonb_build_array(${qualifiedColumns("source", [column])})::text) AS value_digest
  FROM ${tableName(table)} AS source
) checksums`;
}

export function buildOwnershipSql(table: TenantTableClassification, ownerId: string): string {
  return `
SELECT count(*) FILTER (WHERE ${quoteIdentifier(table.ownerColumn)} IS NULL)::text AS null_count,
       count(*) FILTER (
         WHERE ${quoteIdentifier(table.ownerColumn)} IS NOT NULL
           AND ${quoteIdentifier(table.ownerColumn)} <> '${ownerId}'::uuid
       )::text AS mismatched_count
FROM ${tableName(table)}`;
}

export function buildOrphanSql(
  table: TenantTableClassification,
  relationship: ReferenceClassification
): string {
  if (
    relationship.columns.length === 0 ||
    relationship.columns.length !== relationship.targetColumns.length
  ) {
    throw new Error(`Reference ${table.table}.${relationship.name} has mismatched columns`);
  }
  const join = relationship.columns
    .map(
      (column, index) =>
        `${quoteIdentifier("target")}.${quoteIdentifier(relationship.targetColumns[index])} = ` +
        `${quoteIdentifier("source")}.${quoteIdentifier(column)}`
    )
    .join(" AND ");
  const hasReference = relationship.columns
    .map((column) => `${quoteIdentifier("source")}.${quoteIdentifier(column)} IS NOT NULL`)
    .join(" AND ");
  const missingTarget = relationship.targetColumns
    .map((column) => `${quoteIdentifier("target")}.${quoteIdentifier(column)} IS NULL`)
    .join(" AND ");
  return `
SELECT count(*)::text AS orphan_count
FROM ${tableName(table)} AS source
LEFT JOIN ${quoteIdentifier(table.schema)}.${quoteIdentifier(relationship.targetTable)} AS target
  ON ${join}
WHERE ${hasReference} AND ${missingTarget}`;
}

export function buildUniquenessSql(
  table: TenantTableClassification,
  classification: UniquenessClassification
): string {
  if (classification.columns.length === 0) {
    throw new Error(`Uniqueness check ${table.table}.${classification.name} has no columns`);
  }
  if (classification.predicate && !SAFE_PREDICATE.test(classification.predicate)) {
    throw new Error(`Unsafe uniqueness predicate: ${classification.predicate}`);
  }
  const columns = classification.columns.map(quoteIdentifier).join(", ");
  const nonNull = classification.columns
    .map((column) => `${quoteIdentifier(column)} IS NOT NULL`)
    .join(" AND ");
  const where = classification.predicate
    ? `WHERE (${nonNull}) AND (${classification.predicate})`
    : `WHERE ${nonNull}`;
  return `
SELECT count(*)::text AS collision_groups,
       coalesce(sum(group_size), 0)::text AS collision_rows
FROM (
  SELECT count(*)::bigint AS group_size
  FROM ${tableName(table)}
  ${where}
  GROUP BY ${columns}
  HAVING count(*) > 1
) collisions`;
}

export function buildQueueStateSql(table: TenantTableClassification): string {
  if (!table.queue) throw new Error(`${table.table} is not classified as a queue`);
  const status = quoteIdentifier(table.queue.statusColumn);
  const kind = table.queue.kindColumn ? quoteIdentifier(table.queue.kindColumn) : "NULL::text";
  const group = table.queue.kindColumn ? `, ${quoteIdentifier(table.queue.kindColumn)}` : "";
  return `
SELECT ${status}::text AS status, ${kind}::text AS kind, count(*)::text AS count
FROM ${tableName(table)}
GROUP BY ${status}${group}
ORDER BY ${status}, kind NULLS FIRST`;
}

export function buildJsonReferenceSql(
  table: TenantTableClassification,
  reference: JsonReferenceClassification
): string {
  if (!SAFE_JSON_PATH.test(reference.path)) throw new Error(`Unsafe JSON path: ${reference.path}`);
  return `
WITH refs AS (
  SELECT value #>> '{}' AS reference_id
  FROM ${tableName(table)} AS source
  CROSS JOIN LATERAL jsonb_path_query(
    ${quoteIdentifier("source")}.${quoteIdentifier(reference.column)},
    '${reference.path}'::jsonpath
  ) AS value
  WHERE jsonb_typeof(value) = 'string'
)
SELECT count(*)::text AS reference_count,
       count(*) FILTER (WHERE target.${quoteIdentifier(reference.targetColumn)} IS NULL)::text AS orphan_count
FROM refs
LEFT JOIN ${quoteIdentifier(table.schema)}.${quoteIdentifier(reference.targetTable)} AS target
  ON target.${quoteIdentifier(reference.targetColumn)} = refs.reference_id`;
}
