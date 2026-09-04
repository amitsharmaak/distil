import {
  bigint,
  boolean,
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

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

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
  },
  (t) => [
    uniqueIndex("items_normalized_url_idx").on(t.normalizedUrl),
    index("items_created_idx").on(t.createdAt),
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
export const feedback = pgTable("feedback", {
  id: text().primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  rating: integer().notNull(),
  reason: text(),
  createdAt: time("created_at").notNull(),
});
export const researchReports = pgTable("research_reports", {
  id: text().primaryKey(),
  itemId: text("item_id"),
  query: text().notNull(),
  report: text().notNull().default(""),
  sources: text().notNull().default("[]"),
  model: text().notNull(),
  status: text().notNull().default("pending"),
  createdAt: time("created_at").notNull(),
  completedAt: time("completed_at"),
  progress: text(),
});
export const researchSuggestions = pgTable("research_suggestions", {
  id: text().primaryKey(),
  topicKey: text("topic_key").notNull(),
  topic: text().notNull(),
  reason: text().notNull().default(""),
  suggestedQuery: text("suggested_query").notNull(),
  sourceItemIds: jsonb("source_item_ids").$type<string[]>().notNull().default([]),
  status: text().notNull().default("pending"),
  researchReportId: text("research_report_id"),
  createdAt: time("created_at").notNull(),
});
export const userSettings = pgTable("user_settings", {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: time("updated_at").notNull(),
});
export const notifications = pgTable("notifications", {
  id: text().primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  title: text().notNull(),
  message: text().notNull().default(""),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: time("created_at").notNull(),
});
export const itemEmbeddings = pgTable("item_embeddings", {
  itemId: text("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  embedding: jsonb().$type<number[]>().notNull(),
  model: text().notNull(),
  createdAt: time("created_at").notNull(),
});
export const auditLog = pgTable("audit_log", {
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
});
export const workflowRuns = pgTable("workflow_runs", {
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
});
export const agentActions = pgTable("agent_actions", {
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
});
export const approvalQueue = pgTable("approval_queue", {
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
});
export const chatConversations = pgTable("chat_conversations", {
  id: text().primaryKey(),
  title: text(),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull(),
});
export const chatMessages = pgTable("chat_messages", {
  id: text().primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text().notNull(),
  content: text().notNull(),
  citations: jsonb(),
  toolCalls: jsonb("tool_calls"),
  createdAt: time("created_at").notNull(),
});
export const jobQueue = pgTable("job_queue", {
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
});
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
  (t) => [primaryKey({ columns: [t.publisherId, t.url] })]
);
export const rawContent = pgTable("raw_content", {
  id: text().primaryKey(),
  itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
  sourceType: text("source_type").notNull(),
  rawBody: text("raw_body").notNull(),
  metadata: jsonb().notNull().default({}),
  fetchedAt: time("fetched_at").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const captureRequests = pgTable("capture_requests", {
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
});
export const captureTokens = pgTable("capture_tokens", {
  id: text().primaryKey(),
  name: text().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  createdAt: time("created_at").notNull(),
  lastUsedAt: time("last_used_at"),
  revokedAt: time("revoked_at"),
});
export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    key: text().notNull(),
    windowStart: time("window_start").notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart, t.windowSeconds] })]
);
