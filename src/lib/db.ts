/**
 * SQLite database module — the single point of truth for all DB access.
 *
 * This module is responsible for:
 * 1. Opening (or creating) the SQLite database file.
 * 2. Initialising the schema on every startup (idempotent CREATE IF NOT EXISTS).
 * 3. Exporting typed CRUD helpers used by API routes and Server Components.
 *
 * ⚠️  SERVER-SIDE ONLY — never import this module from a "use client" component.
 *     Client components must access data through the API routes (/api/items).
 *
 * Hot-reload safety: Next.js in development re-evaluates modules on every
 * file change. To avoid opening multiple connections to the same SQLite file
 * (which causes SQLITE_BUSY errors), we store the connection on `globalThis`
 * and reuse it across hot reloads.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import { config } from "./config";
import type { ContentItem, Priority, SourceType, ContentType } from "./types";
import { normalizeUrl } from "./utils";

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Sanitizes a user-supplied search query for safe use with SQLite FTS5 MATCH.
 * - Strips FTS5 special characters that could cause parse errors.
 * - Removes bare FTS operator keywords (NOT, AND, OR) which are invalid alone.
 * - Appends a prefix wildcard (*) to each token for prefix matching.
 * Returns an empty string if no valid tokens remain (caller should skip FTS).
 */
function sanitizeFtsQuery(q: string): string {
  const FTS_OPERATORS = new Set(['NOT', 'AND', 'OR']);
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.replace(/["'*\[\](){}^~?:!@#$%&=+|<>\\]/g, ''))
    .filter(t => t.length > 0)
    .filter(t => !FTS_OPERATORS.has(t.toUpperCase()))
    .map(t => t + '*')
    .join(' ');
}

// ── Connection singleton ───────────────────────────────────────────────────────

/**
 * Extend globalThis so TypeScript knows about our custom db property.
 * This is the recommended pattern for singletons in Next.js (same as Prisma).
 */
const globalForDb = globalThis as typeof globalThis & {
  __piaDb?: Database.Database;
};

/**
 * Resolve the database file path.
 * - In tests, DB_PATH is set to ":memory:" for an isolated in-memory database.
 * - In development/production, defaults to ./data/pia.db (see config.ts).
 */
const DB_PATH = config.dbPath;

/**
 * Ensure the directory containing the database file exists.
 * Skipped for ":memory:" (in-memory SQLite, used in tests).
 */
if (DB_PATH !== ":memory:") {
  const dir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Open the database connection.
 * Reuse an existing connection if one was already created this process
 * (handles Next.js hot reloads in development).
 */
const db: Database.Database = globalForDb.__piaDb ?? new Database(DB_PATH);

// Persist to globalThis in non-production so hot reloads reuse the connection.
if (config.env !== "production") {
  globalForDb.__piaDb = db;
}

// ── Performance settings ───────────────────────────────────────────────────────

/**
 * Enable Write-Ahead Logging (WAL) mode.
 * WAL allows concurrent reads while a write is in progress, which matters
 * when the Next.js dev server handles multiple requests at once.
 */
db.pragma("journal_mode = WAL");

// ── Schema initialisation ──────────────────────────────────────────────────────

/**
 * Create the `items` table and its indexes if they don't already exist.
 * This block runs on every server startup but is safe to re-run (idempotent).
 *
 * Column notes:
 * - `topics`  — stored as a JSON array string (e.g. '["AI","Tech"]').
 *               Deserialized back to string[] by the helper functions below.
 * - `isRead`  — SQLite has no native boolean; 0 = false, 1 = true.
 * - `createdAt` — ISO 8601 string (e.g. "2026-02-27T12:00:00.000Z").
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    summary      TEXT NOT NULL DEFAULT '',
    fullContent  TEXT,
    sourceType   TEXT NOT NULL,
    contentType  TEXT NOT NULL DEFAULT 'article',
    topics       TEXT NOT NULL DEFAULT '[]',
    author       TEXT,
    publication  TEXT,
    url            TEXT NOT NULL,
    normalized_url TEXT,
    priority     TEXT NOT NULL DEFAULT 'medium',
    isRead       INTEGER NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    duration     TEXT,
    thumbnailUrl TEXT
  );

  -- Indexes for the most common query patterns.
  CREATE INDEX IF NOT EXISTS idx_items_created  ON items(createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_items_priority ON items(priority);
  CREATE INDEX IF NOT EXISTS idx_items_source   ON items(sourceType);
  CREATE INDEX IF NOT EXISTS idx_items_is_read  ON items(isRead);

  -- OAuth token storage for source connectors (Gmail, etc.).
  -- One row per provider; access_token is refreshed in-place via upsertOAuthToken.
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider      TEXT PRIMARY KEY,
    access_token  TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date   INTEGER,   -- Unix timestamp in ms (matches Google's format)
    email         TEXT,
    updated_at    TEXT NOT NULL
  );

  -- AI-generated summaries, kept separate from the OG-tag summary on items.
  -- One row per (item, prompt_type) so brief and detailed can coexist.
  CREATE TABLE IF NOT EXISTS ai_summaries (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL,
    summary     TEXT NOT NULL,
    model       TEXT NOT NULL,
    prompt_type TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    UNIQUE(item_id, prompt_type)
  );
  CREATE INDEX IF NOT EXISTS idx_ai_summaries_item ON ai_summaries(item_id);

  -- User feedback on content items (like/dislike with optional reason).
  CREATE TABLE IF NOT EXISTS feedback (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL,
    rating     INTEGER NOT NULL,
    reason     TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_item    ON feedback(item_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

  -- Deep research report outputs.
  CREATE TABLE IF NOT EXISTS research_reports (
    id           TEXT PRIMARY KEY,
    item_id      TEXT,
    query        TEXT NOT NULL,
    report       TEXT NOT NULL DEFAULT '',
    sources      TEXT NOT NULL DEFAULT '[]',
    model        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_research_item ON research_reports(item_id);

  -- Key-value store for user settings (agent config, learned preferences).
  CREATE TABLE IF NOT EXISTS user_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- In-app notifications (e.g. high-priority item alerts).
  CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL,
    title      TEXT NOT NULL,
    message    TEXT NOT NULL DEFAULT '',
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

  -- Item embeddings for semantic deduplication and search.
  CREATE TABLE IF NOT EXISTS item_embeddings (
    item_id    TEXT PRIMARY KEY,
    embedding  TEXT NOT NULL,
    model      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );
`);

// Add ai_priority_score column to items (idempotent — ignore if already exists).
try {
  db.exec("ALTER TABLE items ADD COLUMN ai_priority_score REAL");
} catch {
  // Column already exists — safe to ignore.
}

// Add extracted_links column to items (idempotent — ignore if already exists).
try {
  db.exec("ALTER TABLE items ADD COLUMN extracted_links TEXT");
} catch {
  // Column already exists — safe to ignore.
}

// Add normalized_url column to items (idempotent — ignore if already exists).
try {
  db.exec("ALTER TABLE items ADD COLUMN normalized_url TEXT");
} catch {
  // Column already exists — safe to ignore.
}

// Add progress column to research_reports (idempotent — ignore if already exists).
try {
  db.exec("ALTER TABLE research_reports ADD COLUMN progress TEXT");
} catch {
  // Column already exists — safe to ignore.
}

// Migrate ai_summaries: change UNIQUE(item_id) → UNIQUE(item_id, prompt_type)
// so both brief and detailed summaries can coexist for the same item.
{
  const info = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_summaries'")
    .get() as { sql: string } | undefined;
  if (info?.sql && /item_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(info.sql)) {
    db.exec(`
      CREATE TABLE ai_summaries_new (
        id          TEXT PRIMARY KEY,
        item_id     TEXT NOT NULL,
        summary     TEXT NOT NULL,
        model       TEXT NOT NULL,
        prompt_type TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        UNIQUE(item_id, prompt_type)
      );
      INSERT INTO ai_summaries_new SELECT * FROM ai_summaries;
      DROP TABLE ai_summaries;
      ALTER TABLE ai_summaries_new RENAME TO ai_summaries;
      CREATE INDEX IF NOT EXISTS idx_ai_summaries_item ON ai_summaries(item_id);
    `);
  }
}

// Backfill normalized_url for existing rows, deduplicate, then create index.
{
  const rows = db
    .prepare("SELECT id, url FROM items WHERE normalized_url IS NULL")
    .all() as { id: string; url: string }[];
  if (rows.length > 0) {
    const update = db.prepare(
      "UPDATE items SET normalized_url = @normalizedUrl WHERE id = @id",
    );
    const backfill = db.transaction(() => {
      for (const row of rows) {
        update.run({ id: row.id, normalizedUrl: normalizeUrl(row.url) });
      }
    });
    backfill();

    // Remove duplicates: keep the earliest item per normalized_url.
    db.exec(`
      DELETE FROM items WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY normalized_url ORDER BY createdAt ASC
          ) AS rn FROM items
        ) WHERE rn = 1
      )
    `);
  }
}

// Create unique index on normalized_url (after backfill and dedup).
try {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_items_normalized_url ON items(normalized_url)",
  );
} catch {
  // Index already exists — safe to ignore.
}

// ── FTS5 virtual table + triggers ──────────────────────────────────────────────

// Create the FTS5 virtual table and its sync triggers (idempotent).
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      item_id UNINDEXED,
      title,
      summary,
      topics
    );
    CREATE TRIGGER IF NOT EXISTS items_fts_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(item_id, title, summary, topics)
      VALUES (new.id, new.title, new.summary, new.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS items_fts_ad AFTER DELETE ON items BEGIN
      DELETE FROM items_fts WHERE item_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS items_fts_au AFTER UPDATE ON items BEGIN
      DELETE FROM items_fts WHERE item_id = old.id;
      INSERT INTO items_fts(item_id, title, summary, topics)
      VALUES (new.id, new.title, new.summary, new.topics);
    END;
  `);
} catch {
  // Already exists — safe to ignore.
}

// Backfill FTS index for any existing items not yet indexed.
try {
  db.exec(`
    INSERT INTO items_fts(item_id, title, summary, topics)
    SELECT id, title, summary, topics FROM items
    WHERE id NOT IN (SELECT item_id FROM items_fts);
  `);
} catch {
  // Backfill failed (e.g. FTS table not available) — safe to ignore.
}

// ── Serialization helpers ──────────────────────────────────────────────────────

/**
 * Shape of a raw row as returned by better-sqlite3.
 * Uses the exact column names from the schema above.
 */
interface DbRow {
  id: string;
  title: string;
  summary: string;
  fullContent: string | null;
  sourceType: string;
  contentType: string;
  topics: string; // JSON string
  author: string | null;
  publication: string | null;
  url: string;
  priority: string;
  isRead: number; // 0 or 1
  createdAt: string;
  duration: string | null;
  thumbnailUrl: string | null;
  ai_priority_score: number | null;
  extracted_links: string | null; // JSON string
  ai_summary_text: string | null; // from LEFT JOIN ai_summaries
}

/**
 * Converts a raw database row into a typed ContentItem.
 * - Parses the `topics` JSON string back to string[].
 * - Converts `isRead` integer (0/1) to boolean.
 * - Casts string enums to their TypeScript types.
 */
function deserialize(row: DbRow): ContentItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    fullContent: row.fullContent ?? undefined,
    sourceType: row.sourceType as SourceType,
    contentType: row.contentType as ContentType,
    topics: JSON.parse(row.topics) as string[],
    author: row.author ?? undefined,
    publication: row.publication ?? undefined,
    url: row.url,
    priority: row.priority as Priority,
    isRead: row.isRead === 1,
    createdAt: row.createdAt,
    duration: row.duration ?? undefined,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    extractedLinks: row.extracted_links ? JSON.parse(row.extracted_links) : undefined,
    aiSummary: row.ai_summary_text ?? undefined,
  };
}

/**
 * Converts a ContentItem into a plain object suitable for better-sqlite3
 * named parameter binding (@fieldName syntax).
 * - Serializes `topics` array to a JSON string.
 * - Converts boolean `isRead` to 0/1.
 * - Converts undefined optional fields to null (SQLite NULL).
 */
function serialize(item: ContentItem): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    fullContent: item.fullContent ?? null,
    sourceType: item.sourceType,
    contentType: item.contentType,
    topics: JSON.stringify(item.topics),
    author: item.author ?? null,
    publication: item.publication ?? null,
    url: item.url,
    priority: item.priority,
    isRead: item.isRead ? 1 : 0,
    createdAt: item.createdAt,
    duration: item.duration ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    extracted_links: item.extractedLinks ? JSON.stringify(item.extractedLinks) : null,
  };
}

// ── Query filters type ─────────────────────────────────────────────────────────

/** Optional filters accepted by getItems(). */
export interface ItemFilters {
  /** Filter by source type (e.g. "gmail", "browser-extension"). */
  sourceType?: string;
  /** Filter by content type (e.g. "article", "video"). */
  contentType?: string;
  /** Filter by priority level ("high", "medium", "low"). */
  priority?: string;
  /** When true, only return unread items. */
  isRead?: boolean;
  /** Return at most this many items. */
  limit?: number;
  /** Sort order: "recent" (newest first), "priority" (high → low → medium → read), or "ai_priority" (by AI score). */
  sort?: "recent" | "priority" | "ai_priority";
  /** Full-text search query. Searches title, summary, and topics via FTS5. */
  query?: string;
}

// ── Exported CRUD helpers ──────────────────────────────────────────────────────

/**
 * Returns all items matching the given filters, sorted by createdAt DESC
 * (most recent first) by default. Pagination is supported via `limit`.
 *
 * All filtering is done in SQL for efficiency; there is no client-side
 * post-filtering in this function.
 */
export function getItems(filters: ItemFilters = {}): ContentItem[] {
  // Determine whether to use the FTS code path.
  const ftsQuery = filters.query ? sanitizeFtsQuery(filters.query) : "";
  const useFts = ftsQuery.length > 0;

  if (useFts) {
    // ── FTS code path — ALL params are positional (?) ──────────────────────
    // better-sqlite3 does not allow mixing named (@name) and positional (?)
    // params in the same statement, so we use only positional params here.
    const positionalParams: unknown[] = [];
    const conditions: string[] = [];

    if (filters.sourceType) {
      conditions.push("items.sourceType = ?");
      positionalParams.push(filters.sourceType);
    }
    if (filters.contentType) {
      conditions.push("items.contentType = ?");
      positionalParams.push(filters.contentType);
    }
    if (filters.priority) {
      conditions.push("items.priority = ?");
      positionalParams.push(filters.priority);
    }
    if (filters.isRead !== undefined) {
      conditions.push("items.isRead = ?");
      positionalParams.push(filters.isRead ? 1 : 0);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")} AND items_fts MATCH ?`
        : "WHERE items_fts MATCH ?";

    // MATCH param is always last before LIMIT.
    positionalParams.push(ftsQuery);

    const limitClause = filters.limit ? "LIMIT ?" : "";
    if (filters.limit) positionalParams.push(filters.limit);

    const sql = `
      SELECT items.*, ai_summaries.summary AS ai_summary_text
      FROM items
      INNER JOIN items_fts ON items.id = items_fts.item_id
      LEFT JOIN ai_summaries ON items.id = ai_summaries.item_id AND ai_summaries.prompt_type = 'brief'
      ${whereClause}
      ORDER BY rank, items.createdAt DESC
      ${limitClause}
    `.trim();

    const rows = db.prepare(sql).all(...positionalParams) as DbRow[];
    return rows.map(deserialize);
  }

  // ── Non-FTS code path — named params (@name) ────────────────────────────
  // Build WHERE clauses dynamically based on which filters are provided.
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.sourceType) {
    conditions.push("items.sourceType = @sourceType");
    params.sourceType = filters.sourceType;
  }
  if (filters.contentType) {
    conditions.push("items.contentType = @contentType");
    params.contentType = filters.contentType;
  }
  if (filters.priority) {
    conditions.push("items.priority = @priority");
    params.priority = filters.priority;
  }
  if (filters.isRead !== undefined) {
    conditions.push("items.isRead = @isRead");
    params.isRead = filters.isRead ? 1 : 0;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort order: newest first by default, by priority level, or by AI priority score.
  let orderClause: string;
  if (filters.sort === "priority") {
    orderClause =
      "ORDER BY CASE items.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, items.createdAt DESC";
  } else if (filters.sort === "ai_priority") {
    orderClause = "ORDER BY COALESCE(items.ai_priority_score, 0) DESC, items.createdAt DESC";
  } else {
    orderClause = "ORDER BY items.createdAt DESC";
  }

  const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

  const sql =
    `SELECT items.*, ai_summaries.summary AS ai_summary_text FROM items LEFT JOIN ai_summaries ON items.id = ai_summaries.item_id AND ai_summaries.prompt_type = 'brief' ${whereClause} ${orderClause} ${limitClause}`.trim();
  const rows = db.prepare(sql).all(params) as DbRow[];
  return rows.map(deserialize);
}

/**
 * Returns a single item by its ID, or undefined if not found.
 */
export function getItemById(id: string): ContentItem | undefined {
  const row = db
    .prepare(
      "SELECT items.*, ai_summaries.summary AS ai_summary_text FROM items LEFT JOIN ai_summaries ON items.id = ai_summaries.item_id AND ai_summaries.prompt_type = 'brief' WHERE items.id = ?",
    )
    .get(id) as DbRow | undefined;
  return row ? deserialize(row) : undefined;
}

/**
 * Returns the existing item if a row with the same normalized URL already
 * exists, or undefined if the URL is new.
 */
export function getItemByNormalizedUrl(url: string): ContentItem | undefined {
  const norm = normalizeUrl(url);
  const row = db
    .prepare(
      `SELECT items.*, ai_summaries.summary AS ai_summary_text
       FROM items
       LEFT JOIN ai_summaries ON ai_summaries.item_id = items.id AND ai_summaries.prompt_type = 'brief'
       WHERE items.normalized_url = ?`,
    )
    .get(norm) as DbRow | undefined;
  return row ? deserialize(row) : undefined;
}

/**
 * Inserts a new item into the database and returns it.
 * The caller must supply a fully-formed ContentItem (including id and createdAt).
 *
 * A normalized_url is automatically computed and stored for deduplication.
 * If a row with the same normalized URL already exists, the insert is
 * skipped and the existing item is returned.
 */
export function insertItem(item: ContentItem): ContentItem {
  const norm = normalizeUrl(item.url);

  const existing = getItemByNormalizedUrl(item.url);
  if (existing) return existing;

  const serialized = serialize(item);
  const stmt = db.prepare(`
    INSERT INTO items
      (id, title, summary, fullContent, sourceType, contentType, topics,
       author, publication, url, normalized_url, priority, isRead, createdAt, duration, thumbnailUrl,
       extracted_links)
    VALUES
      (@id, @title, @summary, @fullContent, @sourceType, @contentType, @topics,
       @author, @publication, @url, @normalized_url, @priority, @isRead, @createdAt, @duration, @thumbnailUrl,
       @extracted_links)
  `);
  stmt.run({ ...serialized, normalized_url: norm });
  // Re-fetch from DB to return the canonical stored version.
  return getItemById(item.id)!;
}

/**
 * Partially updates an existing item. Only the fields present in `patch`
 * are changed; all other fields retain their current values.
 *
 * Returns the updated item, or undefined if no item with that ID exists.
 */
export function updateItem(id: string, patch: Partial<ContentItem>): ContentItem | undefined {
  // Fetch the existing item first so we can merge the patch.
  const existing = getItemById(id);
  if (!existing) return undefined;

  // Merge the patch onto the existing item.
  const merged: ContentItem = { ...existing, ...patch };

  const stmt = db.prepare(`
    UPDATE items SET
      title           = @title,
      summary         = @summary,
      fullContent     = @fullContent,
      sourceType      = @sourceType,
      contentType     = @contentType,
      topics          = @topics,
      author          = @author,
      publication     = @publication,
      url             = @url,
      priority        = @priority,
      isRead          = @isRead,
      createdAt       = @createdAt,
      duration        = @duration,
      thumbnailUrl    = @thumbnailUrl,
      extracted_links = @extracted_links
    WHERE id = @id
  `);
  stmt.run(serialize(merged));

  return getItemById(id);
}

/**
 * Deletes an item by ID.
 * Returns true if the item was found and deleted, false if it didn't exist.
 */
export function deleteItem(id: string): boolean {
  const result = db.prepare("DELETE FROM items WHERE id = ?").run(id);
  // `changes` is the number of rows affected; 0 means nothing was deleted.
  return result.changes > 0;
}

// ── OAuth token helpers ────────────────────────────────────────────────────────

/** Shape of a row in the oauth_tokens table. */
export interface OAuthTokenRow {
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  email: string | null;
  updated_at: string;
}

/**
 * Returns the stored OAuth token row for a provider, or undefined if none.
 */
export function getOAuthToken(provider: string): OAuthTokenRow | undefined {
  return db
    .prepare("SELECT * FROM oauth_tokens WHERE provider = ?")
    .get(provider) as OAuthTokenRow | undefined;
}

/**
 * Inserts or replaces the OAuth token for a provider.
 * Uses INSERT OR REPLACE so reconnecting always overwrites stale tokens.
 */
export function upsertOAuthToken(
  provider: string,
  data: {
    access_token: string;
    refresh_token?: string | null;
    expiry_date?: number | null;
    email?: string | null;
  },
): void {
  db.prepare(`
    INSERT OR REPLACE INTO oauth_tokens
      (provider, access_token, refresh_token, expiry_date, email, updated_at)
    VALUES
      (@provider, @access_token, @refresh_token, @expiry_date, @email, @updated_at)
  `).run({
    provider,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expiry_date: data.expiry_date ?? null,
    email: data.email ?? null,
    updated_at: new Date().toISOString(),
  });
}

// ── AI Summary helpers ───────────────────────────────────────────────────────

export interface AISummaryRow {
  id: string;
  item_id: string;
  summary: string;
  model: string;
  prompt_type: string;
  created_at: string;
}

export function getAISummary(
  itemId: string,
  promptType?: "brief" | "detailed",
): AISummaryRow | undefined {
  if (promptType) {
    return db
      .prepare("SELECT * FROM ai_summaries WHERE item_id = ? AND prompt_type = ?")
      .get(itemId, promptType) as AISummaryRow | undefined;
  }
  return db
    .prepare("SELECT * FROM ai_summaries WHERE item_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(itemId) as AISummaryRow | undefined;
}

export function getAISummaries(
  itemId: string,
): { brief?: string; detailed?: string } {
  const rows = db
    .prepare("SELECT summary, prompt_type FROM ai_summaries WHERE item_id = ?")
    .all(itemId) as { summary: string; prompt_type: string }[];
  const result: { brief?: string; detailed?: string } = {};
  for (const row of rows) {
    if (row.prompt_type === "brief") result.brief = row.summary;
    else if (row.prompt_type === "detailed") result.detailed = row.summary;
  }
  return result;
}

export function upsertAISummary(data: {
  id: string;
  itemId: string;
  summary: string;
  model: string;
  promptType: string;
}): AISummaryRow {
  db.prepare(`
    INSERT OR REPLACE INTO ai_summaries (id, item_id, summary, model, prompt_type, created_at)
    VALUES (@id, @item_id, @summary, @model, @prompt_type, @created_at)
  `).run({
    id: data.id,
    item_id: data.itemId,
    summary: data.summary,
    model: data.model,
    prompt_type: data.promptType,
    created_at: new Date().toISOString(),
  });
  return getAISummary(data.itemId, data.promptType as "brief" | "detailed")!;
}

// ── Feedback helpers ─────────────────────────────────────────────────────────

export interface FeedbackRow {
  id: string;
  item_id: string;
  rating: number;
  reason: string | null;
  created_at: string;
}

export function insertFeedback(data: {
  id: string;
  itemId: string;
  rating: number;
  reason?: string;
}): FeedbackRow {
  db.prepare(`
    INSERT INTO feedback (id, item_id, rating, reason, created_at)
    VALUES (@id, @item_id, @rating, @reason, @created_at)
  `).run({
    id: data.id,
    item_id: data.itemId,
    rating: data.rating,
    reason: data.reason ?? null,
    created_at: new Date().toISOString(),
  });
  return db.prepare("SELECT * FROM feedback WHERE id = ?").get(data.id) as FeedbackRow;
}

export function getFeedback(itemId: string): FeedbackRow | undefined {
  return db
    .prepare("SELECT * FROM feedback WHERE item_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(itemId) as FeedbackRow | undefined;
}

export function getAllFeedback(): FeedbackRow[] {
  return db
    .prepare("SELECT * FROM feedback ORDER BY created_at DESC")
    .all() as FeedbackRow[];
}

// ── Research report helpers ──────────────────────────────────────────────────

export interface ResearchReportRow {
  id: string;
  item_id: string | null;
  query: string;
  report: string;
  sources: string; // JSON array
  model: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  progress: string | null;
}

export function insertResearchReport(data: {
  id: string;
  itemId?: string;
  query: string;
  model: string;
}): ResearchReportRow {
  db.prepare(`
    INSERT INTO research_reports (id, item_id, query, model, created_at)
    VALUES (@id, @item_id, @query, @model, @created_at)
  `).run({
    id: data.id,
    item_id: data.itemId ?? null,
    query: data.query,
    model: data.model,
    created_at: new Date().toISOString(),
  });
  return getResearchReport(data.id)!;
}

export function getResearchReport(id: string): ResearchReportRow | undefined {
  return db
    .prepare("SELECT * FROM research_reports WHERE id = ?")
    .get(id) as ResearchReportRow | undefined;
}

export function updateResearchReport(
  id: string,
  patch: {
    report?: string;
    sources?: string;
    status?: string;
    completedAt?: string;
    progress?: string | null;
  },
): ResearchReportRow | undefined {
  const existing = getResearchReport(id);
  if (!existing) return undefined;

  db.prepare(`
    UPDATE research_reports SET
      report       = @report,
      sources      = @sources,
      status       = @status,
      completed_at = @completed_at,
      progress     = @progress
    WHERE id = @id
  `).run({
    id,
    report: patch.report ?? existing.report,
    sources: patch.sources ?? existing.sources,
    status: patch.status ?? existing.status,
    completed_at: patch.completedAt ?? existing.completed_at,
    progress: patch.progress !== undefined ? patch.progress : existing.progress ?? null,
  });

  return getResearchReport(id);
}

export function getResearchReports(limit = 20): ResearchReportRow[] {
  return db
    .prepare("SELECT * FROM research_reports ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ResearchReportRow[];
}

// ── User settings helpers ────────────────────────────────────────────────────

export function getUserSetting(key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM user_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setUserSetting(key: string, value: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO user_settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
  `).run({ key, value, updated_at: new Date().toISOString() });
}

// ── AI priority score helper ─────────────────────────────────────────────────

export function updateItemPriorityScore(id: string, score: number, priority: Priority): void {
  db.prepare(
    "UPDATE items SET ai_priority_score = @score, priority = @priority WHERE id = @id",
  ).run({ id, score, priority });
}

// ── Notification helpers ──────────────────────────────────────────────────────

import type { Notification } from "./types";

export function insertNotification(data: {
  id: string;
  itemId: string;
  title: string;
  message: string;
}): void {
  db.prepare(`
    INSERT INTO notifications (id, item_id, title, message, created_at)
    VALUES (@id, @item_id, @title, @message, @created_at)
  `).run({
    id: data.id,
    item_id: data.itemId,
    title: data.title,
    message: data.message,
    created_at: new Date().toISOString(),
  });
}

export function getNotifications(limit = 20): Notification[] {
  const rows = db
    .prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Array<{
    id: string;
    item_id: string;
    title: string;
    message: string;
    is_read: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    title: r.title,
    message: r.message,
    isRead: r.is_read === 1,
    createdAt: r.created_at,
  }));
}

export function getUnreadNotificationCount(): number {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM notifications WHERE is_read = 0")
    .get() as { c: number };
  return row.c;
}

export function markNotificationRead(id: string): void {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
}

export function markAllNotificationsRead(): void {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
}

// ── Item embedding helpers ────────────────────────────────────────────────────

export function getItemEmbedding(
  itemId: string,
): { item_id: string; embedding: string; model: string; created_at: string } | undefined {
  return db.prepare("SELECT * FROM item_embeddings WHERE item_id = ?").get(itemId) as
    | { item_id: string; embedding: string; model: string; created_at: string }
    | undefined;
}

export function upsertItemEmbedding(
  itemId: string,
  embedding: number[],
  model: string,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO item_embeddings (item_id, embedding, model, created_at)
    VALUES (@item_id, @embedding, @model, @created_at)
  `).run({
    item_id: itemId,
    embedding: JSON.stringify(embedding),
    model,
    created_at: new Date().toISOString(),
  });
}

export function getRecentEmbeddings(
  daysBack = 30,
): Array<{ item_id: string; embedding: string }> {
  const cutoff = new Date(
    Date.now() - daysBack * 24 * 60 * 60 * 1000,
  ).toISOString();
  return db.prepare(
    "SELECT item_id, embedding FROM item_embeddings WHERE created_at > ? ORDER BY created_at DESC",
  ).all(cutoff) as Array<{ item_id: string; embedding: string }>;
}

// Export the raw db instance for advanced use cases (e.g. transactions in tests).
export { db };
