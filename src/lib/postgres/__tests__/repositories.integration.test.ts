import { resolve } from "node:path";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import type { ContentItem } from "@/lib/types";
import { createPostgresRepositories } from "../repositories";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const item = (id: string, url: string, title = "PostgreSQL search"): ContentItem => ({
  id,
  title,
  summary: "durable database",
  sourceType: "manual",
  contentType: "article",
  topics: ["storage"],
  url,
  priority: "medium",
  isRead: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  processingStatus: "ready",
});

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
});
afterEach(async () => harness.reset());
afterAll(async () => harness.stop());

describe("PostgreSQL repository contracts", () => {
  it("migrates all legacy and Phase 1 tables", async () => {
    const rows = await harness.sql<
      { tablename: string }[]
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining([
        "items",
        "oauth_tokens",
        "ai_summaries",
        "feedback",
        "research_reports",
        "research_suggestions",
        "user_settings",
        "notifications",
        "item_embeddings",
        "audit_log",
        "workflow_runs",
        "agent_actions",
        "approval_queue",
        "chat_conversations",
        "chat_messages",
        "job_queue",
        "publisher_queue",
        "raw_content",
        "capture_requests",
        "capture_tokens",
        "rate_limit_windows",
      ])
    );
  });

  it("atomically deduplicates normalized URLs and supports full text search", async () => {
    const repos = createPostgresRepositories(harness.sql);
    const original = await repos.items.insert(
      item("one", "https://example.com/story?utm_source=x")
    );
    const duplicate = await repos.items.insert(item("two", "https://example.com/story"));
    expect(duplicate.id).toBe(original.id);
    await repos.items.insert(item("three", "https://example.com/other", "Unrelated"));
    expect((await repos.items.list({ query: "PostgreSQL" })).map((x) => x.id)).toEqual(["one"]);
  });

  it("preserves JSON fields, ordering, summaries, and cascades", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.items.insert({
      ...item("old", "https://example.com/old"),
      createdAt: "2026-01-01T00:00:00Z",
      extractedLinks: [{ text: "x", url: "https://x.test" }],
    });
    await repos.items.insert({
      ...item("new", "https://example.com/new"),
      createdAt: "2026-01-02T00:00:00Z",
    });
    await repos.summaries.upsert({
      id: "sum",
      itemId: "new",
      summary: "brief",
      model: "fake",
      promptType: "brief",
    });
    expect((await repos.items.list()).map((x) => x.id)).toEqual(["new", "old"]);
    expect((await repos.items.findById("old"))?.extractedLinks).toHaveLength(1);
    expect((await repos.items.findById("new"))?.aiSummary).toBe("brief");
    await repos.items.delete("new");
    expect(await repos.summaries.find("new", "brief")).toBeUndefined();
  });

  it("enforces legal capture transitions with compare-and-set semantics", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.captures.create({
      id: "capture",
      url: "https://example.com",
      normalizedUrl: "https://example.com/",
      topics: [],
      priority: "medium",
      source: "ios-shortcut",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(
      await repos.captures.transition("capture", ["failed"], {
        status: "queued",
        updatedAt: "2026-01-01T00:01:00Z",
      })
    ).toBeUndefined();
    expect(
      (
        await repos.captures.transition("capture", ["queued"], {
          status: "processing",
          attempts: 1,
          updatedAt: "2026-01-01T00:01:00Z",
        })
      )?.status
    ).toBe("processing");
  });

  it("atomically consumes rate limit windows", async () => {
    const repo = createPostgresRepositories(harness.sql).rateLimits;
    const attempts = await Promise.all(
      Array.from({ length: 3 }, () =>
        repo.consume({ key: "token", limit: 2, windowSeconds: 60, now: "2026-01-01T00:00:10Z" })
      )
    );
    expect(attempts.filter((x) => x.allowed)).toHaveLength(2);
    expect(attempts.map((x) => x.remaining).sort()).toEqual([0, 0, 1]);
  });
});
