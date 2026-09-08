import type { Sql } from "postgres";
import { sha256 } from "@/lib/knowledge/content-identity";
import { createPostgresRepositories } from "../repositories";

type Row = Record<string, unknown>;
const userId = "10000000-0000-4000-8000-000000000010" as never;

function sqlDouble(initial: unknown[][] = []) {
  const responses = [...initial];
  const queries: string[] = [];
  const sql = jest.fn((strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if (!("raw" in strings)) return { values: strings };
    queries.push(strings.join("?"));
    return {
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(responses.shift() ?? []).then(resolve, reject);
      },
      values,
    };
  }) as unknown as Sql;
  Object.assign(sql, {
    json: jest.fn((value: unknown) => value),
    begin: jest.fn(async (callback: (tx: Sql) => Promise<unknown>) => callback(sql)),
  });
  return { sql, queries, responses };
}

const itemRow: Row = {
  id: "item-1",
  title: "Article",
  summary: "Summary",
  source_type: "manual",
  content_type: "article",
  topics: ["testing"],
  url: "https://example.com/article",
  priority: "medium",
  is_read: false,
  created_at: "2026-01-01T00:00:00Z",
  processing_status: "ready",
};

const captureRow: Row = {
  user_id: userId,
  origin_actor_kind: "user",
  origin_actor_id: userId,
  id: "capture-1",
  url: "https://example.com/article",
  normalized_url: "https://example.com/article",
  topics: [],
  priority: "medium",
  source: "web",
  status: "queued",
  retryable: true,
  attempts: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("PostgreSQL repositories with a controlled SQL adapter", () => {
  test("builds every repository and exercises item filtering and ordering", async () => {
    const fake = sqlDouble([[itemRow], [itemRow], [itemRow], [itemRow], [], [{ count: 0 }], []]);
    const repos = createPostgresRepositories(fake.sql);
    expect(Object.keys(repos)).toEqual([
      "auth",
      "items",
      "itemNotes",
      "annotations",
      "collections",
      "itemEvents",
      "digests",
      "captures",
      "captureTokens",
      "rateLimits",
      "oauthTokens",
      "summaries",
      "feedback",
      "research",
      "settings",
      "notifications",
      "embeddings",
      "rawContent",
      "contentVersions",
      "contentChunks",
      "intelligenceArtifacts",
      "claims",
      "knowledgeBackfills",
      "publisherQueue",
      "jobs",
      "agent",
    ]);

    await expect(repos.items.list()).resolves.toHaveLength(1);
    await expect(
      repos.items.list({ sort: "priority", includeProcessing: true })
    ).resolves.toHaveLength(1);
    await expect(
      repos.items.list({ sort: "ai_priority", sourceType: "manual" })
    ).resolves.toHaveLength(1);
    await expect(
      repos.items.list({
        query: "  durable testing  ",
        contentType: "article",
        priority: "high",
        isRead: false,
        limit: 5,
        offset: 2,
      })
    ).resolves.toHaveLength(1);
    await expect(repos.items.findById("missing")).resolves.toBeUndefined();
    await expect(repos.items.listRejected()).resolves.toEqual({ items: [], total: 0 });
    expect(fake.queries.some((query) => query.includes("websearch_to_tsquery"))).toBe(true);
    expect(fake.queries.some((query) => query.includes("CASE i.priority"))).toBe(true);
    expect(fake.queries.some((query) => query.includes("ai_priority_score"))).toBe(true);
  });

  test("handles item insert, update, delete, and status mutations", async () => {
    const fake = sqlDouble([
      [],
      [{ id: "item-1" }],
      [itemRow],
      [],
      [itemRow],
      [],
      [{ ...itemRow, title: "Changed" }],
      [],
      [{ id: "item-1" }],
      [],
      [],
    ]);
    const items = createPostgresRepositories(fake.sql).items;
    const input = {
      id: "item-1",
      title: "Article",
      summary: "Summary",
      sourceType: "manual" as const,
      contentType: "article" as const,
      topics: ["testing"],
      url: "https://example.com/article?utm_source=x",
      priority: "medium" as const,
      isRead: false,
      createdAt: "2026-01-01T00:00:00Z",
    };
    await expect(items.insert(input)).resolves.toMatchObject({ id: "item-1" });
    await expect(items.update("missing", { title: "Nope" })).resolves.toBeUndefined();
    await expect(items.update("item-1", { title: "Changed" })).resolves.toMatchObject({
      title: "Changed",
    });
    await expect(items.delete("missing")).resolves.toBe(false);
    await expect(items.delete("item-1")).resolves.toBe(true);
    await items.updateProcessingStatus("item-1", "rejected", "unsafe");
    await items.updatePriorityScore("item-1", 0.9, "high");
    expect(fake.queries.some((query) => query.includes("INSERT INTO items"))).toBe(true);
    expect(fake.queries.some((query) => query.includes("ON CONFLICT (normalized_url)"))).toBe(
      false
    );
  });

  test("maps capture records and enforces an empty transition precondition", async () => {
    const fake = sqlDouble([[captureRow], [captureRow], [], [captureRow], [captureRow], []]);
    const captures = createPostgresRepositories(fake.sql).captures;
    const created = await captures.create({
      id: "capture-1",
      url: "https://example.com/article",
      normalizedUrl: "https://example.com/article",
      topics: [],
      priority: "medium",
      source: "web",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(created).toMatchObject({ id: "capture-1", status: "queued" });
    await expect(captures.findById("capture-1")).resolves.toMatchObject({ id: "capture-1" });
    await expect(captures.findById("missing")).resolves.toBeUndefined();
    await expect(
      captures.findActiveOrReadyByNormalizedUrl("https://example.com/article")
    ).resolves.toMatchObject({ id: "capture-1" });
    await expect(captures.list()).resolves.toHaveLength(1);
    const callsBefore = (fake.sql as unknown as jest.Mock).mock.calls.length;
    await expect(
      captures.transition("capture-1", [], { status: "ready", updatedAt: "now" })
    ).resolves.toBeUndefined();
    expect((fake.sql as unknown as jest.Mock).mock.calls).toHaveLength(callsBefore);
    await expect(
      captures.transition("capture-1", ["queued"], { status: "processing", updatedAt: "now" })
    ).resolves.toBeUndefined();
  });

  test("writes both digest dates for complete and pending legacy snapshots", async () => {
    const fake = sqlDouble([[{ id: "digest-complete" }], [{ id: "digest-pending" }]]);
    const digests = createPostgresRepositories(fake.sql).digests;

    await expect(
      digests.create({
        id: "digest-complete",
        digestDate: "2026-01-10",
        status: "ready",
        createdAt: "2026-01-10T02:00:00Z",
        completedAt: "2026-01-10T02:00:01Z",
        dismissedAt: "2026-01-10T03:00:00Z",
      })
    ).resolves.toMatchObject({ id: "digest-complete", items: [] });
    await expect(
      digests.create({
        id: "digest-pending",
        digestDate: "2026-01-11",
        status: "pending",
        createdAt: "2026-01-11T02:00:00Z",
      })
    ).resolves.toMatchObject({ id: "digest-pending", items: [] });

    expect(
      fake.queries.filter((query) =>
        query.includes("INSERT INTO digest_runs(id,digest_date,local_date")
      )
    ).toHaveLength(2);
  });

  test("covers token lifecycle and deterministic rate-limit windows", async () => {
    const tokenRow = {
      user_id: userId,
      id: "token-1",
      name: "Phone",
      token_hash: "hash",
      token_prefix: "dst_cap_123",
      created_at: new Date("2026-01-01T00:00:00Z"),
      last_used_at: null,
      revoked_at: null,
    };
    const fake = sqlDouble([
      [],
      [tokenRow],
      [],
      [tokenRow],
      [{ id: "token-1" }],
      [],
      [],
      [{ count: 1 }],
      [{ count: 3 }],
    ]);
    const repos = createPostgresRepositories(fake.sql);
    await repos.captureTokens.create({
      userId,
      id: "token-1",
      name: "Phone",
      tokenHash: "hash",
      tokenPrefix: "dst_cap_123",
      createdAt: "2026-01-01T00:00:00Z",
    });
    await expect(repos.captureTokens.findActiveByHash("hash")).resolves.toMatchObject({
      id: "token-1",
    });
    await expect(repos.captureTokens.findActiveByHash("missing")).resolves.toBeUndefined();
    await expect(repos.captureTokens.list()).resolves.toEqual([
      expect.objectContaining({ id: "token-1", lastUsedAt: undefined, revokedAt: undefined }),
    ]);
    await expect(repos.captureTokens.revoke("token-1", "now")).resolves.toBe(true);
    await expect(repos.captureTokens.revoke("missing", "now")).resolves.toBe(false);
    await repos.captureTokens.touchLastUsed("token-1", "now");

    await expect(
      repos.rateLimits.consume({
        key: "ip",
        limit: 2,
        windowSeconds: 60,
        now: "2026-01-01T00:00:59Z",
      })
    ).resolves.toEqual({
      allowed: true,
      remaining: 1,
      resetAt: "2026-01-01T00:01:00.000Z",
    });
    await expect(
      repos.rateLimits.consume({
        key: "ip",
        limit: 2,
        windowSeconds: 60,
        now: "2026-01-01T00:00:59Z",
      })
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetAt: "2026-01-01T00:01:00.000Z",
    });
  });

  test("supports OAuth lookup branches and nullable field mapping", async () => {
    const row = {
      provider: "slack",
      team_id: "team",
      access_token: "access",
      refresh_token: null,
      expiry_date: null,
      email: null,
      updated_at: "2026-01-01T00:00:00Z",
    };
    const fake = sqlDouble([[row], [row], [], [row], [], [], []]);
    const oauth = createPostgresRepositories(fake.sql).oauthTokens;
    await expect(oauth.find("slack")).resolves.toMatchObject({
      provider: "slack",
      refreshToken: undefined,
    });
    await expect(oauth.find("slack", "team")).resolves.toMatchObject({ teamId: "team" });
    await expect(oauth.find("missing")).resolves.toBeUndefined();
    await expect(oauth.listByProvider("slack")).resolves.toHaveLength(1);
    await oauth.upsert({ provider: "slack", teamId: "team", accessToken: "new", updatedAt: "now" });
    await oauth.delete("slack");
    await oauth.delete("slack", "team");
    expect(fake.queries.filter((query) => query.includes("DELETE FROM oauth_tokens"))).toHaveLength(
      2
    );
  });

  test("covers durable supporting repositories and their result shaping", async () => {
    const fake = sqlDouble();
    const r = createPostgresRepositories(fake.sql);
    const respond = (...rows: unknown[]) => fake.responses.push(rows);

    await r.settings.set("key", "value");
    respond({ value: "value" });
    await expect(r.settings.get("key")).resolves.toBe("value");
    await expect(r.settings.get("missing")).resolves.toBeUndefined();

    await r.notifications.insert({ id: "n", itemId: "item-1", title: "Ready", message: "Done" });
    respond({
      id: "n",
      item_id: "item-1",
      title: "Ready",
      message: "Done",
      is_read: false,
      created_at: "2026-01-01Z",
    });
    await expect(r.notifications.list()).resolves.toEqual([
      expect.objectContaining({ id: "n", isRead: false }),
    ]);
    respond({ count: 2 });
    await expect(r.notifications.unreadCount()).resolves.toBe(2);
    await expect(r.notifications.unreadCount()).resolves.toBe(0);
    await r.notifications.markRead("n");
    await r.notifications.markAllRead();

    respond({ item_id: "item-1", embedding: [0.1], model: "embed", created_at: "2026-01-01Z" });
    await expect(r.embeddings.find("item-1")).resolves.toMatchObject({
      itemId: "item-1",
      embedding: [0.1],
    });
    await expect(r.embeddings.find("missing")).resolves.toBeUndefined();
    await r.embeddings.upsert("item-1", [0.2], "embed-2");
    respond({ item_id: "item-1", embedding: [0.2] });
    await expect(r.embeddings.listRecent()).resolves.toEqual([
      { itemId: "item-1", embedding: [0.2] },
    ]);

    await r.rawContent.insert({
      id: "raw",
      sourceType: "manual",
      rawBody: "body",
      metadata: {},
      fetchedAt: "now",
    });
    await r.rawContent.attachItem("raw", "item-1");
    await r.publisherQueue.enqueue("pub", "https://example.com");
    respond({
      user_id: userId,
      publisher_id: "pub",
      url: "https://example.com",
      discovered_at: "2026-01-01Z",
      status: "pending",
      attempts: 1,
      last_error: null,
    });
    await expect(r.publisherQueue.listPending("pub")).resolves.toEqual([
      expect.objectContaining({ publisherId: "pub", lastError: undefined }),
    ]);
    await r.publisherQueue.markFetched("pub", "https://example.com");
    await r.publisherQueue.markFailed("pub", "https://example.com", "timeout");
    respond(
      { status: "pending", count: 1 },
      { status: "fetched", count: 2 },
      { status: "failed", count: 3 },
      { status: "unknown", count: 99 }
    );
    await expect(r.publisherQueue.getStats("pub")).resolves.toEqual({
      pending: 1,
      fetched: 2,
      failed: 3,
    });

    await r.jobs.enqueue({ id: "j1", jobType: "capture", payload: '{"capture":1}' });
    await r.jobs.enqueue({ id: "j2", jobType: "capture", payload: "not-json" });
    await expect(r.jobs.dequeue("worker")).resolves.toBeUndefined();
    respond({ id: "j1" });
    respond({
      user_id: userId,
      id: "j1",
      job_type: "test",
      idempotency_key: "j1",
      payload: {},
      status: "running",
    });
    await expect(r.jobs.dequeue("worker")).resolves.toMatchObject({ status: "running" });
    await r.jobs.complete("j1");
    await r.jobs.complete("j2", "failed");
    respond(
      { status: "pending", count: 1 },
      { status: "completed", count: 2 },
      { status: "other", count: 8 }
    );
    await expect(r.jobs.getStats()).resolves.toEqual({
      pending: 1,
      running: 0,
      completed: 2,
      failed: 0,
    });
  });

  test("covers agent persistence parsing and workflow branches", async () => {
    const fake = sqlDouble();
    const agent = createPostgresRepositories(fake.sql).agent;
    const respond = (...rows: unknown[]) => fake.responses.push(rows);
    await agent.insertAuditLog({ id: "a", action: "capture" });
    respond({ id: "a" });
    await expect(agent.listAuditLogs()).resolves.toEqual([{ id: "a" }]);
    respond({ totalCost: 1, totalCalls: 2, totalTokens: 3 });
    await expect(agent.getDailyAuditStats()).resolves.toEqual({
      totalCost: 1,
      totalCalls: 2,
      totalTokens: 3,
    });
    await expect(agent.getDailyAuditStats()).resolves.toEqual({
      totalCost: 0,
      totalCalls: 0,
      totalTokens: 0,
    });
    await agent.insertWorkflow({ id: "w", workflowType: "capture" });
    await agent.updateWorkflow("missing", { status: "failed" });
    respond({ id: "w", status: "pending", current_step: null, steps_json: {} });
    await agent.updateWorkflow("w", { status: "complete", stepsJson: '{"done":true}' });
    respond({ id: "w" });
    await expect(agent.findWorkflow("w")).resolves.toEqual({ id: "w" });
    await agent.listWorkflows({ status: "complete", workflowType: "capture", limit: 2 });
    await agent.insertAction({ id: "action", actionType: "save" });
    await agent.listActions();
    await agent.listActions({ workflowId: "w", limit: 2 });
    await agent.insertApproval({
      id: "ap1",
      actionType: "publish",
      description: "Publish",
      payload: '{"ok":true}',
    });
    await agent.insertApproval({
      id: "ap2",
      actionType: "publish",
      description: "Publish",
      payload: "bad-json",
    });
    await agent.listPendingApprovals();
    await agent.resolveApproval("ap1", "approved");
    await agent.insertConversation({ id: "c" });
    await agent.insertMessage({
      id: "m1",
      conversationId: "c",
      role: "user",
      content: "hello",
      citations: '[{"id":1}]',
      toolCalls: { name: "save" },
    });
    await agent.insertMessage({
      id: "m2",
      conversationId: "c",
      role: "assistant",
      content: "hello",
      citations: "plain",
      toolCalls: null,
    });
    await agent.listMessages("c");
    await agent.listConversations();
    expect(fake.queries.some((query) => query.includes("approval_queue"))).toBe(true);
    expect(fake.queries.some((query) => query.includes("chat_messages"))).toBe(true);
  });

  test("maps summary, feedback, and research records including missing-row branches", async () => {
    const fake = sqlDouble();
    const r = createPostgresRepositories(fake.sql);
    const respond = (...rows: unknown[]) => fake.responses.push(rows);
    const summary = {
      id: "s",
      item_id: "item-1",
      summary: "Brief",
      model: "model",
      prompt_type: "brief",
      created_at: "2026-01-01Z",
    };
    respond(summary);
    await expect(r.summaries.find("item-1", "brief")).resolves.toMatchObject({ itemId: "item-1" });
    await expect(r.summaries.find("missing")).resolves.toBeUndefined();
    respond(
      { prompt_type: "brief", summary: "Brief" },
      { prompt_type: "detailed", summary: "Detailed" },
      { prompt_type: "unknown", summary: "Ignored" }
    );
    await expect(r.summaries.findAll("item-1")).resolves.toEqual({
      brief: "Brief",
      detailed: "Detailed",
    });
    respond(summary);
    await expect(
      r.summaries.upsert({
        id: "s",
        itemId: "item-1",
        summary: "Brief",
        model: "model",
        promptType: "brief",
      })
    ).resolves.toMatchObject({ id: "s" });
    await r.summaries.deleteForItem("item-1");

    const feedback = {
      id: "f",
      item_id: "item-1",
      rating: 1,
      reason: null,
      created_at: "2026-01-01Z",
    };
    respond(feedback);
    await expect(
      r.feedback.insert({ id: "f", itemId: "item-1", rating: 1 })
    ).resolves.toMatchObject({ reason: undefined });
    respond({ ...feedback, reason: "useful" });
    await expect(r.feedback.findForItem("item-1")).resolves.toMatchObject({ reason: "useful" });
    await expect(r.feedback.findForItem("missing")).resolves.toBeUndefined();
    respond(feedback);
    await expect(r.feedback.list()).resolves.toHaveLength(1);

    const report = {
      id: "report",
      item_id: null,
      query: "testing",
      report: "body",
      sources: "[]",
      model: "model",
      status: "pending",
      created_at: "2026-01-01Z",
      completed_at: null,
      progress: null,
    };
    respond(report);
    await expect(
      r.research.insertReport({ id: "report", query: "testing", model: "model" })
    ).resolves.toMatchObject({ itemId: undefined });
    respond({ ...report, item_id: "item-1", completed_at: "2026-01-02Z", progress: "done" });
    await expect(r.research.findReport("report")).resolves.toMatchObject({
      itemId: "item-1",
      progress: "done",
    });
    await expect(r.research.findReport("missing")).resolves.toBeUndefined();
    await expect(r.research.updateReport("missing", { status: "failed" })).resolves.toBeUndefined();
    respond(report);
    respond({ ...report, status: "complete", progress: "done" });
    await expect(
      r.research.updateReport("report", { status: "complete", progress: "done" })
    ).resolves.toMatchObject({ status: "complete" });
    respond(report);
    await expect(r.research.listReports()).resolves.toHaveLength(1);

    const suggestion = {
      id: "sg",
      topic_key: "testing",
      topic: "Testing",
      reason: "Useful",
      suggested_query: "testing",
      source_item_ids: ["item-1"],
      status: "pending",
      research_report_id: null,
      created_at: "2026-01-01Z",
    };
    respond(suggestion);
    await expect(r.research.listPendingSuggestions()).resolves.toHaveLength(1);
    respond({ ...suggestion, research_report_id: "report" });
    await expect(r.research.findSuggestion("sg")).resolves.toMatchObject({
      researchReportId: "report",
    });
    await expect(r.research.findSuggestion("missing")).resolves.toBeUndefined();
    await r.research.replacePendingSuggestions([
      {
        id: "sg",
        topicKey: "testing",
        topic: "Testing",
        reason: "Useful",
        suggestedQuery: "testing",
        sourceItemIds: ["item-1"],
      },
    ]);
    respond({ id: "sg" });
    await expect(r.research.dismissSuggestion("sg")).resolves.toBe(true);
    await expect(r.research.dismissSuggestion("missing")).resolves.toBe(false);
    respond({ id: "sg" });
    await expect(r.research.markSuggestionStarted("sg", "report")).resolves.toBe(true);
    await expect(r.research.markSuggestionStarted("missing", "report")).resolves.toBe(false);
  });

  test("preserves populated optional values across write paths", async () => {
    const richRow = {
      ...itemRow,
      full_content: "Full",
      author: "Author",
      publication: "Publication",
      duration: "5 min",
      thumbnail_url: "https://example.com/thumb.jpg",
      extracted_links: [{ text: "Related", url: "https://example.com/related" }],
      content_extracted_at: "2026-01-01T01:00:00Z",
      rejection_reason: "reason",
      content_classification: { type: "article" },
      detected_media: [{ type: "image" }],
      information_density: 0.8,
    };
    const fake = sqlDouble([
      [],
      [{ id: "item-1" }],
      [richRow],
      [richRow],
      [],
      [richRow],
      [{ count: 4 }],
      [richRow],
      [],
    ]);
    const repos = createPostgresRepositories(fake.sql);
    const richItem = {
      id: "item-1",
      title: "Article",
      summary: "Summary",
      fullContent: "Full",
      sourceType: "manual" as const,
      contentType: "article" as const,
      topics: ["testing"],
      author: "Author",
      publication: "Publication",
      url: "https://example.com/article",
      priority: "high" as const,
      isRead: true,
      createdAt: "2026-01-01Z",
      duration: "5 min",
      thumbnailUrl: "https://example.com/thumb.jpg",
      extractedLinks: [{ text: "Related", url: "https://example.com/related" }],
      contentExtractedAt: "2026-01-01T01:00:00Z",
      processingStatus: "rejected" as const,
      rejectionReason: "reason",
      contentClassification: { type: "article", confidence: 1 },
      detectedMedia: [{ type: "image", url: "https://example.com/image.jpg" }],
      informationDensity: 0.8,
    };
    await expect(repos.items.insert(richItem)).resolves.toMatchObject({ fullContent: "Full" });
    await expect(repos.items.update("item-1", richItem)).resolves.toMatchObject({
      author: "Author",
    });
    await expect(repos.items.listRejected(2, 1)).resolves.toMatchObject({ total: 4 });
    await repos.items.updateProcessingStatus("item-1", "ready");

    fake.responses.push([{ ...captureRow, title: "Title", notes: "Note" }]);
    await repos.captures.create({
      id: "capture-1",
      url: "https://example.com",
      normalizedUrl: "https://example.com/",
      title: "Title",
      notes: "Note",
      topics: ["testing"],
      priority: "high",
      source: "web",
      createdAt: "2026-01-01Z",
    });
    fake.responses.push([{ ...captureRow, status: "failed", item_id: "item-1" }]);
    await expect(
      repos.captures.transition("capture-1", ["processing"], {
        status: "failed",
        itemId: "item-1",
        retryable: false,
        attempts: 5,
        errorCode: "FAILED",
        errorMessage: "Failure",
        updatedAt: "2026-01-02Z",
      })
    ).resolves.toMatchObject({ itemId: "item-1" });

    await repos.captureTokens.create({
      userId,
      id: "token",
      name: "Phone",
      tokenHash: "hash",
      tokenPrefix: "dst_cap_",
      createdAt: "2026-01-01Z",
      lastUsedAt: "2026-01-02Z",
      revokedAt: "2026-01-03Z",
    });
    fake.responses.push([
      {
        user_id: userId,
        id: "token",
        name: "Phone",
        token_prefix: "dst_cap_",
        created_at: "2026-01-01Z",
        last_used_at: "2026-01-02Z",
        revoked_at: "2026-01-03Z",
      },
    ]);
    await expect(repos.captureTokens.list()).resolves.toEqual([
      expect.objectContaining({ lastUsedAt: expect.any(String), revokedAt: expect.any(String) }),
    ]);
    await repos.oauthTokens.upsert({
      provider: "slack",
      teamId: "team",
      accessToken: "access",
      refreshToken: "refresh",
      expiryDate: 123,
      email: "person@example.com",
      updatedAt: "2026-01-01Z",
    });
  });

  test("covers populated agent metadata and fallback workflow updates", async () => {
    const fake = sqlDouble();
    const agent = createPostgresRepositories(fake.sql).agent;
    await agent.insertAuditLog({
      id: "audit",
      action: "capture",
      toolName: "fetch",
      inputHash: "in",
      outputHash: "out",
      model: "model",
      provider: "provider",
      tokensIn: 10,
      tokensOut: 20,
      cost: 0.1,
      latencyMs: 30,
      traceId: "trace",
    });
    await agent.insertWorkflow({
      id: "workflow",
      workflowType: "capture",
      itemId: "item-1",
      traceId: "trace",
    });
    fake.responses.push([
      {
        id: "workflow",
        status: "pending",
        current_step: "fetch",
        steps_json: { fetch: true },
        error: "old",
        completed_at: "old",
      },
    ]);
    await agent.updateWorkflow("workflow", {});
    await agent.insertAction({
      id: "action",
      workflowId: "workflow",
      actionType: "capture",
      toolName: "fetch",
      input: "in",
      output: "out",
      reasoning: "because",
      status: "failed",
      traceId: "trace",
    });
    await agent.insertApproval({
      id: "approval",
      workflowId: "workflow",
      actionType: "publish",
      description: "Publish",
      payload: { allowed: true },
      traceId: "trace",
    });
    await agent.insertConversation({ id: "conversation", title: "Capture" });
    await agent.insertMessage({
      id: "message",
      conversationId: "conversation",
      role: "assistant",
      content: "Done",
      citations: null,
      toolCalls: null,
    });
  });

  test("covers content-version and chunk repository result and idempotency branches", async () => {
    const version = {
      id: "version-1",
      item_id: "item-1",
      version: 1,
      content_hash: `sha256:${"1".repeat(64)}`,
      extractor_version: "extractor-v1",
      source: "full_content",
      content: "Durable content.",
      character_count: 16,
      token_count: 4,
      created_at: "2026-01-01Z",
    };
    const chunk = {
      id: "chunk-1",
      content_version_id: "version-1",
      item_id: "item-1",
      ordinal: 0,
      content: "Durable content.",
      content_hash: `sha256:${"2".repeat(64)}`,
      start_offset: 0,
      end_offset: 16,
      token_count: 4,
      embedding_model: null,
      embedding_dimensions: null,
      embedding_status: "unconfigured",
      embedding_error: null,
      embedding_updated_at: null,
      embedded_at: null,
      created_at: "2026-01-01Z",
    };
    const fake = sqlDouble([
      [version],
      [],
      [version],
      [version],
      [{ item_id: "item-1", title: "Item", full_content: null, summary: "Summary" }],
      [],
      [version],
      [],
      [],
      [{ version: 2 }],
      [{ ...version, id: "version-2", version: 2 }],
      [chunk],
      [],
      [chunk],
      [chunk],
      [],
      [chunk],
      [version],
    ]);
    const repositories = createPostgresRepositories(fake.sql);
    await expect(repositories.contentVersions.findById("version-1")).resolves.toMatchObject({
      id: "version-1",
      source: "full_content",
    });
    await expect(repositories.contentVersions.findById("missing")).resolves.toBeUndefined();
    await expect(repositories.contentVersions.findLatestForItem("item-1")).resolves.toBeDefined();
    await expect(repositories.contentVersions.listForItem("item-1")).resolves.toHaveLength(1);
    await expect(repositories.contentVersions.listReadyCandidates({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ itemId: "item-1", fullContent: undefined, summary: "Summary" }),
    ]);
    const record = {
      id: "version-1",
      itemId: "item-1",
      contentHash: version.content_hash,
      extractorVersion: "extractor-v1",
      source: "full_content" as const,
      content: "Durable content.",
      characterCount: 16,
      tokenCount: 4,
      createdAt: "2026-01-01Z",
    };
    await expect(repositories.contentVersions.create(record)).resolves.toMatchObject({
      created: false,
    });
    await expect(
      repositories.contentVersions.create({ ...record, id: "version-2" })
    ).resolves.toMatchObject({ created: true, record: { version: 2 } });

    await expect(repositories.contentChunks.findById("chunk-1")).resolves.toMatchObject({
      embeddingModel: undefined,
      embeddedAt: undefined,
    });
    await expect(repositories.contentChunks.findById("missing")).resolves.toBeUndefined();
    await expect(
      repositories.contentChunks.listForContentVersion("version-1")
    ).resolves.toHaveLength(1);
    await expect(repositories.contentChunks.insertMany([])).resolves.toEqual({
      records: [],
      insertedCount: 0,
    });
    const chunkRecord = {
      id: "chunk-1",
      contentVersionId: "version-1",
      itemId: "item-1",
      ordinal: 0,
      content: "Durable content.",
      contentHash: chunk.content_hash,
      startOffset: 0,
      endOffset: 16,
      tokenCount: 4,
      embeddingStatus: "unconfigured" as const,
      createdAt: "2026-01-01Z",
    };
    await expect(repositories.contentChunks.insertMany([chunkRecord])).resolves.toMatchObject({
      insertedCount: 1,
    });
    await expect(repositories.contentChunks.insertMany([chunkRecord])).resolves.toMatchObject({
      insertedCount: 0,
    });
    await expect(
      repositories.contentChunks.listUnchunkedVersions({ limit: 2 })
    ).resolves.toHaveLength(1);
  });

  test("covers artifact lifecycle and knowledge candidate mapping branches", async () => {
    const pending = {
      id: "artifact-new",
      item_id: "item-1",
      content_version_id: "version-1",
      artifact_type: "brief_summary",
      version: 2,
      status: "pending",
      content: null,
      content_hash: null,
      provenance: "generated",
      prompt_version: null,
      provider: null,
      model: null,
      is_current: false,
      supersedes_artifact_id: null,
      metadata: {},
      error_code: null,
      error_message: null,
      created_at: "2026-01-01Z",
      updated_at: "2026-01-01Z",
      completed_at: null,
    };
    const ready = {
      ...pending,
      id: "artifact-old",
      version: 1,
      status: "ready",
      content: "Existing",
      is_current: true,
      prompt_version: "v1",
    };
    const fake = sqlDouble([
      [pending],
      [],
      [ready],
      [ready, pending],
      [
        {
          summary_id: "summary-1",
          item_id: "item-1",
          content_version_id: "version-1",
          prompt_type: "brief",
          summary: "Legacy",
          model: "old",
          created_at: "2026-01-01Z",
        },
      ],
      [
        {
          item_id: "item-1",
          title: "Item",
          content_version_id: "version-1",
          content: "Content",
        },
      ],
      [],
      [ready],
      [],
      [],
      [ready],
      [{ version: 2 }],
      [],
      [{ ...pending, status: "ready", content: "Replacement", is_current: true }],
      [{ ...pending, content: "Staged" }],
      [],
      [pending],
      [],
      [ready],
      [pending],
      [],
      [{ ...pending, status: "failed", error_code: "provider_error" }],
    ]);
    const artifacts = createPostgresRepositories(fake.sql).intelligenceArtifacts;
    await expect(artifacts.findById("artifact-new")).resolves.toMatchObject({
      content: undefined,
      completedAt: undefined,
    });
    await expect(artifacts.findById("missing")).resolves.toBeUndefined();
    await expect(artifacts.findCurrent("item-1", "brief_summary")).resolves.toMatchObject({
      isCurrent: true,
    });
    await expect(artifacts.listForItem("item-1")).resolves.toHaveLength(2);
    await expect(artifacts.listLegacySummaryCandidates({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ summaryId: "summary-1", summary: "Legacy" }),
    ]);
    await expect(artifacts.listDegradedSummaryCandidates({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ itemId: "item-1", content: "Content" }),
    ]);
    const record = {
      id: "artifact-new",
      itemId: "item-1",
      contentVersionId: "version-1",
      artifactType: "brief_summary" as const,
      status: "ready" as const,
      content: "Replacement",
      contentHash: sha256("Replacement"),
      provenance: "generated" as const,
      makeCurrent: true,
      metadata: {},
      createdAt: "2026-01-01Z",
      updatedAt: "2026-01-01Z",
    };
    await expect(artifacts.publish(record)).resolves.toMatchObject({ created: false });
    await expect(artifacts.publish(record)).resolves.toMatchObject({
      created: true,
      record: { isCurrent: true, content: "Replacement" },
    });
    await expect(
      artifacts.updatePending("artifact-new", {
        content: "Staged",
        contentHash: sha256("Staged"),
        promptVersion: "v2",
        provider: "provider",
        model: "model",
        metadata: { attempt: 1 },
        updatedAt: "2026-01-02Z",
      })
    ).resolves.toMatchObject({ content: "Staged" });
    await expect(
      artifacts.updatePending("artifact-new", {
        metadata: {},
        updatedAt: "2026-01-02Z",
      })
    ).resolves.toMatchObject({ id: "artifact-new" });
    await expect(
      artifacts.complete("missing", {
        status: "failed",
        metadata: {},
        updatedAt: "2026-01-02Z",
        makeCurrent: false,
      })
    ).resolves.toBeUndefined();
    await expect(
      artifacts.complete("artifact-old", {
        status: "ready",
        metadata: {},
        updatedAt: "2026-01-02Z",
        makeCurrent: true,
      })
    ).resolves.toMatchObject({ id: "artifact-old", status: "ready" });
    await expect(
      artifacts.complete("artifact-new", {
        status: "failed",
        metadata: {},
        errorCode: "provider_error",
        updatedAt: "2026-01-02Z",
        makeCurrent: true,
      })
    ).resolves.toMatchObject({ status: "failed", isCurrent: false });
  });

  test("validates grounded claims and maps durable backfill checkpoint lifecycle", async () => {
    const claim = {
      id: "claim-1",
      artifact_id: "artifact-1",
      ordinal: 0,
      claim: "Durable content",
      claim_hash: sha256("Durable content"),
      confidence: null,
    };
    const evidence = {
      claim_id: "claim-1",
      chunk_id: "chunk-1",
      start_offset: 0,
      end_offset: 7,
      exact_excerpt: "Durable",
      evidence_hash: sha256("Durable"),
    };
    const listing = sqlDouble([[claim], [evidence]]);
    await expect(
      createPostgresRepositories(listing.sql).claims.listForArtifact("artifact-1")
    ).resolves.toEqual([
      expect.objectContaining({
        confidence: undefined,
        evidence: [expect.objectContaining({ chunkId: "chunk-1", exactExcerpt: "Durable" })],
      }),
    ]);

    const claims = createPostgresRepositories(sqlDouble().sql).claims;
    await expect(claims.insertWithEvidence([])).resolves.toEqual([]);
    await expect(
      claims.insertWithEvidence([
        {
          id: "claim-1",
          artifactId: "artifact-1",
          ordinal: 0,
          claim: "Durable content",
          claimHash: claim.claim_hash,
          evidence: [],
        },
        {
          id: "claim-2",
          artifactId: "artifact-2",
          ordinal: 1,
          claim: "Durable content",
          claimHash: claim.claim_hash,
          evidence: [],
        },
      ])
    ).rejects.toThrow("share an artifact");
    await expect(
      claims.insertWithEvidence([
        {
          id: "claim-bad",
          artifactId: "artifact-1",
          ordinal: 0,
          claim: "Text",
          claimHash: "wrong",
          evidence: [],
        },
      ])
    ).rejects.toThrow("Claim hash does not match");

    const validSql = sqlDouble([[], [{ content: "Durable content" }], [], [claim], [evidence]]);
    await expect(
      createPostgresRepositories(validSql.sql).claims.insertWithEvidence([
        {
          id: "claim-1",
          artifactId: "artifact-1",
          ordinal: 0,
          claim: "Durable content",
          claimHash: sha256("Durable content"),
          evidence: [
            {
              claimId: "claim-1",
              chunkId: "chunk-1",
              startOffset: 0,
              endOffset: 7,
              exactExcerpt: "Durable",
              evidenceHash: sha256("Durable"),
            },
          ],
        },
      ])
    ).resolves.toHaveLength(1);

    const checkpoint = {
      job_key: "job-1",
      job_type: "chunks",
      status: "pending",
      cursor: null,
      checkpoint: '{"scope":"all"}',
      processed_count: 0,
      failed_count: 0,
      attempt: 0,
      last_error: null,
      started_at: null,
      completed_at: null,
      updated_at: "2026-01-01Z",
    };
    const checkpointSql = sqlDouble([
      [checkpoint],
      [checkpoint],
      [],
      [checkpoint],
      [{ ...checkpoint, status: "running", attempt: 1, started_at: "2026-01-01Z" }],
      [{ ...checkpoint, status: "completed", cursor: "version-1", processed_count: 1 }],
      [{ ...checkpoint, status: "failed", failed_count: 1, last_error: "failure" }],
      [checkpoint],
    ]);
    const backfills = createPostgresRepositories(checkpointSql.sql).knowledgeBackfills;
    await expect(backfills.find("job-1")).resolves.toMatchObject({
      checkpoint: { scope: "all" },
      cursor: undefined,
    });
    const checkpointRecord = {
      jobKey: "job-1",
      jobType: "chunks" as const,
      status: "pending" as const,
      checkpoint: { scope: "all" },
      processedCount: 0,
      failedCount: 0,
      attempt: 0,
      updatedAt: "2026-01-01Z",
    };
    await expect(backfills.create(checkpointRecord)).resolves.toMatchObject({ jobKey: "job-1" });
    await expect(backfills.create(checkpointRecord)).resolves.toMatchObject({ jobKey: "job-1" });
    await expect(backfills.start("job-1", "2026-01-01Z")).resolves.toMatchObject({
      status: "running",
      attempt: 1,
    });
    await expect(
      backfills.advance("job-1", {
        cursor: "version-1",
        checkpoint: { scope: "all" },
        processedDelta: 1,
        completed: true,
        at: "2026-01-01Z",
      })
    ).resolves.toMatchObject({ status: "completed", processedCount: 1 });
    await expect(backfills.fail("job-1", "failure", "2026-01-01Z")).resolves.toMatchObject({
      status: "failed",
      failedCount: 1,
    });
    await expect(backfills.listByType("chunks", 2)).resolves.toHaveLength(1);
  });
});
