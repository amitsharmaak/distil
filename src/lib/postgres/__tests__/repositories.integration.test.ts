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
        "item_notes",
        "annotations",
        "collections",
        "collection_items",
        "item_events",
        "digest_runs",
        "digest_items",
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

  it("can safely replay raw ingestion without losing its item attachment", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.items.insert(item("raw-item", "https://example.com/raw"));
    const raw = {
      id: "raw-replay",
      itemId: "raw-item",
      sourceType: "manual",
      rawBody: "first body",
      metadata: { attempt: 1 },
      fetchedAt: "2026-01-01T00:00:00Z",
    };
    await repos.rawContent.insert(raw);
    await repos.rawContent.insert({
      ...raw,
      itemId: undefined,
      rawBody: "replayed body",
      metadata: { attempt: 2 },
    });

    const [stored] = await harness.sql<
      { item_id: string; raw_body: string; metadata: { attempt: number } }[]
    >`SELECT item_id,raw_body,metadata FROM raw_content WHERE id='raw-replay'`;
    expect(stored).toEqual({
      item_id: "raw-item",
      raw_body: "replayed body",
      metadata: { attempt: 2 },
    });
  });

  it("persists lifecycle, one note, anchored annotations, collections, and immutable events", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.items.insert(item("knowledge", "https://example.com/knowledge"));
    await repos.items.update("knowledge", {
      archivedAt: "2026-01-03T00:00:00Z",
      readAt: "2026-01-02T00:00:00Z",
      lastOpenedAt: "2026-01-04T00:00:00Z",
      readingProgress: 0.5,
      manualPriority: "high",
    });
    expect(await repos.items.findById("knowledge")).toMatchObject({
      archivedAt: "2026-01-03T00:00:00.000Z",
      readingProgress: 0.5,
      manualPriority: "high",
    });

    const note = {
      itemId: "knowledge",
      body: "first",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    await repos.itemNotes.upsert(note);
    await repos.itemNotes.upsert({
      ...note,
      body: "updated",
      createdAt: "2026-01-09T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(await repos.itemNotes.find("knowledge")).toEqual({
      ...note,
      body: "updated",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const annotation = await repos.annotations.create({
      id: "annotation",
      itemId: "knowledge",
      selectedQuote: "grounded quote",
      prefix: "before",
      suffix: "after",
      startOffset: 10,
      endOffset: 24,
      contentHash: "sha256:content",
      contentVersion: "sha256:v1",
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    expect(annotation.startOffset).toBe(10);
    expect(
      await repos.annotations.update("annotation", {
        status: "orphaned",
        startOffset: undefined,
        endOffset: undefined,
        updatedAt: "2026-01-02T00:00:00Z",
      })
    ).toMatchObject({ status: "orphaned", startOffset: undefined });

    await repos.collections.create({
      id: "collection",
      name: "Read later",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await repos.collections.addItem({
      collectionId: "collection",
      itemId: "knowledge",
      position: 4,
      addedAt: "2026-01-01T00:00:00Z",
    });
    await repos.collections.addItem({
      collectionId: "collection",
      itemId: "knowledge",
      position: 1,
      addedAt: "2026-01-02T00:00:00Z",
    });
    expect(await repos.collections.listItems("collection")).toEqual([
      expect.objectContaining({ itemId: "knowledge", position: 1 }),
    ]);

    const event = {
      id: "event",
      eventKey: "client-action-1",
      itemId: "knowledge",
      eventType: "opened" as const,
      metadata: { surface: "reader" },
      occurredAt: "2026-01-01T00:00:00Z",
    };
    await repos.itemEvents.append(event);
    expect(await repos.itemEvents.append({ ...event, id: "retry" })).toMatchObject({ id: "event" });
    await expect(
      harness.sql`UPDATE item_events SET event_type='completed' WHERE id='event'`
    ).rejects.toThrow(/immutable/);
  });

  it("stores a stable ordered digest snapshot and cascades it with its run", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.items.insert(item("digest-item", "https://example.com/digest"));
    await repos.digests.create(
      {
        id: "digest",
        digestDate: "2026-01-10",
        status: "ready",
        createdAt: "2026-01-10T02:00:00Z",
        completedAt: "2026-01-10T02:00:01Z",
      },
      [
        {
          digestRunId: "digest",
          itemId: "digest-item",
          category: "priority",
          position: 0,
          reason: "Unread and high priority",
        },
      ]
    );
    expect(await repos.digests.findByDate("2026-01-10")).toMatchObject({
      id: "digest",
      status: "ready",
      items: [{ itemId: "digest-item", position: 0 }],
    });
    expect(
      await harness.sql<{ digest_date: string; local_date: string }[]>`
        SELECT digest_date::text,local_date::text FROM digest_runs WHERE id='digest'`
    ).toEqual([{ digest_date: "2026-01-10", local_date: "2026-01-10" }]);
    await repos.digests.dismiss("digest", "2026-01-10T03:00:00Z");
    expect((await repos.digests.list())[0].dismissedAt).toBe("2026-01-10T03:00:00.000Z");
    await harness.sql`DELETE FROM digest_runs WHERE id='digest'`;
    expect(
      await harness.sql<{ count: number }[]>`SELECT count(*)::int count FROM digest_items`
    ).toEqual([{ count: 0 }]);
  });
});
