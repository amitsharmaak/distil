import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const items = pgTable(
  "items",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    summary: text().notNull().default(""),
    fullContent: text("full_content"),
    sourceType: text("source_type").notNull(),
    contentType: text("content_type").notNull().default("article"),
    topics: jsonb().$type<string[]>().notNull().default([]),
    author: text(),
    publication: text(),
    url: text().notNull(),
    normalizedUrl: text("normalized_url"),
    priority: text().notNull().default("medium"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: time("created_at").notNull(),
    duration: text(),
    thumbnailUrl: text("thumbnail_url"),
    aiPriorityScore: doublePrecision("ai_priority_score"),
    extractedLinks: jsonb("extracted_links"),
    contentExtractedAt: time("content_extracted_at"),
    processingStatus: text("processing_status").notNull().default("ready"),
    rejectionReason: text("rejection_reason"),
    contentClassification: jsonb("content_classification"),
    detectedMedia: jsonb("detected_media"),
    informationDensity: doublePrecision("information_density"),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')) || jsonb_to_tsvector('english', topics, '["string"]')`
    ),
  },
  (t) => [
    uniqueIndex("items_normalized_url_idx").on(t.normalizedUrl),
    index("items_created_idx").on(t.createdAt.desc()),
    index("items_priority_idx").on(t.priority),
    index("items_source_idx").on(t.sourceType),
    index("items_is_read_idx").on(t.isRead),
    index("items_search_idx").using("gin", t.searchVector),
    check("items_priority_check", sql`${t.priority} in ('high', 'medium', 'low')`),
    check(
      "items_processing_check",
      sql`${t.processingStatus} in ('processing', 'ready', 'rejected')`
    ),
    check("items_topics_array_check", sql`jsonb_typeof(${t.topics}) = 'array'`),
  ]
);

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    provider: text().notNull(),
    teamId: text("team_id").notNull().default(""),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiryDate: bigint("expiry_date", { mode: "number" }),
    email: text(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.teamId] })]
);
export const aiSummaries = pgTable(
  "ai_summaries",
  {
    id: text().primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    summary: text().notNull(),
    model: text().notNull(),
    promptType: text("prompt_type").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (t) => [uniqueIndex("ai_summaries_item_prompt_idx").on(t.itemId, t.promptType)]
);
export const feedback = pgTable(
  "feedback",
  {
    id: text().primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    rating: integer().notNull(),
    reason: text(),
    createdAt: time("created_at").notNull(),
  },
  (t) => [
    index("feedback_item_idx").on(t.itemId),
    index("feedback_created_idx").on(t.createdAt.desc()),
    check("feedback_rating_check", sql`${t.rating} in (-1, 1)`),
  ]
);
export const researchReports = pgTable(
  "research_reports",
  {
    id: text().primaryKey(),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    query: text().notNull(),
    report: text().notNull().default(""),
    sources: text().notNull().default("[]"),
    model: text().notNull(),
    status: text().notNull().default("pending"),
    createdAt: time("created_at").notNull(),
    completedAt: time("completed_at"),
    progress: text(),
  },
  (t) => [index("research_reports_item_idx").on(t.itemId)]
);
export const researchSuggestions = pgTable(
  "research_suggestions",
  {
    id: text().primaryKey(),
    topicKey: text("topic_key").notNull(),
    topic: text().notNull(),
    reason: text().notNull().default(""),
    suggestedQuery: text("suggested_query").notNull(),
    sourceItemIds: jsonb("source_item_ids").$type<string[]>().notNull().default([]),
    status: text().notNull().default("pending"),
    researchReportId: text("research_report_id").references(() => researchReports.id, {
      onDelete: "set null",
    }),
    createdAt: time("created_at").notNull(),
  },
  (t) => [
    index("research_suggestions_status_idx").on(t.status),
    check("research_source_items_array_check", sql`jsonb_typeof(${t.sourceItemIds}) = 'array'`),
  ]
);
export const userSettings = pgTable("user_settings", {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: time("updated_at").notNull(),
});
export const notifications = pgTable(
  "notifications",
  {
    id: text().primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    title: text().notNull(),
    message: text().notNull().default(""),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: time("created_at").notNull(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt.desc())]
);
export const itemEmbeddings = pgTable(
  "item_embeddings",
  {
    itemId: text("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    embedding: jsonb().$type<number[]>().notNull(),
    model: text().notNull(),
    createdAt: time("created_at").notNull(),
  },
  (t) => [check("item_embeddings_array_check", sql`jsonb_typeof(${t.embedding}) = 'array'`)]
);
export const auditLog = pgTable(
  "audit_log",
  {
    id: text().primaryKey(),
    action: text().notNull(),
    toolName: text("tool_name"),
    inputHash: text("input_hash"),
    outputHash: text("output_hash"),
    model: text(),
    provider: text(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    cost: doublePrecision(),
    latencyMs: integer("latency_ms"),
    traceId: text("trace_id"),
    createdAt: time("created_at").notNull(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt.desc()),
    index("audit_log_trace_idx").on(t.traceId),
  ]
);
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text().primaryKey(),
    workflowType: text("workflow_type").notNull(),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    status: text().notNull().default("pending"),
    currentStep: text("current_step"),
    stepsJson: jsonb("steps_json").notNull().default([]),
    error: text(),
    traceId: text("trace_id"),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
    completedAt: time("completed_at"),
  },
  (t) => [
    index("workflow_runs_status_idx").on(t.status),
    index("workflow_runs_item_idx").on(t.itemId),
    index("workflow_runs_created_idx").on(t.createdAt.desc()),
    check("workflow_steps_array_check", sql`jsonb_typeof(${t.stepsJson}) = 'array'`),
  ]
);
export const agentActions = pgTable(
  "agent_actions",
  {
    id: text().primaryKey(),
    workflowId: text("workflow_id").references(() => workflowRuns.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    toolName: text("tool_name"),
    input: text(),
    output: text(),
    reasoning: text(),
    status: text().notNull().default("completed"),
    traceId: text("trace_id"),
    createdAt: time("created_at").notNull(),
  },
  (t) => [
    index("agent_actions_workflow_idx").on(t.workflowId),
    index("agent_actions_created_idx").on(t.createdAt.desc()),
  ]
);
export const approvalQueue = pgTable(
  "approval_queue",
  {
    id: text().primaryKey(),
    workflowId: text("workflow_id").references(() => workflowRuns.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    description: text().notNull(),
    payload: jsonb().notNull().default({}),
    status: text().notNull().default("pending"),
    decidedAt: time("decided_at"),
    decidedBy: text("decided_by"),
    traceId: text("trace_id"),
    createdAt: time("created_at").notNull(),
  },
  (t) => [
    index("approval_queue_status_idx").on(t.status),
    index("approval_queue_created_idx").on(t.createdAt.desc()),
    check("approval_payload_object_check", sql`jsonb_typeof(${t.payload}) = 'object'`),
  ]
);
export const chatConversations = pgTable("chat_conversations", {
  id: text().primaryKey(),
  title: text(),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull(),
});
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text().primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: text().notNull(),
    content: text().notNull(),
    citations: jsonb(),
    toolCalls: jsonb("tool_calls"),
    createdAt: time("created_at").notNull(),
  },
  (t) => [index("chat_messages_conversation_idx").on(t.conversationId, t.createdAt)]
);
export const jobQueue = pgTable(
  "job_queue",
  {
    id: text().primaryKey(),
    jobType: text("job_type").notNull(),
    payload: jsonb().notNull().default({}),
    status: text().notNull().default("pending"),
    priority: integer().notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    attempts: integer().notNull().default(0),
    lastError: text("last_error"),
    lockedAt: time("locked_at"),
    lockedBy: text("locked_by"),
    runAfter: time("run_after"),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
    completedAt: time("completed_at"),
  },
  (t) => [
    index("job_queue_status_idx").on(t.status, t.priority.desc(), t.createdAt),
    index("job_queue_type_idx").on(t.jobType),
    check("job_payload_object_check", sql`jsonb_typeof(${t.payload}) = 'object'`),
    check("job_attempts_check", sql`${t.attempts} >= 0 and ${t.maxRetries} >= 0`),
  ]
);
export const publisherQueue = pgTable(
  "publisher_queue",
  {
    publisherId: text("publisher_id").notNull(),
    url: text().notNull(),
    discoveredAt: time("discovered_at").notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [
    primaryKey({ columns: [t.publisherId, t.url] }),
    index("publisher_queue_status_idx").on(t.publisherId, t.status),
  ]
);
export const rawContent = pgTable(
  "raw_content",
  {
    id: text().primaryKey(),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    sourceType: text("source_type").notNull(),
    rawBody: text("raw_body").notNull(),
    metadata: jsonb().notNull().default({}),
    fetchedAt: time("fetched_at").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("raw_content_item_idx").on(t.itemId),
    check("raw_content_metadata_object_check", sql`jsonb_typeof(${t.metadata}) = 'object'`),
  ]
);
export const captureRequests = pgTable(
  "capture_requests",
  {
    id: text().primaryKey(),
    url: text().notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    title: text(),
    notes: text(),
    topics: jsonb().$type<string[]>().notNull().default([]),
    priority: text().notNull().default("medium"),
    source: text().notNull(),
    status: text().notNull().default("queued"),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    retryable: boolean().notNull().default(false),
    attempts: integer().notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("capture_active_url_idx")
      .on(t.normalizedUrl)
      .where(sql`${t.status} in ('queued', 'processing', 'ready')`),
    index("capture_created_idx").on(t.createdAt.desc()),
    check("capture_priority_check", sql`${t.priority} in ('high', 'medium', 'low')`),
    check("capture_source_check", sql`${t.source} in ('web', 'ios-shortcut', 'browser-extension')`),
    check(
      "capture_status_check",
      sql`${t.status} in ('queued', 'processing', 'ready', 'rejected', 'failed')`
    ),
    check("capture_attempts_check", sql`${t.attempts} >= 0`),
    check("capture_topics_array_check", sql`jsonb_typeof(${t.topics}) = 'array'`),
  ]
);
export const captureTokens = pgTable(
  "capture_tokens",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    createdAt: time("created_at").notNull(),
    lastUsedAt: time("last_used_at"),
    revokedAt: time("revoked_at"),
  },
  (t) => [
    uniqueIndex("capture_tokens_active_hash_idx")
      .on(t.tokenHash)
      .where(sql`${t.revokedAt} is null`),
  ]
);
export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    key: text().notNull(),
    windowStart: time("window_start").notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart, t.windowSeconds] }),
    index("rate_limit_expiry_idx").on(t.windowStart),
    check("rate_limit_window_seconds_check", sql`${t.windowSeconds} > 0`),
    check("rate_limit_count_check", sql`${t.count} >= 0`),
  ]
);
