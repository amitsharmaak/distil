import type { RepositorySet } from "@/lib/repositories/ports";
import type { ContentItem, Priority } from "@/lib/types";
import type * as Legacy from "@/lib/db";
import { config } from "@/lib/config";
import type { AuthContext } from "@/lib/contracts/tenant-context";

type LegacyModule = typeof import("@/lib/db");

let repositoriesPromise: Promise<RepositorySet> | undefined;
let legacyPromise: Promise<LegacyModule> | undefined;
let tenantAccessPromise:
  | Promise<import("@/lib/postgres/tenant-repositories").PostgresRepositoryAccess>
  | undefined;

function usesPostgres(): boolean {
  return Boolean(config.databaseUrl);
}

async function repositories(): Promise<RepositorySet> {
  if (!repositoriesPromise) {
    repositoriesPromise = Promise.all([
      import("@/lib/postgres/client"),
      import("@/lib/postgres/repositories"),
    ]).then(([client, adapters]) =>
      adapters.createPostgresRepositories(client.createPostgresClient({ url: config.databaseUrl }))
    );
  }
  return repositoriesPromise;
}

/** Repository composition root for new Phase 1 services. */
export async function getRepositorySet(): Promise<RepositorySet> {
  if (!usesPostgres()) {
    throw new Error("DATABASE_URL is required for Phase 1 repositories");
  }
  return repositories();
}

/** Phase 3 composition root. The returned methods never accept a user id. */
export async function getTenantRepositories(context: AuthContext): Promise<RepositorySet> {
  if (!usesPostgres()) throw new Error("DATABASE_URL is required for tenant repositories");
  tenantAccessPromise ??= Promise.all([
    import("@/lib/postgres/client"),
    import("@/lib/postgres/tenant-repositories"),
  ]).then(([client, access]) =>
    access.createPostgresRepositoryAccess(client.createPostgresClient({ url: config.databaseUrl }))
  );
  return (await tenantAccessPromise).getTenantRepositories(context);
}

async function legacy(): Promise<LegacyModule> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  legacyPromise ??= import("@/lib/db");
  return legacyPromise;
}

async function storage<T>(
  postgresCall: (value: RepositorySet) => Promise<T>,
  sqliteCall: (value: LegacyModule) => T | Promise<T>
): Promise<T> {
  return usesPostgres() ? postgresCall(await repositories()) : sqliteCall(await legacy());
}

export type ItemFilters = Legacy.ItemFilters;
export type OAuthTokenRow = Legacy.OAuthTokenRow;
export type AISummaryRow = Legacy.AISummaryRow;
export type FeedbackRow = Legacy.FeedbackRow;
export type ResearchReportRow = Legacy.ResearchReportRow;
export type ResearchSuggestionRow = Legacy.ResearchSuggestionRow;

export async function getItems(filters: ItemFilters = {}): Promise<ContentItem[]> {
  return storage(
    (r) => r.items.list(filters),
    (s) => s.getItems(filters)
  );
}

export async function getItemById(id: string): Promise<ContentItem | undefined> {
  return storage(
    (r) => r.items.findById(id),
    (s) => s.getItemById(id)
  );
}

export async function getRejectedItems(limit = 50, offset = 0) {
  return storage(
    (r) => r.items.listRejected(limit, offset),
    (s) => s.getRejectedItems(limit, offset)
  );
}

export async function getItemByNormalizedUrl(url: string) {
  return storage(
    (r) => r.items.findByNormalizedUrl(url),
    (s) => s.getItemByNormalizedUrl(url)
  );
}

export async function insertItem(item: ContentItem) {
  return storage(
    (r) => r.items.insert(item),
    (s) => s.insertItem(item)
  );
}

export async function updateItem(id: string, patch: Partial<ContentItem>) {
  return storage(
    (r) => r.items.update(id, patch),
    (s) => s.updateItem(id, patch)
  );
}

export async function deleteItem(id: string) {
  return storage(
    (r) => r.items.delete(id),
    (s) => s.deleteItem(id)
  );
}

function oauthRow(record: Awaited<ReturnType<RepositorySet["oauthTokens"]["find"]>>) {
  if (!record) return undefined;
  return {
    provider: record.provider,
    team_id: record.teamId,
    access_token: record.accessToken,
    refresh_token: record.refreshToken ?? null,
    expiry_date: record.expiryDate ?? null,
    email: record.email ?? null,
    updated_at: record.updatedAt,
  } satisfies OAuthTokenRow;
}

export async function getOAuthToken(provider: string, teamId?: string) {
  return storage(
    async (r) => oauthRow(await r.oauthTokens.find(provider, teamId)),
    (s) => s.getOAuthToken(provider, teamId)
  );
}

export async function getOAuthTokensByProvider(provider: string) {
  return storage(
    async (r) => (await r.oauthTokens.listByProvider(provider)).map((record) => oauthRow(record)!),
    (s) => s.getOAuthTokensByProvider(provider)
  );
}

export async function upsertOAuthToken(
  provider: string,
  teamId: string,
  data: Parameters<LegacyModule["upsertOAuthToken"]>[2]
) {
  return storage(
    (r) =>
      r.oauthTokens.upsert({
        provider,
        teamId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? undefined,
        expiryDate: data.expiry_date ?? undefined,
        email: data.email ?? undefined,
        updatedAt: new Date().toISOString(),
      }),
    (s) => s.upsertOAuthToken(provider, teamId, data)
  );
}

export async function deleteOAuthToken(provider: string, teamId?: string) {
  return storage(
    (r) => r.oauthTokens.delete(provider, teamId),
    (s) => s.deleteOAuthToken(provider, teamId)
  );
}

function summaryRow(record: Awaited<ReturnType<RepositorySet["summaries"]["find"]>>) {
  if (!record) return undefined;
  return {
    id: record.id,
    item_id: record.itemId,
    summary: record.summary,
    model: record.model,
    prompt_type: record.promptType,
    created_at: record.createdAt,
  } satisfies AISummaryRow;
}

export async function getAISummary(itemId: string, promptType?: "brief" | "detailed") {
  return storage(
    async (r) => summaryRow(await r.summaries.find(itemId, promptType)),
    (s) => s.getAISummary(itemId, promptType)
  );
}

export async function getAISummaries(itemId: string) {
  return storage(
    (r) => r.summaries.findAll(itemId),
    (s) => s.getAISummaries(itemId)
  );
}

export async function upsertAISummary(data: Parameters<LegacyModule["upsertAISummary"]>[0]) {
  return storage(
    async (r) =>
      summaryRow(
        await r.summaries.upsert({
          id: data.id,
          itemId: data.itemId,
          summary: data.summary,
          model: data.model,
          promptType: data.promptType,
        })
      )!,
    (s) => s.upsertAISummary(data)
  );
}

export async function deleteAISummaries(itemId: string) {
  return storage(
    (r) => r.summaries.deleteForItem(itemId),
    (s) => {
      s.db.prepare("DELETE FROM ai_summaries WHERE item_id = ?").run(itemId);
    }
  );
}

function feedbackRow(record: Awaited<ReturnType<RepositorySet["feedback"]["findForItem"]>>) {
  if (!record) return undefined;
  return {
    id: record.id,
    item_id: record.itemId,
    rating: record.rating,
    reason: record.reason ?? null,
    created_at: record.createdAt,
  } satisfies FeedbackRow;
}

export async function insertFeedback(data: Parameters<LegacyModule["insertFeedback"]>[0]) {
  return storage(
    async (r) => feedbackRow(await r.feedback.insert(data))!,
    (s) => s.insertFeedback(data)
  );
}

export async function getFeedback(itemId: string) {
  return storage(
    async (r) => feedbackRow(await r.feedback.findForItem(itemId)),
    (s) => s.getFeedback(itemId)
  );
}

export async function getAllFeedback() {
  return storage(
    async (r) => (await r.feedback.list()).map((record) => feedbackRow(record)!),
    (s) => s.getAllFeedback()
  );
}

function reportRow(record: Awaited<ReturnType<RepositorySet["research"]["findReport"]>>) {
  if (!record) return undefined;
  return {
    id: record.id,
    item_id: record.itemId ?? null,
    query: record.query,
    report: record.report,
    sources: record.sources,
    model: record.model,
    status: record.status,
    created_at: record.createdAt,
    completed_at: record.completedAt ?? null,
    progress: record.progress ?? null,
  } satisfies ResearchReportRow;
}

export async function insertResearchReport(
  data: Parameters<LegacyModule["insertResearchReport"]>[0]
) {
  return storage(
    async (r) => reportRow(await r.research.insertReport(data))!,
    (s) => s.insertResearchReport(data)
  );
}

export async function getResearchReport(id: string) {
  return storage(
    async (r) => reportRow(await r.research.findReport(id)),
    (s) => s.getResearchReport(id)
  );
}

export async function updateResearchReport(
  id: string,
  patch: Parameters<LegacyModule["updateResearchReport"]>[1]
) {
  return storage(
    async (r) => reportRow(await r.research.updateReport(id, patch)),
    (s) => s.updateResearchReport(id, patch)
  );
}

export async function getResearchReports(limit = 20) {
  return storage(
    async (r) => (await r.research.listReports(limit)).map((record) => reportRow(record)!),
    (s) => s.getResearchReports(limit)
  );
}

function suggestionRow(record: Awaited<ReturnType<RepositorySet["research"]["findSuggestion"]>>) {
  if (!record) return undefined;
  return {
    id: record.id,
    topic_key: record.topicKey,
    topic: record.topic,
    reason: record.reason,
    suggested_query: record.suggestedQuery,
    source_item_ids: JSON.stringify(record.sourceItemIds),
    status: record.status,
    research_report_id: record.researchReportId ?? null,
    created_at: record.createdAt,
  } satisfies ResearchSuggestionRow;
}

export async function getPendingResearchSuggestions() {
  return storage(
    async (r) =>
      (await r.research.listPendingSuggestions()).map((record) => suggestionRow(record)!),
    (s) => s.getPendingResearchSuggestions()
  );
}

export async function getResearchSuggestionById(id: string) {
  return storage(
    async (r) => suggestionRow(await r.research.findSuggestion(id)),
    (s) => s.getResearchSuggestionById(id)
  );
}

export async function replacePendingResearchSuggestions(
  suggestions: Parameters<LegacyModule["replacePendingResearchSuggestions"]>[0]
) {
  return storage(
    (r) =>
      r.research.replacePendingSuggestions(
        suggestions.map((value) => ({
          id: value.id,
          topicKey: value.topicKey,
          topic: value.topic,
          reason: value.reason,
          suggestedQuery: value.suggestedQuery,
          sourceItemIds: value.sourceItemIds,
        }))
      ),
    (s) => s.replacePendingResearchSuggestions(suggestions)
  );
}

export async function dismissResearchSuggestion(id: string) {
  return storage(
    (r) => r.research.dismissSuggestion(id),
    (s) => s.dismissResearchSuggestion(id)
  );
}

export async function markResearchSuggestionStarted(id: string, reportId: string) {
  return storage(
    (r) => r.research.markSuggestionStarted(id, reportId),
    (s) => s.markResearchSuggestionStarted(id, reportId)
  );
}

export async function getUserSetting(key: string) {
  return storage(
    (r) => r.settings.get(key),
    (s) => s.getUserSetting(key)
  );
}

export async function setUserSetting(key: string, value: string) {
  return storage(
    (r) => r.settings.set(key, value),
    (s) => s.setUserSetting(key, value)
  );
}

export async function insertRawContent(data: Parameters<LegacyModule["insertRawContent"]>[0]) {
  return storage(
    (r) => r.rawContent.insert(data),
    (s) => s.insertRawContent(data)
  );
}

export async function updateRawContentItemId(rawId: string, itemId: string) {
  return storage(
    (r) => r.rawContent.attachItem(rawId, itemId),
    (s) => s.updateRawContentItemId(rawId, itemId)
  );
}

export async function updateItemProcessingStatus(
  id: string,
  status: "processing" | "ready" | "rejected",
  rejectionReason?: string
) {
  return storage(
    (r) => r.items.updateProcessingStatus(id, status, rejectionReason),
    (s) => s.updateItemProcessingStatus(id, status, rejectionReason)
  );
}

export async function updateItemPriorityScore(id: string, score: number, priority: Priority) {
  return storage(
    (r) => r.items.updatePriorityScore(id, score, priority),
    (s) => s.updateItemPriorityScore(id, score, priority)
  );
}

export async function insertNotification(data: Parameters<LegacyModule["insertNotification"]>[0]) {
  return storage(
    (r) => r.notifications.insert(data),
    (s) => s.insertNotification(data)
  );
}

export async function getNotifications(limit = 20) {
  return storage(
    (r) => r.notifications.list(limit),
    (s) => s.getNotifications(limit)
  );
}

export async function getUnreadNotificationCount() {
  return storage(
    (r) => r.notifications.unreadCount(),
    (s) => s.getUnreadNotificationCount()
  );
}

export async function markNotificationRead(id: string) {
  return storage(
    (r) => r.notifications.markRead(id),
    (s) => s.markNotificationRead(id)
  );
}

export async function markAllNotificationsRead() {
  return storage(
    (r) => r.notifications.markAllRead(),
    (s) => s.markAllNotificationsRead()
  );
}

export async function getItemEmbedding(itemId: string) {
  return storage(
    async (r) => {
      const value = await r.embeddings.find(itemId);
      return value
        ? {
            item_id: value.itemId,
            embedding: JSON.stringify(value.embedding),
            model: value.model,
            created_at: value.createdAt,
          }
        : undefined;
    },
    (s) => s.getItemEmbedding(itemId)
  );
}

export async function upsertItemEmbedding(itemId: string, embedding: number[], model: string) {
  return storage(
    (r) => r.embeddings.upsert(itemId, embedding, model),
    (s) => s.upsertItemEmbedding(itemId, embedding, model)
  );
}

export async function getRecentEmbeddings(daysBack = 30) {
  return storage(
    async (r) =>
      (await r.embeddings.listRecent(daysBack)).map((value) => ({
        item_id: value.itemId,
        embedding: JSON.stringify(value.embedding),
      })),
    (s) => s.getRecentEmbeddings(daysBack)
  );
}

export async function insertAuditLog(data: Parameters<LegacyModule["insertAuditLog"]>[0]) {
  return storage(
    (r) => r.agent.insertAuditLog(data),
    (s) => s.insertAuditLog(data)
  );
}

export async function getAuditLogs(limit = 50) {
  return storage(
    (r) => r.agent.listAuditLogs(limit),
    (s) => s.getAuditLogs(limit)
  );
}

export async function getDailyAuditStats() {
  return storage(
    (r) => r.agent.getDailyAuditStats(),
    (s) => s.getDailyAuditStats()
  );
}

export async function insertWorkflowRun(data: Parameters<LegacyModule["insertWorkflowRun"]>[0]) {
  return storage(
    (r) => r.agent.insertWorkflow(data),
    (s) => s.insertWorkflowRun(data)
  );
}

export async function updateWorkflowRun(
  id: string,
  patch: Parameters<LegacyModule["updateWorkflowRun"]>[1]
) {
  return storage(
    (r) => r.agent.updateWorkflow(id, patch),
    (s) => s.updateWorkflowRun(id, patch)
  );
}

export async function getWorkflowRun(id: string) {
  return storage(
    (r) => r.agent.findWorkflow(id),
    (s) => s.getWorkflowRun(id)
  );
}

export async function getWorkflowRuns(
  filters: Parameters<LegacyModule["getWorkflowRuns"]>[0] = {}
) {
  return storage(
    (r) => r.agent.listWorkflows(filters),
    (s) => s.getWorkflowRuns(filters)
  );
}

export async function insertAgentAction(data: Parameters<LegacyModule["insertAgentAction"]>[0]) {
  return storage(
    (r) => r.agent.insertAction(data),
    (s) => s.insertAgentAction(data)
  );
}

export async function getAgentActions(
  filters: Parameters<LegacyModule["getAgentActions"]>[0] = {}
) {
  return storage(
    (r) => r.agent.listActions(filters),
    (s) => s.getAgentActions(filters)
  );
}

export async function insertApproval(data: Parameters<LegacyModule["insertApproval"]>[0]) {
  return storage(
    (r) => r.agent.insertApproval(data),
    (s) => s.insertApproval(data)
  );
}

export async function getPendingApprovals(limit = 20) {
  return storage(
    (r) => r.agent.listPendingApprovals(limit),
    (s) => s.getPendingApprovals(limit)
  );
}

export async function resolveApproval(id: string, status: "approved" | "rejected") {
  return storage(
    (r) => r.agent.resolveApproval(id, status),
    (s) => s.resolveApproval(id, status)
  );
}

export async function insertChatConversation(
  data: Parameters<LegacyModule["insertChatConversation"]>[0]
) {
  return storage(
    (r) => r.agent.insertConversation(data),
    (s) => s.insertChatConversation(data)
  );
}

export async function insertChatMessage(data: Parameters<LegacyModule["insertChatMessage"]>[0]) {
  return storage(
    (r) => r.agent.insertMessage(data),
    (s) => s.insertChatMessage(data)
  );
}

export async function getChatMessages(conversationId: string) {
  return storage(
    (r) => r.agent.listMessages(conversationId),
    (s) => s.getChatMessages(conversationId)
  );
}

export async function getChatConversations(limit = 20) {
  return storage(
    (r) => r.agent.listConversations(limit),
    (s) => s.getChatConversations(limit)
  );
}

export async function enqueueJob(data: Parameters<LegacyModule["enqueueJob"]>[0]) {
  return storage(
    (r) => r.jobs.enqueue(data),
    (s) => s.enqueueJob(data)
  );
}

export async function dequeueJob(workerId: string) {
  return storage(
    (r) => r.jobs.dequeue(workerId),
    (s) => s.dequeueJob(workerId)
  );
}

export async function completeJob(id: string, error?: string) {
  return storage(
    (r) => r.jobs.complete(id, error),
    (s) => s.completeJob(id, error)
  );
}

export async function getJobStats() {
  return storage(
    (r) => r.jobs.getStats(),
    (s) => s.getJobStats()
  );
}

export async function enqueuePublisherUrl(publisherId: string, url: string) {
  return storage(
    (r) => r.publisherQueue.enqueue(publisherId, url),
    async (s) => {
      s.db
        .prepare(
          "INSERT OR IGNORE INTO publisher_queue (publisher_id, url, discovered_at) VALUES (?, ?, ?)"
        )
        .run(publisherId, url, new Date().toISOString());
    }
  );
}

export async function listPendingPublisherUrls(publisherId: string, limit: number) {
  return storage(
    async (r) => (await r.publisherQueue.listPending(publisherId, limit)).map((entry) => entry.url),
    async (s) =>
      (
        s.db
          .prepare(
            "SELECT url FROM publisher_queue WHERE publisher_id = ? AND status = 'pending' ORDER BY discovered_at ASC LIMIT ?"
          )
          .all(publisherId, limit) as Array<{ url: string }>
      ).map((entry) => entry.url)
  );
}

export async function markPublisherUrlFetched(publisherId: string, url: string) {
  return storage(
    (r) => r.publisherQueue.markFetched(publisherId, url),
    async (s) => {
      s.db
        .prepare("UPDATE publisher_queue SET status = 'fetched' WHERE publisher_id = ? AND url = ?")
        .run(publisherId, url);
    }
  );
}

export async function markPublisherUrlFailed(publisherId: string, url: string, error: string) {
  return storage(
    (r) => r.publisherQueue.markFailed(publisherId, url, error),
    async (s) => {
      const row = s.db
        .prepare("SELECT attempts FROM publisher_queue WHERE publisher_id = ? AND url = ?")
        .get(publisherId, url) as { attempts: number } | undefined;
      if (!row) return;
      const attempts = row.attempts + 1;
      s.db
        .prepare(
          "UPDATE publisher_queue SET status = ?, last_error = ?, attempts = ? WHERE publisher_id = ? AND url = ?"
        )
        .run(attempts >= 3 ? "failed" : "pending", error, attempts, publisherId, url);
    }
  );
}

export async function getPublisherQueueStats(publisherId: string) {
  return storage(
    (r) => r.publisherQueue.getStats(publisherId),
    async (s) => {
      const rows = s.db
        .prepare(
          "SELECT status, COUNT(*) as count FROM publisher_queue WHERE publisher_id = ? GROUP BY status"
        )
        .all(publisherId) as Array<{ status: "pending" | "fetched" | "failed"; count: number }>;
      const stats = { pending: 0, fetched: 0, failed: 0 };
      for (const row of rows) stats[row.status] = row.count;
      return stats;
    }
  );
}
