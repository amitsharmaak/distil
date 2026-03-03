/**
 * SQLite database module — the single point of truth for all DB access.
 *
 * This module is responsible for:
 * 1. Opening (or creating) the SQLite database file.
 * 2. Initialising the schema on every startup (idempotent CREATE IF NOT EXISTS).
 * 3. Seeding the mock data on the very first run (when the table is empty).
 * 4. Exporting typed CRUD helpers used by API routes and Server Components.
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
import { mockItems } from "./mock-data";
import type { ContentItem, Priority, SourceType, ContentType } from "./types";

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
    url          TEXT NOT NULL,
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
`);

// ── Seeding ────────────────────────────────────────────────────────────────────

/**
 * Seed the database with mock data on the very first run.
 * This check runs once at module load time. If the table already has rows
 * (subsequent startups), seeding is skipped entirely.
 */
const rowCount = (db.prepare("SELECT COUNT(*) as c FROM items").get() as { c: number }).c;

if (rowCount === 0) {
  // Use a transaction to insert all mock items atomically.
  //
  // INSERT OR IGNORE (not plain INSERT) is used so that if two build
  // workers or hot-reload cycles race to seed at the same time, the
  // second worker's inserts silently succeed without a UNIQUE constraint
  // error — the rows that already exist are simply skipped.
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO items
      (id, title, summary, fullContent, sourceType, contentType, topics,
       author, publication, url, priority, isRead, createdAt, duration, thumbnailUrl)
    VALUES
      (@id, @title, @summary, @fullContent, @sourceType, @contentType, @topics,
       @author, @publication, @url, @priority, @isRead, @createdAt, @duration, @thumbnailUrl)
  `);

  const seedAll = db.transaction((items: ContentItem[]) => {
    for (const item of items) {
      insertStmt.run(serialize(item));
    }
  });

  seedAll(mockItems);
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
  /** Sort order: "recent" (newest first) or "priority" (high → low → medium → read). */
  sort?: "recent" | "priority";
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
  // Build WHERE clauses dynamically based on which filters are provided.
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.sourceType) {
    conditions.push("sourceType = @sourceType");
    params.sourceType = filters.sourceType;
  }
  if (filters.contentType) {
    conditions.push("contentType = @contentType");
    params.contentType = filters.contentType;
  }
  if (filters.priority) {
    conditions.push("priority = @priority");
    params.priority = filters.priority;
  }
  if (filters.isRead !== undefined) {
    conditions.push("isRead = @isRead");
    params.isRead = filters.isRead ? 1 : 0;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort order: newest first by default, or by priority level.
  const orderClause =
    filters.sort === "priority"
      ? // Map priority text to a numeric rank for ordering: high=1, medium=2, low=3.
        "ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, createdAt DESC"
      : "ORDER BY createdAt DESC";

  const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

  const sql = `SELECT * FROM items ${whereClause} ${orderClause} ${limitClause}`.trim();
  const rows = db.prepare(sql).all(params) as DbRow[];
  return rows.map(deserialize);
}

/**
 * Returns a single item by its ID, or undefined if not found.
 */
export function getItemById(id: string): ContentItem | undefined {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as DbRow | undefined;
  return row ? deserialize(row) : undefined;
}

/**
 * Inserts a new item into the database and returns it.
 * The caller must supply a fully-formed ContentItem (including id and createdAt).
 */
export function insertItem(item: ContentItem): ContentItem {
  const stmt = db.prepare(`
    INSERT INTO items
      (id, title, summary, fullContent, sourceType, contentType, topics,
       author, publication, url, priority, isRead, createdAt, duration, thumbnailUrl)
    VALUES
      (@id, @title, @summary, @fullContent, @sourceType, @contentType, @topics,
       @author, @publication, @url, @priority, @isRead, @createdAt, @duration, @thumbnailUrl)
  `);
  stmt.run(serialize(item));
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
      title        = @title,
      summary      = @summary,
      fullContent  = @fullContent,
      sourceType   = @sourceType,
      contentType  = @contentType,
      topics       = @topics,
      author       = @author,
      publication  = @publication,
      url          = @url,
      priority     = @priority,
      isRead       = @isRead,
      createdAt    = @createdAt,
      duration     = @duration,
      thumbnailUrl = @thumbnailUrl
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

// Export the raw db instance for advanced use cases (e.g. transactions in tests).
export { db };
