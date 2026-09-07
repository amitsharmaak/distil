import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { createPostgresImportTarget, importSqlite } from "../sqlite-importer";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
let directory: string;
let sourcePath: string;

beforeAll(async () => {
  await harness.start();
  await harness.migrate(resolve(process.cwd(), "src/lib/postgres/migrations"));
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "distil-pg-import-"));
  sourcePath = join(directory, "source.db");
  const sqlite = new Database(sourcePath);
  sqlite.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
      sourceType TEXT NOT NULL, contentType TEXT NOT NULL DEFAULT 'article',
      topics TEXT NOT NULL DEFAULT '[]', url TEXT NOT NULL, normalized_url TEXT,
      priority TEXT NOT NULL DEFAULT 'medium', isRead INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE ai_summaries (
      id TEXT PRIMARY KEY, item_id TEXT NOT NULL, summary TEXT NOT NULL,
      model TEXT NOT NULL, prompt_type TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE oauth_tokens (provider TEXT PRIMARY KEY, access_token TEXT NOT NULL);
  `);
  sqlite
    .prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "item-1",
      "Postgres import",
      "Verified",
      "manual",
      "article",
      '["database"]',
      "https://example.com/import",
      "https://example.com/import",
      "medium",
      0,
      "2026-03-01T00:00:00.000Z"
    );
  sqlite
    .prepare("INSERT INTO ai_summaries VALUES (?, ?, ?, ?, ?, ?)")
    .run("summary-1", "item-1", "Imported", "fake", "brief", "2026-03-01T00:00:00.000Z");
  sqlite.prepare("INSERT INTO oauth_tokens VALUES (?, ?)").run("gmail", "never-copy-me");
  sqlite.close();
});

afterEach(async () => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  await harness.reset();
});
afterAll(async () => harness.stop());

it("imports in one transaction, verifies IDs, and remains idempotent", async () => {
  const target = createPostgresImportTarget(harness.connectionUri);
  try {
    const first = await importSqlite({ sourcePath, execute: true, target });
    const second = await importSqlite({ sourcePath, execute: true, target });
    expect(first.verified).toBe(true);
    expect(second.tables.find(({ table }) => table === "items")).toMatchObject({
      sourceCount: 1,
      matchedCount: 1,
      targetCount: 1,
    });
    expect(await harness.sql`SELECT id FROM items`).toHaveLength(1);
    expect(await harness.sql`SELECT id FROM ai_summaries`).toHaveLength(1);
    expect(await harness.sql`SELECT provider FROM oauth_tokens`).toHaveLength(0);
  } finally {
    await target.close?.();
  }
});
