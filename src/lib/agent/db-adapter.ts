/**
 * Database adapter interface — abstracts DB operations for future PostgreSQL migration.
 *
 * Currently wraps SQLite (better-sqlite3). When migrating to PostgreSQL:
 * 1. Create a new PostgresAdapter implementing this interface
 * 2. Swap the adapter in the factory function
 * 3. All consumers use the interface, not the concrete implementation
 *
 * SERVER-SIDE ONLY.
 */

import type { ContentItem } from "@/lib/types";
import type { ItemFilters } from "@/lib/db";
import * as db from "@/lib/db";

export interface DatabaseAdapter {
  // Items
  getItems(filters?: ItemFilters): ContentItem[];
  getItemById(id: string): ContentItem | undefined;
  insertItem(item: ContentItem): ContentItem;
  updateItem(id: string, patch: Partial<ContentItem>): ContentItem | undefined;
  deleteItem(id: string): boolean;

  // Search
  searchItems(
    query: string,
    filters?: Omit<ItemFilters, "query">,
  ): ContentItem[];

  // AI Summaries
  getAISummary(
    itemId: string,
    promptType?: "brief" | "detailed",
  ): { summary: string; model: string } | undefined;
  upsertAISummary(data: {
    id: string;
    itemId: string;
    summary: string;
    model: string;
    promptType: string;
  }): void;

  // Feedback
  insertFeedback(data: {
    id: string;
    itemId: string;
    rating: number;
    reason?: string;
  }): void;
  getAllFeedback(): Array<{
    item_id: string;
    rating: number;
    reason: string | null;
    created_at: string;
  }>;

  // Settings
  getUserSetting(key: string): string | undefined;
  setUserSetting(key: string, value: string): void;

  // Embeddings
  upsertItemEmbedding(itemId: string, embedding: number[], model: string): void;
  getRecentEmbeddings(
    daysBack?: number,
  ): Array<{ item_id: string; embedding: string }>;

  // Workflow runs
  insertWorkflowRun(data: {
    id: string;
    workflowType: string;
    itemId?: string;
    traceId?: string;
  }): void;
  updateWorkflowRun(id: string, patch: Record<string, unknown>): void;
  getWorkflowRuns(filters?: {
    status?: string;
    limit?: number;
  }): Array<Record<string, unknown>>;

  // Notifications
  insertNotification(data: {
    id: string;
    itemId: string;
    title: string;
    message: string;
  }): void;
  getNotifications(limit?: number): Array<Record<string, unknown>>;

  // Audit
  insertAuditLog(data: Record<string, unknown>): void;
  getDailyAuditStats(): {
    totalCost: number;
    totalCalls: number;
    totalTokens: number;
  };

  // Jobs
  enqueueJob(data: {
    id: string;
    jobType: string;
    payload?: string;
    priority?: number;
  }): void;
  dequeueJob(workerId: string): Record<string, unknown> | undefined;
  completeJob(id: string, error?: string): void;
}

/**
 * SQLite adapter — wraps the existing db.ts functions.
 * This is the current default adapter.
 */
export class SQLiteAdapter implements DatabaseAdapter {
  getItems(filters?: ItemFilters): ContentItem[] {
    return db.getItems(filters);
  }

  getItemById(id: string): ContentItem | undefined {
    return db.getItemById(id);
  }

  insertItem(item: ContentItem): ContentItem {
    return db.insertItem(item);
  }

  updateItem(id: string, patch: Partial<ContentItem>): ContentItem | undefined {
    return db.updateItem(id, patch);
  }

  deleteItem(id: string): boolean {
    return db.deleteItem(id);
  }

  searchItems(
    query: string,
    filters?: Omit<ItemFilters, "query">,
  ): ContentItem[] {
    return db.getItems({ ...filters, query });
  }

  getAISummary(
    itemId: string,
    promptType?: "brief" | "detailed",
  ): { summary: string; model: string } | undefined {
    const row = db.getAISummary(itemId, promptType);
    return row ? { summary: row.summary, model: row.model } : undefined;
  }

  upsertAISummary(data: {
    id: string;
    itemId: string;
    summary: string;
    model: string;
    promptType: string;
  }): void {
    db.upsertAISummary(data);
  }

  insertFeedback(data: {
    id: string;
    itemId: string;
    rating: number;
    reason?: string;
  }): void {
    db.insertFeedback(data);
  }

  getAllFeedback(): Array<{
    item_id: string;
    rating: number;
    reason: string | null;
    created_at: string;
  }> {
    return db.getAllFeedback().map((r) => ({
      item_id: r.item_id,
      rating: r.rating,
      reason: r.reason,
      created_at: r.created_at,
    }));
  }

  getUserSetting(key: string): string | undefined {
    return db.getUserSetting(key);
  }

  setUserSetting(key: string, value: string): void {
    db.setUserSetting(key, value);
  }

  upsertItemEmbedding(itemId: string, embedding: number[], model: string): void {
    db.upsertItemEmbedding(itemId, embedding, model);
  }

  getRecentEmbeddings(
    daysBack?: number,
  ): Array<{ item_id: string; embedding: string }> {
    return db.getRecentEmbeddings(daysBack);
  }

  insertWorkflowRun(data: {
    id: string;
    workflowType: string;
    itemId?: string;
    traceId?: string;
  }): void {
    db.insertWorkflowRun(data);
  }

  updateWorkflowRun(id: string, patch: Record<string, unknown>): void {
    db.updateWorkflowRun(id, {
      status: patch.status as string | undefined,
      currentStep: patch.currentStep as string | undefined,
      stepsJson: patch.stepsJson as string | undefined,
      error: patch.error as string | undefined,
      completedAt: patch.completedAt as string | undefined,
    });
  }

  getWorkflowRuns(filters?: {
    status?: string;
    limit?: number;
  }): Array<Record<string, unknown>> {
    return db.getWorkflowRuns(filters ?? {}) as Array<Record<string, unknown>>;
  }

  insertNotification(data: {
    id: string;
    itemId: string;
    title: string;
    message: string;
  }): void {
    db.insertNotification(data);
  }

  getNotifications(limit?: number): Array<Record<string, unknown>> {
    const rows = db.getNotifications(limit);
    return rows.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      title: r.title,
      message: r.message,
      isRead: r.isRead,
      createdAt: r.createdAt,
    }));
  }

  insertAuditLog(data: Record<string, unknown>): void {
    const d = data as {
      id: string;
      action: string;
      toolName?: string;
      inputHash?: string;
      outputHash?: string;
      model?: string;
      provider?: string;
      tokensIn?: number;
      tokensOut?: number;
      cost?: number;
      latencyMs?: number;
      traceId?: string;
    };
    db.insertAuditLog({
      id: d.id,
      action: d.action,
      toolName: d.toolName,
      inputHash: d.inputHash,
      outputHash: d.outputHash,
      model: d.model,
      provider: d.provider,
      tokensIn: d.tokensIn,
      tokensOut: d.tokensOut,
      cost: d.cost,
      latencyMs: d.latencyMs,
      traceId: d.traceId,
    });
  }

  getDailyAuditStats(): {
    totalCost: number;
    totalCalls: number;
    totalTokens: number;
  } {
    return db.getDailyAuditStats();
  }

  enqueueJob(data: {
    id: string;
    jobType: string;
    payload?: string;
    priority?: number;
  }): void {
    db.enqueueJob(data);
  }

  dequeueJob(workerId: string): Record<string, unknown> | undefined {
    return db.dequeueJob(workerId);
  }

  completeJob(id: string, error?: string): void {
    db.completeJob(id, error);
  }
}

let adapter: DatabaseAdapter = new SQLiteAdapter();

export function getDbAdapter(): DatabaseAdapter {
  return adapter;
}

export function setDbAdapter(newAdapter: DatabaseAdapter): void {
  adapter = newAdapter;
}
