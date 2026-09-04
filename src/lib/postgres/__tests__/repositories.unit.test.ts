import type { Sql } from "postgres";
import { createPostgresRepositories } from "../repositories";

type Row = Record<string, unknown>;

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
      "items",
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
    expect(fake.queries.some((query) => query.includes("ON CONFLICT (normalized_url)"))).toBe(true);
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

  test("covers token lifecycle and deterministic rate-limit windows", async () => {
    const tokenRow = {
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
    respond({ id: "j1", status: "running" });
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
      [{ id: "item-1" }],
      [richRow],
      [richRow],
      [],
      [richRow],
      [{ count: 4 }],
      [richRow],
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
});
