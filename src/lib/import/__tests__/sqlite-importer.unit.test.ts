import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatImportResult,
  importSqlite,
  type ImportTarget,
  type ImportTransaction,
} from "../sqlite-importer";
import type { ImportRow, PlannedTable } from "../sqlite-plan";

function createFixture(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "distil-import-"));
  const path = join(directory, "source.db");
  const sqlite = new Database(path);
  sqlite.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL,
      fullContent TEXT, sourceType TEXT NOT NULL, contentType TEXT NOT NULL,
      topics TEXT NOT NULL, url TEXT NOT NULL, normalized_url TEXT,
      priority TEXT NOT NULL, isRead INTEGER NOT NULL, createdAt TEXT NOT NULL,
      extracted_links TEXT
    );
    CREATE TABLE user_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE oauth_tokens (provider TEXT PRIMARY KEY, access_token TEXT NOT NULL);
    CREATE TABLE job_queue (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE publisher_queue (publisher_id TEXT, url TEXT);
    CREATE VIRTUAL TABLE items_fts USING fts5(title, summary);
    CREATE TABLE future_private_data (id TEXT PRIMARY KEY);
  `);
  sqlite
    .prepare(
      `INSERT INTO items
       (id,title,summary,fullContent,sourceType,contentType,topics,url,normalized_url,
        priority,isRead,createdAt,extracted_links)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      "item-1",
      "An article",
      "Summary",
      "Body",
      "manual",
      "article",
      '["AI"]',
      "https://example.com/article",
      "https://example.com/article",
      "medium",
      1,
      "2026-03-01T00:00:00.000Z",
      '[{"url":"https://example.com/more"}]'
    );
  sqlite
    .prepare("INSERT INTO user_settings VALUES (?, ?, ?)")
    .run("theme", "dark", "2026-03-01T00:00:00.000Z");
  sqlite.prepare("INSERT INTO oauth_tokens VALUES (?, ?)").run("gmail", "secret-token");
  sqlite.prepare("INSERT INTO job_queue VALUES (?, ?)").run("job-1", "{}");
  sqlite.prepare("INSERT INTO future_private_data VALUES (?)").run("private-1");
  sqlite.close();
  return { directory, path };
}

class MemoryTarget implements ImportTarget {
  transactions = 0;
  private rows = new Map<string, Map<string, ImportRow>>();

  async transaction<T>(operation: (transaction: ImportTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const pending = new Map([...this.rows].map(([table, rows]) => [table, new Map(rows)] as const));
    const adapter: ImportTransaction = {
      upsert: async ({ table, keys, rows }: PlannedTable) => {
        const stored = pending.get(table) ?? new Map<string, ImportRow>();
        for (const row of rows) {
          const key = JSON.stringify(keys.map((column) => row[column] ?? null));
          stored.set(key, { ...stored.get(key), ...row });
        }
        pending.set(table, stored);
      },
      readKeys: async (table, keys) =>
        [...(pending.get(table)?.values() ?? [])].map((row) =>
          Object.fromEntries(keys.map((key) => [key, row[key]]))
        ) as ImportRow[],
    };
    const result = await operation(adapter);
    this.rows = pending;
    return result;
  }

  row(table: string, key: string): ImportRow | undefined {
    return this.rows.get(table)?.get(JSON.stringify([key]));
  }
}

describe("SQLite importer", () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => rmSync(fixture.directory, { recursive: true, force: true }));

  it("is a read-only dry run by default and reports exclusions", async () => {
    const before = readFileSync(fixture.path);
    const result = await importSqlite({ sourcePath: fixture.path });

    expect(result.mode).toBe("dry-run");
    expect(result.tables.map(({ table }) => table)).toEqual(["items", "user_settings"]);
    expect(result.excludedTables).toEqual(
      expect.arrayContaining(["oauth_tokens", "job_queue", "publisher_queue"])
    );
    expect(result.ignoredTables).toEqual(
      expect.arrayContaining(["items_fts", "future_private_data"])
    );
    expect(readFileSync(fixture.path)).toEqual(before);
    expect(formatImportResult(result)).toContain(
      "DRY RUN — source validated; PostgreSQL was not modified."
    );
  });

  it("uses one transaction, maps values, verifies keys, and is idempotent", async () => {
    const target = new MemoryTarget();
    const first = await importSqlite({ sourcePath: fixture.path, execute: true, target });
    const second = await importSqlite({ sourcePath: fixture.path, execute: true, target });

    expect(target.transactions).toBe(2);
    expect(first.verified).toBe(true);
    expect(second.tables.find(({ table }) => table === "items")).toMatchObject({
      sourceCount: 1,
      matchedCount: 1,
      targetCount: 1,
      verified: true,
    });
    expect(target.row("items", "item-1")).toMatchObject({
      full_content: "Body",
      source_type: "manual",
      content_type: "article",
      is_read: true,
      topics: ["AI"],
      extracted_links: [{ url: "https://example.com/more" }],
    });
    expect(formatImportResult(second)).toContain(
      "IMPORT COMPLETE — every source key was verified in PostgreSQL."
    );
  });

  it("rejects malformed JSON before opening a target transaction", async () => {
    const sqlite = new Database(fixture.path);
    sqlite.prepare("UPDATE items SET topics = ? WHERE id = ?").run("not-json", "item-1");
    sqlite.close();
    const target = new MemoryTarget();

    await expect(importSqlite({ sourcePath: fixture.path, execute: true, target })).rejects.toThrow(
      "Invalid JSON in items.topics"
    );
    expect(target.transactions).toBe(0);
  });

  it("requires the unpooled migration URL for real execution", async () => {
    await expect(
      importSqlite({ sourcePath: fixture.path, execute: true, migrationUrl: "" })
    ).rejects.toThrow("DATABASE_MIGRATION_URL is required");
  });
});
