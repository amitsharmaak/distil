import type { RepositorySet } from "@/lib/repositories/ports";
import type { ContentItem } from "@/lib/types";

type DatabaseModule = typeof import("@/lib/database");
type MockGroup = Record<string, jest.Mock>;

const methodNames: Record<string, string[]> = {
  items: [
    "list",
    "findById",
    "findByNormalizedUrl",
    "listRejected",
    "insert",
    "update",
    "delete",
    "updateProcessingStatus",
    "updatePriorityScore",
  ],
  captures: ["create", "findById", "findActiveOrReadyByNormalizedUrl", "list", "transition"],
  captureTokens: ["create", "findActiveByHash", "list", "revoke", "touchLastUsed"],
  rateLimits: ["consume"],
  oauthTokens: ["find", "listByProvider", "upsert", "delete"],
  summaries: ["find", "findAll", "upsert", "deleteForItem"],
  feedback: ["insert", "findForItem", "list"],
  research: [
    "insertReport",
    "findReport",
    "updateReport",
    "listReports",
    "listPendingSuggestions",
    "findSuggestion",
    "replacePendingSuggestions",
    "dismissSuggestion",
    "markSuggestionStarted",
  ],
  settings: ["get", "set"],
  notifications: ["insert", "list", "unreadCount", "markRead", "markAllRead"],
  embeddings: ["find", "upsert", "listRecent"],
  rawContent: ["insert", "attachItem"],
  publisherQueue: ["enqueue", "listPending", "markFetched", "markFailed", "getStats"],
  jobs: ["enqueue", "dequeue", "complete", "getStats"],
  agent: [
    "insertAuditLog",
    "listAuditLogs",
    "getDailyAuditStats",
    "insertWorkflow",
    "updateWorkflow",
    "findWorkflow",
    "listWorkflows",
    "insertAction",
    "listActions",
    "insertApproval",
    "listPendingApprovals",
    "resolveApproval",
    "insertConversation",
    "insertMessage",
    "listMessages",
    "listConversations",
  ],
};

function repositoryDouble() {
  const groups: Record<string, MockGroup> = {};
  for (const [group, names] of Object.entries(methodNames)) {
    groups[group] = Object.fromEntries(
      names.map((name) => [name, jest.fn().mockResolvedValue(undefined)])
    );
  }
  return { groups, repositories: groups as unknown as RepositorySet };
}

async function loadPostgres() {
  jest.resetModules();
  const { groups, repositories } = repositoryDouble();
  const createPostgresClient = jest.fn().mockReturnValue("sql-client");
  const createPostgresRepositories = jest.fn().mockReturnValue(repositories);
  jest.doMock("@/lib/config", () => ({ config: { databaseUrl: "postgres://test" } }));
  jest.doMock("@/lib/postgres/client", () => ({ createPostgresClient }));
  jest.doMock("@/lib/postgres/repositories", () => ({ createPostgresRepositories }));
  jest.doMock("@/lib/db", () => ({}));
  const database = await import("@/lib/database");
  return { database, groups, repositories, createPostgresClient, createPostgresRepositories };
}

async function loadLegacy() {
  jest.resetModules();
  const legacyNames = [
    "getItems", "getItemById", "getRejectedItems", "getItemByNormalizedUrl", "insertItem",
    "updateItem", "deleteItem", "getOAuthToken", "getOAuthTokensByProvider", "upsertOAuthToken",
    "deleteOAuthToken", "getAISummary", "getAISummaries", "upsertAISummary", "insertFeedback",
    "getFeedback", "getAllFeedback", "insertResearchReport", "getResearchReport",
    "updateResearchReport", "getResearchReports", "getPendingResearchSuggestions",
    "getResearchSuggestionById", "replacePendingResearchSuggestions", "dismissResearchSuggestion",
    "markResearchSuggestionStarted", "getUserSetting", "setUserSetting", "insertRawContent",
    "updateRawContentItemId", "updateItemProcessingStatus", "updateItemPriorityScore",
    "insertNotification", "getNotifications", "getUnreadNotificationCount", "markNotificationRead",
    "markAllNotificationsRead", "getItemEmbedding", "upsertItemEmbedding", "getRecentEmbeddings",
    "insertAuditLog", "getAuditLogs", "getDailyAuditStats", "insertWorkflowRun", "updateWorkflowRun",
    "getWorkflowRun", "getWorkflowRuns", "insertAgentAction", "getAgentActions", "insertApproval",
    "getPendingApprovals", "resolveApproval", "insertChatConversation", "insertChatMessage",
    "getChatMessages", "getChatConversations", "enqueueJob", "dequeueJob", "completeJob", "getJobStats",
  ];
  const legacy: Record<string, jest.Mock | { prepare: jest.Mock }> = Object.fromEntries(
    legacyNames.map((name) => [name, jest.fn().mockResolvedValue(name)])
  );
  const attempts: Array<{ attempts: number } | undefined> = [undefined, { attempts: 1 }, { attempts: 2 }];
  const run = jest.fn();
  const prepare = jest.fn((sql: string) => ({
    run,
    get: jest.fn(() => attempts.shift()),
    all: jest.fn(() =>
      sql.includes("SELECT url")
        ? [{ url: "https://example.com/queued" }]
        : [
            { status: "pending", count: 2 },
            { status: "fetched", count: 3 },
            { status: "failed", count: 1 },
          ]
    ),
  }));
  legacy.db = { prepare };
  jest.doMock("@/lib/config", () => ({ config: { databaseUrl: "" } }));
  jest.doMock("@/lib/db", () => legacy);
  const database = await import("@/lib/database");
  return { database, legacy, prepare, run };
}

const item: ContentItem = {
  id: "item-1",
  title: "A useful article",
  summary: "Summary",
  sourceType: "manual",
  contentType: "article",
  topics: ["testing"],
  url: "https://example.com/article",
  priority: "medium",
  isRead: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("database facade using PostgreSQL", () => {
  test("creates and caches one repository composition root", async () => {
    const loaded = await loadPostgres();

    await expect(loaded.database.getRepositorySet()).resolves.toBe(loaded.repositories);
    await expect(loaded.database.getRepositorySet()).resolves.toBe(loaded.repositories);
    expect(loaded.createPostgresClient).toHaveBeenCalledTimes(1);
    expect(loaded.createPostgresClient).toHaveBeenCalledWith({ url: "postgres://test" });
    expect(loaded.createPostgresRepositories).toHaveBeenCalledWith("sql-client");
  });

  test("delegates item, settings, content, notification, job, and publisher operations", async () => {
    const { database: db, groups: g } = await loadPostgres();
    g.items.list.mockResolvedValue([item]);
    g.items.findById.mockResolvedValue(item);
    g.items.findByNormalizedUrl.mockResolvedValue(item);
    g.items.listRejected.mockResolvedValue({ items: [item], total: 1 });
    g.items.insert.mockResolvedValue(item);
    g.items.update.mockResolvedValue({ ...item, title: "Updated" });
    g.items.delete.mockResolvedValue(true);
    g.settings.get.mockResolvedValue("enabled");
    g.notifications.list.mockResolvedValue([{ id: "n-1" }]);
    g.notifications.unreadCount.mockResolvedValue(2);
    g.jobs.dequeue.mockResolvedValue({ id: "job-1" });
    g.jobs.getStats.mockResolvedValue({ pending: 1, running: 0, completed: 2, failed: 0 });
    g.publisherQueue.listPending.mockResolvedValue([{ url: "https://example.com/one" }]);
    g.publisherQueue.getStats.mockResolvedValue({ pending: 1, fetched: 2, failed: 3 });

    await expect(db.getItems()).resolves.toEqual([item]);
    expect(g.items.list).toHaveBeenCalledWith({});
    await expect(db.getItems({ priority: "high" })).resolves.toEqual([item]);
    await expect(db.getItemById("item-1")).resolves.toBe(item);
    await expect(db.getItemByNormalizedUrl(item.url)).resolves.toBe(item);
    await expect(db.getRejectedItems()).resolves.toEqual({ items: [item], total: 1 });
    expect(g.items.listRejected).toHaveBeenCalledWith(50, 0);
    await expect(db.insertItem(item)).resolves.toBe(item);
    await expect(db.updateItem("item-1", { title: "Updated" })).resolves.toMatchObject({
      title: "Updated",
    });
    await expect(db.deleteItem("item-1")).resolves.toBe(true);
    await db.updateItemProcessingStatus("item-1", "rejected", "too short");
    expect(g.items.updateProcessingStatus).toHaveBeenCalledWith("item-1", "rejected", "too short");
    await db.updateItemPriorityScore("item-1", 0.91, "high");
    expect(g.items.updatePriorityScore).toHaveBeenCalledWith("item-1", 0.91, "high");

    await expect(db.getUserSetting("feature")).resolves.toBe("enabled");
    await db.setUserSetting("feature", "disabled");
    expect(g.settings.set).toHaveBeenCalledWith("feature", "disabled");
    const raw = {
      id: "raw-1",
      sourceType: "web",
      rawBody: "body",
      metadata: {},
      fetchedAt: item.createdAt,
    };
    await db.insertRawContent(raw);
    expect(g.rawContent.insert).toHaveBeenCalledWith(raw);
    await db.updateRawContentItemId("raw-1", "item-1");
    expect(g.rawContent.attachItem).toHaveBeenCalledWith("raw-1", "item-1");

    const notification = { id: "n-1", itemId: "item-1", title: "Ready", message: "Done" };
    await db.insertNotification(notification);
    await expect(db.getNotifications()).resolves.toEqual([{ id: "n-1" }]);
    expect(g.notifications.list).toHaveBeenCalledWith(20);
    await expect(db.getUnreadNotificationCount()).resolves.toBe(2);
    await db.markNotificationRead("n-1");
    await db.markAllNotificationsRead();
    expect(g.notifications.insert).toHaveBeenCalledWith(notification);
    expect(g.notifications.markRead).toHaveBeenCalledWith("n-1");
    expect(g.notifications.markAllRead).toHaveBeenCalled();

    const job = { id: "job-1", jobType: "capture" };
    await db.enqueueJob(job);
    await expect(db.dequeueJob("worker-1")).resolves.toEqual({ id: "job-1" });
    await db.completeJob("job-1", "failed");
    await expect(db.getJobStats()).resolves.toEqual({
      pending: 1,
      running: 0,
      completed: 2,
      failed: 0,
    });
    expect(g.jobs.enqueue).toHaveBeenCalledWith(job);
    expect(g.jobs.dequeue).toHaveBeenCalledWith("worker-1");
    expect(g.jobs.complete).toHaveBeenCalledWith("job-1", "failed");

    await db.enqueuePublisherUrl("publisher-1", item.url);
    await expect(db.listPendingPublisherUrls("publisher-1", 10)).resolves.toEqual([
      "https://example.com/one",
    ]);
    await db.markPublisherUrlFetched("publisher-1", item.url);
    await db.markPublisherUrlFailed("publisher-1", item.url, "timeout");
    await expect(db.getPublisherQueueStats("publisher-1")).resolves.toEqual({
      pending: 1,
      fetched: 2,
      failed: 3,
    });
    expect(g.publisherQueue.enqueue).toHaveBeenCalledWith("publisher-1", item.url);
    expect(g.publisherQueue.listPending).toHaveBeenCalledWith("publisher-1", 10);
    expect(g.publisherQueue.markFetched).toHaveBeenCalledWith("publisher-1", item.url);
    expect(g.publisherQueue.markFailed).toHaveBeenCalledWith("publisher-1", item.url, "timeout");
  });

  test("maps OAuth, summaries, feedback, research, and embeddings to legacy shapes", async () => {
    const { database: db, groups: g } = await loadPostgres();
    const oauth = {
      provider: "slack",
      teamId: "team-1",
      accessToken: "secret",
      refreshToken: "refresh",
      expiryDate: 123,
      email: "person@example.com",
      updatedAt: item.createdAt,
    };
    g.oauthTokens.find.mockResolvedValueOnce(oauth).mockResolvedValueOnce(undefined);
    g.oauthTokens.listByProvider.mockResolvedValue([oauth, { ...oauth, refreshToken: undefined }]);

    await expect(db.getOAuthToken("slack", "team-1")).resolves.toEqual({
      provider: "slack",
      team_id: "team-1",
      access_token: "secret",
      refresh_token: "refresh",
      expiry_date: 123,
      email: "person@example.com",
      updated_at: item.createdAt,
    });
    await expect(db.getOAuthToken("missing")).resolves.toBeUndefined();
    await expect(db.getOAuthTokensByProvider("slack")).resolves.toHaveLength(2);
    await db.upsertOAuthToken("slack", "team-1", {
      access_token: "new-secret",
      refresh_token: null,
      expiry_date: null,
      email: null,
    });
    expect(g.oauthTokens.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "slack",
        teamId: "team-1",
        accessToken: "new-secret",
        refreshToken: undefined,
        expiryDate: undefined,
        email: undefined,
        updatedAt: expect.any(String),
      })
    );
    await db.deleteOAuthToken("slack");
    expect(g.oauthTokens.delete).toHaveBeenCalledWith("slack", undefined);

    const summary = {
      id: "summary-1",
      itemId: "item-1",
      summary: "Brief",
      model: "model",
      promptType: "brief",
      createdAt: item.createdAt,
    };
    g.summaries.find.mockResolvedValueOnce(summary).mockResolvedValueOnce(undefined);
    g.summaries.findAll.mockResolvedValue({ brief: "Brief", detailed: "Detailed" });
    g.summaries.upsert.mockResolvedValue(summary);
    await expect(db.getAISummary("item-1", "brief")).resolves.toEqual({
      id: "summary-1",
      item_id: "item-1",
      summary: "Brief",
      model: "model",
      prompt_type: "brief",
      created_at: item.createdAt,
    });
    await expect(db.getAISummary("missing")).resolves.toBeUndefined();
    await expect(db.getAISummaries("item-1")).resolves.toEqual({
      brief: "Brief",
      detailed: "Detailed",
    });
    await expect(
      db.upsertAISummary({
        id: "summary-1",
        itemId: "item-1",
        summary: "Brief",
        model: "model",
        promptType: "brief",
      })
    ).resolves.toMatchObject({ item_id: "item-1" });
    await db.deleteAISummaries("item-1");
    expect(g.summaries.deleteForItem).toHaveBeenCalledWith("item-1");

    const feedback = {
      id: "feedback-1",
      itemId: "item-1",
      rating: 1,
      reason: undefined,
      createdAt: item.createdAt,
    };
    g.feedback.insert.mockResolvedValue(feedback);
    g.feedback.findForItem.mockResolvedValueOnce(feedback).mockResolvedValueOnce(undefined);
    g.feedback.list.mockResolvedValue([{ ...feedback, reason: "useful" }]);
    await expect(db.insertFeedback({ id: "feedback-1", itemId: "item-1", rating: 1 })).resolves.toEqual(
      expect.objectContaining({ item_id: "item-1", reason: null })
    );
    await expect(db.getFeedback("item-1")).resolves.toEqual(
      expect.objectContaining({ id: "feedback-1" })
    );
    await expect(db.getFeedback("missing")).resolves.toBeUndefined();
    await expect(db.getAllFeedback()).resolves.toEqual([
      expect.objectContaining({ reason: "useful" }),
    ]);

    const report = {
      id: "report-1",
      itemId: undefined,
      query: "testing",
      report: "Report",
      sources: "[]",
      model: "model",
      status: "complete",
      createdAt: item.createdAt,
      completedAt: undefined,
      progress: null,
    };
    g.research.insertReport.mockResolvedValue(report);
    g.research.findReport.mockResolvedValueOnce(report).mockResolvedValueOnce(undefined);
    g.research.updateReport.mockResolvedValue(report);
    g.research.listReports.mockResolvedValue([report]);
    const reportInput = { id: "report-1", query: "testing", model: "model" };
    await expect(db.insertResearchReport(reportInput)).resolves.toMatchObject({
      item_id: null,
      completed_at: null,
    });
    await expect(db.getResearchReport("report-1")).resolves.toMatchObject({ id: "report-1" });
    await expect(db.getResearchReport("missing")).resolves.toBeUndefined();
    await expect(db.updateResearchReport("report-1", { status: "complete" })).resolves.toMatchObject({
      status: "complete",
    });
    await expect(db.getResearchReports()).resolves.toHaveLength(1);
    expect(g.research.listReports).toHaveBeenCalledWith(20);

    const suggestion = {
      id: "suggestion-1",
      topicKey: "typescript",
      topic: "TypeScript",
      reason: "Relevant",
      suggestedQuery: "TypeScript testing",
      sourceItemIds: ["item-1"],
      status: "pending",
      researchReportId: undefined,
      createdAt: item.createdAt,
    };
    g.research.listPendingSuggestions.mockResolvedValue([suggestion]);
    g.research.findSuggestion.mockResolvedValueOnce(suggestion).mockResolvedValueOnce(undefined);
    await expect(db.getPendingResearchSuggestions()).resolves.toEqual([
      expect.objectContaining({ source_item_ids: '["item-1"]', research_report_id: null }),
    ]);
    await expect(db.getResearchSuggestionById("suggestion-1")).resolves.toMatchObject({
      topic_key: "typescript",
    });
    await expect(db.getResearchSuggestionById("missing")).resolves.toBeUndefined();
    await db.replacePendingResearchSuggestions([
      {
        id: "suggestion-1",
        topicKey: "typescript",
        topic: "TypeScript",
        reason: "Relevant",
        suggestedQuery: "TypeScript testing",
        sourceItemIds: ["item-1"],
      },
    ]);
    expect(g.research.replacePendingSuggestions).toHaveBeenCalledWith([
      expect.objectContaining({ topicKey: "typescript" }),
    ]);
    await db.dismissResearchSuggestion("suggestion-1");
    await db.markResearchSuggestionStarted("suggestion-1", "report-1");
    expect(g.research.dismissSuggestion).toHaveBeenCalledWith("suggestion-1");
    expect(g.research.markSuggestionStarted).toHaveBeenCalledWith("suggestion-1", "report-1");

    g.embeddings.find
      .mockResolvedValueOnce({
        itemId: "item-1",
        embedding: [0.1, 0.2],
        model: "embed",
        createdAt: item.createdAt,
      })
      .mockResolvedValueOnce(undefined);
    g.embeddings.listRecent.mockResolvedValue([{ itemId: "item-1", embedding: [0.1, 0.2] }]);
    await expect(db.getItemEmbedding("item-1")).resolves.toEqual({
      item_id: "item-1",
      embedding: "[0.1,0.2]",
      model: "embed",
      created_at: item.createdAt,
    });
    await expect(db.getItemEmbedding("missing")).resolves.toBeUndefined();
    await db.upsertItemEmbedding("item-1", [0.3], "embed-v2");
    expect(g.embeddings.upsert).toHaveBeenCalledWith("item-1", [0.3], "embed-v2");
    await expect(db.getRecentEmbeddings()).resolves.toEqual([
      { item_id: "item-1", embedding: "[0.1,0.2]" },
    ]);
    expect(g.embeddings.listRecent).toHaveBeenCalledWith(30);
  });

  test("delegates the agent repository surface with defaults intact", async () => {
    const { database: db, groups: g } = await loadPostgres();
    const calls: Array<[() => Promise<unknown>, string, unknown[]]> = [
      [() => db.insertAuditLog({ id: "audit-1", action: "capture" } as never), "insertAuditLog", [{ id: "audit-1", action: "capture" }]],
      [() => db.getAuditLogs(), "listAuditLogs", [50]],
      [() => db.getDailyAuditStats(), "getDailyAuditStats", []],
      [() => db.insertWorkflowRun({ id: "workflow-1" } as never), "insertWorkflow", [{ id: "workflow-1" }]],
      [() => db.updateWorkflowRun("workflow-1", { status: "complete" } as never), "updateWorkflow", ["workflow-1", { status: "complete" }]],
      [() => db.getWorkflowRun("workflow-1"), "findWorkflow", ["workflow-1"]],
      [() => db.getWorkflowRuns(), "listWorkflows", [{}]],
      [() => db.insertAgentAction({ id: "action-1" } as never), "insertAction", [{ id: "action-1" }]],
      [() => db.getAgentActions(), "listActions", [{}]],
      [() => db.insertApproval({ id: "approval-1" } as never), "insertApproval", [{ id: "approval-1" }]],
      [() => db.getPendingApprovals(), "listPendingApprovals", [20]],
      [() => db.resolveApproval("approval-1", "approved"), "resolveApproval", ["approval-1", "approved"]],
      [() => db.insertChatConversation({ id: "conversation-1" } as never), "insertConversation", [{ id: "conversation-1" }]],
      [() => db.insertChatMessage({ id: "message-1" } as never), "insertMessage", [{ id: "message-1" }]],
      [() => db.getChatMessages("conversation-1"), "listMessages", ["conversation-1"]],
      [() => db.getChatConversations(), "listConversations", [20]],
    ];

    for (const [invoke, method, args] of calls) {
      g.agent[method].mockResolvedValue({ method });
      await expect(invoke()).resolves.toEqual({ method });
      expect(g.agent[method]).toHaveBeenCalledWith(...args);
    }
  });
});

describe("database facade fail-closed and legacy behavior", () => {
  test("requires DATABASE_URL for Phase 1 repository access", async () => {
    jest.resetModules();
    jest.doMock("@/lib/config", () => ({ config: { databaseUrl: "" } }));
    jest.doMock("@/lib/db", () => ({ getItems: jest.fn().mockReturnValue([]) }));
    const db = await import("@/lib/database");
    await expect(db.getRepositorySet()).rejects.toThrow(
      "DATABASE_URL is required for Phase 1 repositories"
    );
  });

  test("delegates to the legacy adapter outside production", async () => {
    jest.resetModules();
    const getItems = jest.fn().mockReturnValue([item]);
    const getItemById = jest.fn().mockReturnValue(item);
    jest.doMock("@/lib/config", () => ({ config: { databaseUrl: "" } }));
    jest.doMock("@/lib/db", () => ({ getItems, getItemById }));
    const db = await import("@/lib/database");

    await expect(db.getItems({ isRead: false })).resolves.toEqual([item]);
    await expect(db.getItemById("item-1")).resolves.toBe(item);
    expect(getItems).toHaveBeenCalledWith({ isRead: false });
    expect(getItemById).toHaveBeenCalledWith("item-1");
  });

  test("preserves the complete legacy adapter contract during local migration", async () => {
    const { database: db, legacy } = await loadLegacy();
    const delegates: Array<[() => Promise<unknown>, string, unknown[]]> = [
      [() => db.getItems(), "getItems", [{}]],
      [() => db.getItemById("item-1"), "getItemById", ["item-1"]],
      [() => db.getRejectedItems(), "getRejectedItems", [50, 0]],
      [() => db.getItemByNormalizedUrl(item.url), "getItemByNormalizedUrl", [item.url]],
      [() => db.insertItem(item), "insertItem", [item]],
      [() => db.updateItem("item-1", { isRead: true }), "updateItem", ["item-1", { isRead: true }]],
      [() => db.deleteItem("item-1"), "deleteItem", ["item-1"]],
      [() => db.getOAuthToken("slack", "team-1"), "getOAuthToken", ["slack", "team-1"]],
      [() => db.getOAuthTokensByProvider("slack"), "getOAuthTokensByProvider", ["slack"]],
      [() => db.upsertOAuthToken("slack", "team-1", { access_token: "token" }), "upsertOAuthToken", ["slack", "team-1", { access_token: "token" }]],
      [() => db.deleteOAuthToken("slack", "team-1"), "deleteOAuthToken", ["slack", "team-1"]],
      [() => db.getAISummary("item-1", "brief"), "getAISummary", ["item-1", "brief"]],
      [() => db.getAISummaries("item-1"), "getAISummaries", ["item-1"]],
      [() => db.upsertAISummary({ id: "s-1" } as never), "upsertAISummary", [{ id: "s-1" }]],
      [() => db.insertFeedback({ id: "f-1" } as never), "insertFeedback", [{ id: "f-1" }]],
      [() => db.getFeedback("item-1"), "getFeedback", ["item-1"]],
      [() => db.getAllFeedback(), "getAllFeedback", []],
      [() => db.insertResearchReport({ id: "r-1" } as never), "insertResearchReport", [{ id: "r-1" }]],
      [() => db.getResearchReport("r-1"), "getResearchReport", ["r-1"]],
      [() => db.updateResearchReport("r-1", { status: "done" }), "updateResearchReport", ["r-1", { status: "done" }]],
      [() => db.getResearchReports(), "getResearchReports", [20]],
      [() => db.getPendingResearchSuggestions(), "getPendingResearchSuggestions", []],
      [() => db.getResearchSuggestionById("sg-1"), "getResearchSuggestionById", ["sg-1"]],
      [() => db.replacePendingResearchSuggestions([]), "replacePendingResearchSuggestions", [[]]],
      [() => db.dismissResearchSuggestion("sg-1"), "dismissResearchSuggestion", ["sg-1"]],
      [() => db.markResearchSuggestionStarted("sg-1", "r-1"), "markResearchSuggestionStarted", ["sg-1", "r-1"]],
      [() => db.getUserSetting("key"), "getUserSetting", ["key"]],
      [() => db.setUserSetting("key", "value"), "setUserSetting", ["key", "value"]],
      [() => db.insertRawContent({ id: "raw-1" } as never), "insertRawContent", [{ id: "raw-1" }]],
      [() => db.updateRawContentItemId("raw-1", "item-1"), "updateRawContentItemId", ["raw-1", "item-1"]],
      [() => db.updateItemProcessingStatus("item-1", "ready"), "updateItemProcessingStatus", ["item-1", "ready", undefined]],
      [() => db.updateItemPriorityScore("item-1", 0.8, "high"), "updateItemPriorityScore", ["item-1", 0.8, "high"]],
      [() => db.insertNotification({ id: "n-1" } as never), "insertNotification", [{ id: "n-1" }]],
      [() => db.getNotifications(), "getNotifications", [20]],
      [() => db.getUnreadNotificationCount(), "getUnreadNotificationCount", []],
      [() => db.markNotificationRead("n-1"), "markNotificationRead", ["n-1"]],
      [() => db.markAllNotificationsRead(), "markAllNotificationsRead", []],
      [() => db.getItemEmbedding("item-1"), "getItemEmbedding", ["item-1"]],
      [() => db.upsertItemEmbedding("item-1", [0.1], "model"), "upsertItemEmbedding", ["item-1", [0.1], "model"]],
      [() => db.getRecentEmbeddings(), "getRecentEmbeddings", [30]],
      [() => db.insertAuditLog({ id: "a-1" } as never), "insertAuditLog", [{ id: "a-1" }]],
      [() => db.getAuditLogs(), "getAuditLogs", [50]],
      [() => db.getDailyAuditStats(), "getDailyAuditStats", []],
      [() => db.insertWorkflowRun({ id: "w-1" } as never), "insertWorkflowRun", [{ id: "w-1" }]],
      [() => db.updateWorkflowRun("w-1", {}), "updateWorkflowRun", ["w-1", {}]],
      [() => db.getWorkflowRun("w-1"), "getWorkflowRun", ["w-1"]],
      [() => db.getWorkflowRuns(), "getWorkflowRuns", [{}]],
      [() => db.insertAgentAction({ id: "aa-1" } as never), "insertAgentAction", [{ id: "aa-1" }]],
      [() => db.getAgentActions(), "getAgentActions", [{}]],
      [() => db.insertApproval({ id: "ap-1" } as never), "insertApproval", [{ id: "ap-1" }]],
      [() => db.getPendingApprovals(), "getPendingApprovals", [20]],
      [() => db.resolveApproval("ap-1", "rejected"), "resolveApproval", ["ap-1", "rejected"]],
      [() => db.insertChatConversation({ id: "c-1" } as never), "insertChatConversation", [{ id: "c-1" }]],
      [() => db.insertChatMessage({ id: "m-1" } as never), "insertChatMessage", [{ id: "m-1" }]],
      [() => db.getChatMessages("c-1"), "getChatMessages", ["c-1"]],
      [() => db.getChatConversations(), "getChatConversations", [20]],
      [() => db.enqueueJob({ id: "j-1" } as never), "enqueueJob", [{ id: "j-1" }]],
      [() => db.dequeueJob("worker"), "dequeueJob", ["worker"]],
      [() => db.completeJob("j-1"), "completeJob", ["j-1", undefined]],
      [() => db.getJobStats(), "getJobStats", []],
    ];

    for (const [invoke, method, args] of delegates) {
      await invoke();
      expect(legacy[method]).toHaveBeenCalledWith(...args);
    }
  });

  test("implements legacy summary deletion and publisher queue state transitions", async () => {
    const { database: db, prepare, run } = await loadLegacy();
    await db.deleteAISummaries("item-1");
    await db.enqueuePublisherUrl("publisher-1", item.url);
    await expect(db.listPendingPublisherUrls("publisher-1", 5)).resolves.toEqual([
      "https://example.com/queued",
    ]);
    await db.markPublisherUrlFetched("publisher-1", item.url);
    await db.markPublisherUrlFailed("publisher-1", item.url, "missing");
    await db.markPublisherUrlFailed("publisher-1", item.url, "retry");
    await db.markPublisherUrlFailed("publisher-1", item.url, "terminal");
    await expect(db.getPublisherQueueStats("publisher-1")).resolves.toEqual({
      pending: 2,
      fetched: 3,
      failed: 1,
    });

    expect(prepare).toHaveBeenCalledWith("DELETE FROM ai_summaries WHERE item_id = ?");
    expect(run).toHaveBeenCalledWith("item-1");
    expect(run).toHaveBeenCalledWith("pending", "retry", 2, "publisher-1", item.url);
    expect(run).toHaveBeenCalledWith("failed", "terminal", 3, "publisher-1", item.url);
  });

  test("refuses the SQLite fallback in production", async () => {
    jest.resetModules();
    const previous = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    jest.doMock("@/lib/config", () => ({ config: { databaseUrl: "" } }));
    jest.doMock("@/lib/db", () => ({ getItems: jest.fn() }));
    const db: DatabaseModule = await import("@/lib/database");
    try {
      await expect(db.getItems()).rejects.toThrow("DATABASE_URL is required in production");
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", { value: previous, configurable: true });
    }
  });
});
