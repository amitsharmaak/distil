import Database from "better-sqlite3";

export type ImportScalar = string | number | bigint | boolean | null | Buffer;
export type ImportRow = Record<string, ImportScalar | unknown[] | Record<string, unknown>>;

interface TableSpec {
  source: string;
  target: string;
  keys: string[];
  rename?: Record<string, string>;
  json?: string[];
  boolean?: string[];
}

/** Tables that are intentionally never copied from a local installation. */
export const EXCLUDED_SQLITE_TABLES = ["oauth_tokens", "job_queue", "publisher_queue"] as const;

/**
 * Foreign-key order matters: parents are copied before children. FTS shadow
 * tables and any unknown future table are excluded by using this allowlist.
 */
export const IMPORT_TABLES: readonly TableSpec[] = [
  {
    source: "items",
    target: "items",
    keys: ["id"],
    rename: {
      fullContent: "full_content",
      sourceType: "source_type",
      contentType: "content_type",
      isRead: "is_read",
      createdAt: "created_at",
      thumbnailUrl: "thumbnail_url",
    },
    json: ["topics", "extracted_links", "content_classification", "detected_media"],
    boolean: ["isRead", "is_read"],
  },
  { source: "research_reports", target: "research_reports", keys: ["id"] },
  {
    source: "research_suggestions",
    target: "research_suggestions",
    keys: ["id"],
    json: ["source_item_ids"],
  },
  { source: "ai_summaries", target: "ai_summaries", keys: ["id"] },
  { source: "feedback", target: "feedback", keys: ["id"] },
  { source: "user_settings", target: "user_settings", keys: ["key"] },
  {
    source: "notifications",
    target: "notifications",
    keys: ["id"],
    boolean: ["is_read"],
  },
  {
    source: "item_embeddings",
    target: "item_embeddings",
    keys: ["item_id"],
    json: ["embedding"],
  },
  { source: "audit_log", target: "audit_log", keys: ["id"] },
  {
    source: "workflow_runs",
    target: "workflow_runs",
    keys: ["id"],
    json: ["steps_json"],
  },
  { source: "agent_actions", target: "agent_actions", keys: ["id"] },
  {
    source: "approval_queue",
    target: "approval_queue",
    keys: ["id"],
    json: ["payload"],
  },
  { source: "chat_conversations", target: "chat_conversations", keys: ["id"] },
  {
    source: "chat_messages",
    target: "chat_messages",
    keys: ["id"],
    json: ["citations", "tool_calls"],
  },
  {
    source: "raw_content",
    target: "raw_content",
    keys: ["id"],
    json: ["metadata"],
  },
] as const;

export interface PlannedTable {
  table: string;
  keys: string[];
  rows: ImportRow[];
}

export interface SqliteImportPlan {
  sourcePath: string;
  sourceTables: string[];
  tables: PlannedTable[];
  excludedTables: string[];
  ignoredTables: string[];
}

function parseJson(table: string, column: string, value: unknown): unknown {
  if (value === null || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON in ${table}.${column}`);
  }
}

/** PostgreSQL text and jsonb reject U+0000; strip legacy NUL bytes recursively. */
function stripNullBytes(value: unknown): unknown {
  if (typeof value === "string") return value.replaceAll("\0", "");
  if (Array.isArray(value)) return value.map(stripNullBytes);
  if (value !== null && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        stripNullBytes(nested),
      ])
    );
  }
  return value;
}

function mapRow(spec: TableSpec, input: Record<string, unknown>): ImportRow {
  const output: ImportRow = {};
  for (const [sourceColumn, originalValue] of Object.entries(input)) {
    const targetColumn = spec.rename?.[sourceColumn] ?? sourceColumn;
    let value = originalValue;
    if (spec.json?.includes(sourceColumn) || spec.json?.includes(targetColumn)) {
      value = parseJson(spec.source, sourceColumn, value);
    }
    if (spec.boolean?.includes(sourceColumn) || spec.boolean?.includes(targetColumn)) {
      value = Boolean(value);
    }
    output[targetColumn] = stripNullBytes(value) as ImportRow[string];
  }
  return output;
}

/** Open the source read-only and fully validate it before any target write. */
export function createSqliteImportPlan(sourcePath: string): SqliteImportPlan {
  const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const sourceTables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map(({ name }) => name);
    const available = new Set(sourceTables);
    const tables = IMPORT_TABLES.filter((spec) => available.has(spec.source)).map((spec) => {
      const rows = (
        sqlite.prepare(`SELECT * FROM "${spec.source}"`).all() as Record<string, unknown>[]
      ).map((row) => mapRow(spec, row));
      return { table: spec.target, keys: spec.keys, rows };
    });
    const known = new Set([
      ...IMPORT_TABLES.map(({ source }) => source),
      ...EXCLUDED_SQLITE_TABLES,
    ]);
    return {
      sourcePath,
      sourceTables,
      tables,
      excludedTables: sourceTables.filter((name) =>
        (EXCLUDED_SQLITE_TABLES as readonly string[]).includes(name)
      ),
      ignoredTables: sourceTables.filter(
        (name) => name.startsWith("sqlite_") || name.startsWith("items_fts") || !known.has(name)
      ),
    };
  } finally {
    sqlite.close();
  }
}
