import {
  bigint,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey(),
    primaryEmail: text("primary_email"),
    displayName: text("display_name"),
    status: text().notNull().default("migration_pending"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    deletedAt: time("deleted_at"),
  },
  (t) => [
    check(
      "users_status_check",
      sql`${t.status} in ('migration_pending','active','suspended','deleting','deleted')`
    ),
  ]
);

const tenantOwner = () =>
  uuid("user_id")
    .notNull()
    .default(sql`distil_current_user_id()`)
    .references(() => users.id, { onDelete: "cascade" });

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid().primaryKey(),
    userId: tenantOwner(),
    provider: text().notNull(),
    providerSubject: text("provider_subject").notNull(),
    email: text(),
    emailVerified: boolean("email_verified").notNull().default(false),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_identities_provider_subject_idx").on(t.provider, t.providerSubject),
    uniqueIndex("auth_identities_user_id_idx").on(t.userId, t.id),
  ]
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid().primaryKey(),
    normalizedEmail: text("normalized_email").notNull(),
    emailHash: text("email_hash").notNull(),
    tokenSalt: text("token_salt").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    issuedByActorId: uuid("issued_by_actor_id").notNull(),
    issuanceReason: text("issuance_reason").notNull(),
    status: text().notNull().default("pending"),
    expiresAt: time("expires_at").notNull(),
    consumedByUserId: uuid("consumed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    consumedAt: time("consumed_at"),
    revokedByActorId: uuid("revoked_by_actor_id"),
    revokeReason: text("revoke_reason"),
    revokedAt: time("revoked_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "invitations_status_check",
      sql`${t.status} in ('pending','accepted','revoked','expired')`
    ),
    check(
      "invitations_acceptance_check",
      sql`${t.status} <> 'accepted' or (${t.consumedByUserId} is not null and ${t.consumedAt} is not null)`
    ),
    check(
      "invitations_revocation_check",
      sql`${t.status} <> 'revoked' or (${t.revokedByActorId} is not null and ${t.revokeReason} is not null and ${t.revokedAt} is not null)`
    ),
  ]
);

export const sessionMetadata = pgTable(
  "session_metadata",
  {
    id: uuid().primaryKey(),
    userId: tenantOwner(),
    sessionHash: text("session_hash").notNull().unique(),
    deviceLabel: text("device_label"),
    lastUsedAt: time("last_used_at"),
    expiresAt: time("expires_at").notNull(),
    revokedAt: time("revoked_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("session_metadata_user_id_idx").on(t.userId, t.id)]
);

export const accountExports = pgTable(
  "account_exports",
  {
    id: uuid().primaryKey(),
    userId: tenantOwner(),
    status: text().notNull().default("pending"),
    objectRef: text("object_ref"),
    contentHash: text("content_hash"),
    requestedAt: time("requested_at").notNull().defaultNow(),
    completedAt: time("completed_at"),
    expiresAt: time("expires_at"),
  },
  (t) => [
    uniqueIndex("account_exports_user_id_idx").on(t.userId, t.id),
    check(
      "account_exports_status_check",
      sql`${t.status} in ('pending','running','ready','failed','expired')`
    ),
  ]
);

export const accountDeletions = pgTable(
  "account_deletions",
  {
    id: uuid().primaryKey(),
    userId: tenantOwner(),
    status: text().notNull().default("requested"),
    checkpoint: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    requestedAt: time("requested_at").notNull().defaultNow(),
    completedAt: time("completed_at"),
  },
  (t) => [
    uniqueIndex("account_deletions_user_id_idx").on(t.userId, t.id),
    check(
      "account_deletions_status_check",
      sql`${t.status} in ('requested','draining','deleting','completed','failed')`
    ),
    check("account_deletions_checkpoint_check", sql`jsonb_typeof(${t.checkpoint}) = 'object'`),
  ]
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: tenantOwner(),
    billingDate: date("billing_date", { mode: "string" }).notNull(),
    operation: text().notNull(),
    provider: text().notNull().default(""),
    requestCount: integer("request_count").notNull().default(0),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    costMicrousd: bigint("cost_microusd", { mode: "number" }).notNull().default(0),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.billingDate, t.operation, t.provider] }),
    check(
      "usage_counters_nonnegative_check",
      sql`${t.requestCount} >= 0 and ${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.costMicrousd} >= 0`
    ),
  ]
);

export const userEntitlements = pgTable(
  "user_entitlements",
  {
    userId: tenantOwner(),
    entitlement: text().notNull(),
    enabled: boolean().notNull().default(true),
    source: text().notNull().default("system"),
    expiresAt: time("expires_at"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entitlement] })]
);

export const items = pgTable(
  "items",
  {
    userId: tenantOwner(),
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
    archivedAt: time("archived_at"),
    readAt: time("read_at"),
    lastOpenedAt: time("last_opened_at"),
    readingProgress: doublePrecision("reading_progress").notNull().default(0),
    manualPriority: text("manual_priority"),
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
    uniqueIndex("items_user_id_id_idx").on(t.userId, t.id),
    uniqueIndex("items_user_normalized_url_idx").on(t.userId, t.normalizedUrl),
    index("items_created_idx").on(t.createdAt.desc()),
    index("items_priority_idx").on(t.priority),
    index("items_source_idx").on(t.sourceType),
    index("items_is_read_idx").on(t.isRead),
    index("items_archived_idx").on(t.archivedAt),
    index("items_last_opened_idx").on(t.lastOpenedAt.desc()),
    index("items_search_idx").using("gin", t.searchVector),
    check("items_priority_check", sql`${t.priority} in ('high', 'medium', 'low')`),
    check(
      "items_processing_check",
      sql`${t.processingStatus} in ('processing', 'ready', 'rejected')`
    ),
    check("items_topics_array_check", sql`jsonb_typeof(${t.topics}) = 'array'`),
    check(
      "items_reading_progress_check",
      sql`${t.readingProgress} >= 0 and ${t.readingProgress} <= 1`
    ),
    check(
      "items_manual_priority_check",
      sql`${t.manualPriority} is null or ${t.manualPriority} in ('high', 'medium', 'low')`
    ),
  ]
);

export const itemNotes = pgTable("item_notes", {
  userId: tenantOwner(),
  itemId: text("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  body: text().notNull(),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull(),
});

export const annotations = pgTable(
  "annotations",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    selectedQuote: text("selected_quote").notNull(),
    prefix: text().notNull().default(""),
    suffix: text().notNull().default(""),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    contentHash: text("content_hash").notNull(),
    contentVersion: text("content_version").notNull(),
    comment: text(),
    status: text().notNull().default("active"),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [
    index("annotations_item_idx").on(t.itemId, t.createdAt),
    index("annotations_status_idx").on(t.itemId, t.status),
    check("annotations_quote_check", sql`length(${t.selectedQuote}) > 0`),
    check("annotations_status_check", sql`${t.status} in ('active', 'orphaned')`),
    check(
      "annotations_offsets_check",
      sql`(${t.startOffset} is null and ${t.endOffset} is null) or (${t.startOffset} is not null and ${t.endOffset} is not null and ${t.startOffset} >= 0 and ${t.endOffset} > ${t.startOffset})`
    ),
  ]
);

export const collections = pgTable(
  "collections",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    name: text().notNull(),
    description: text(),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [check("collections_name_check", sql`length(trim(${t.name})) > 0`)]
);

export const collectionItems = pgTable(
  "collection_items",
  {
    userId: tenantOwner(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    addedAt: time("added_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.itemId] }),
    index("collection_items_item_idx").on(t.itemId),
    index("collection_items_order_idx").on(t.collectionId, t.position, t.addedAt),
    check("collection_items_position_check", sql`${t.position} >= 0`),
  ]
);

export const itemEvents = pgTable(
  "item_events",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    eventKey: text("event_key").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: time("occurred_at").notNull(),
  },
  (t) => [
    uniqueIndex("item_events_user_event_key_idx").on(t.userId, t.eventKey),
    index("item_events_item_idx").on(t.itemId, t.occurredAt.desc()),
    index("item_events_type_idx").on(t.eventType, t.occurredAt.desc()),
    check(
      "item_events_type_check",
      sql`${t.eventType} in ('opened','marked_read','marked_unread','completed','archived','restored','collection_added','collection_removed','feedback_recorded','citation_clicked','resurfaced','resurfacing_dismissed')`
    ),
    check("item_events_metadata_check", sql`jsonb_typeof(${t.metadata}) = 'object'`),
  ]
);

export const digestRuns = pgTable(
  "digest_runs",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    digestDate: date("digest_date", { mode: "string" }).notNull(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    status: text().notNull().default("pending"),
    createdAt: time("created_at").notNull(),
    completedAt: time("completed_at"),
    dismissedAt: time("dismissed_at"),
    timezone: text().notNull().default("UTC"),
    selectionVersion: text("selection_version").notNull().default("deterministic-v1"),
    contentMode: text("content_mode").notNull().default("deterministic"),
    selectionMetadata: jsonb("selection_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    titleText: text("title_text").notNull().default(""),
    summaryText: text("summary_text").notNull().default(""),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("digest_runs_user_id_id_idx").on(t.userId, t.id),
    uniqueIndex("digest_runs_user_digest_date_idx").on(t.userId, t.digestDate),
    uniqueIndex("digest_runs_user_local_date_idx").on(t.userId, t.localDate),
    check(
      "digest_runs_status_check",
      sql`${t.status} in ('pending', 'ready', 'degraded', 'failed')`
    ),
    check("digest_runs_content_mode_check", sql`${t.contentMode} in ('deterministic','ai')`),
    check(
      "digest_runs_selection_metadata_check",
      sql`jsonb_typeof(${t.selectionMetadata}) = 'object'`
    ),
  ]
);

export const digestItems = pgTable(
  "digest_items",
  {
    userId: tenantOwner(),
    digestRunId: text("digest_run_id")
      .notNull()
      .references(() => digestRuns.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    category: text().notNull(),
    position: integer().notNull(),
    reason: text().notNull(),
    titleSnapshot: text("title_snapshot").notNull().default(""),
    summarySnapshot: text("summary_snapshot").notNull().default(""),
    selectionMetadata: jsonb("selection_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dismissedAt: time("dismissed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.digestRunId, t.itemId] }),
    uniqueIndex("digest_items_run_position_idx").on(t.digestRunId, t.position),
    index("digest_items_item_idx").on(t.itemId),
    check("digest_items_category_check", sql`${t.category} in ('priority', 'resurfaced')`),
    check("digest_items_position_check", sql`${t.position} >= 0`),
    check(
      "digest_items_selection_metadata_check",
      sql`jsonb_typeof(${t.selectionMetadata}) = 'object'`
    ),
  ]
);

export const personalPreferences = pgTable(
  "personal_preferences",
  {
    userId: tenantOwner(),
    id: text().primaryKey().default("default"),
    digestEnabled: boolean("digest_enabled").notNull().default(false),
    digestTimezone: text("digest_timezone").notNull().default("UTC"),
    personalizationEnabled: boolean("personalization_enabled").notNull().default(true),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("personal_preferences_singleton_check", sql`${t.id} = 'default'`),
    check(
      "personal_preferences_timezone_check",
      sql`length(trim(${t.digestTimezone})) between 1 and 100`
    ),
  ]
);

export const digestJobs = pgTable(
  "digest_jobs",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text().notNull().default("queued"),
    requestedBy: text("requested_by").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("digest_jobs_user_local_date_idx").on(t.userId, t.localDate),
    uniqueIndex("digest_jobs_user_idempotency_idx").on(t.userId, t.idempotencyKey),
    index("digest_jobs_status_idx").on(t.status, t.createdAt),
    check(
      "digest_jobs_status_check",
      sql`${t.status} in ('queued','running','completed','failed')`
    ),
    check("digest_jobs_requested_by_check", sql`${t.requestedBy} in ('cron','manual')`),
  ]
);

export const itemContentVersions = pgTable(
  "item_content_versions",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    contentHash: text("content_hash").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    source: text().notNull(),
    content: text().notNull(),
    characterCount: integer("character_count").notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("item_content_versions_user_item_version_idx").on(t.userId, t.itemId, t.version),
    uniqueIndex("item_content_versions_user_identity_idx").on(
      t.userId,
      t.itemId,
      t.contentHash,
      t.extractorVersion
    ),
    uniqueIndex("item_content_versions_id_item_idx").on(t.id, t.itemId),
    uniqueIndex("item_content_versions_user_id_idx").on(t.userId, t.id),
    uniqueIndex("item_content_versions_user_id_item_idx").on(t.userId, t.id, t.itemId),
    index("item_content_versions_item_created_idx").on(t.itemId, t.createdAt.desc()),
    check("item_content_versions_version_check", sql`${t.version} > 0`),
    check("item_content_versions_hash_check", sql`${t.contentHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check(
      "item_content_versions_source_check",
      sql`${t.source} in ('full_content', 'summary', 'raw_content')`
    ),
    check("item_content_versions_content_check", sql`length(${t.content}) > 0`),
    check(
      "item_content_versions_counts_check",
      sql`${t.characterCount} > 0 and ${t.tokenCount} > 0`
    ),
  ]
);

export const contentChunks = pgTable(
  "content_chunks",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    contentVersionId: text("content_version_id").notNull(),
    itemId: text("item_id").notNull(),
    ordinal: integer().notNull(),
    content: text().notNull(),
    contentHash: text("content_hash").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    tokenCount: integer("token_count").notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(content, ''))`
    ),
    embeddingModel: text("embedding_model"),
    embeddingDimensions: integer("embedding_dimensions"),
    embeddingStatus: text("embedding_status").notNull().default("unconfigured"),
    embeddingError: text("embedding_error"),
    embeddingUpdatedAt: time("embedding_updated_at"),
    embeddedAt: time("embedded_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("content_chunks_user_version_ordinal_idx").on(
      t.userId,
      t.contentVersionId,
      t.ordinal
    ),
    uniqueIndex("content_chunks_id_version_idx").on(t.id, t.contentVersionId),
    uniqueIndex("content_chunks_user_id_idx").on(t.userId, t.id),
    index("content_chunks_item_idx").on(t.itemId, t.contentVersionId, t.ordinal),
    index("content_chunks_search_idx").using("gin", t.searchVector),
    foreignKey({
      columns: [t.contentVersionId, t.itemId],
      foreignColumns: [itemContentVersions.id, itemContentVersions.itemId],
      name: "content_chunks_version_item_fk",
    }).onDelete("cascade"),
    check("content_chunks_ordinal_check", sql`${t.ordinal} >= 0`),
    check("content_chunks_content_check", sql`length(${t.content}) > 0`),
    check("content_chunks_hash_check", sql`${t.contentHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check(
      "content_chunks_offsets_check",
      sql`${t.startOffset} >= 0 and ${t.endOffset} > ${t.startOffset}`
    ),
    check("content_chunks_token_count_check", sql`${t.tokenCount} > 0`),
    check(
      "content_chunks_embedding_status_check",
      sql`${t.embeddingStatus} in ('unconfigured', 'pending', 'ready', 'failed', 'stale')`
    ),
    check(
      "content_chunks_embedding_dimensions_check",
      sql`${t.embeddingDimensions} is null or ${t.embeddingDimensions} > 0`
    ),
    check(
      "content_chunks_ready_embedding_check",
      sql`${t.embeddingStatus} <> 'ready' or (${t.embeddingModel} is not null and ${t.embeddingDimensions} is not null and ${t.embeddedAt} is not null)`
    ),
    check(
      "content_chunks_unconfigured_embedding_check",
      sql`${t.embeddingStatus} <> 'unconfigured' or (${t.embeddingModel} is null and ${t.embeddingDimensions} is null and ${t.embeddedAt} is null)`
    ),
  ]
);

export const intelligenceArtifacts = pgTable(
  "intelligence_artifacts",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    itemId: text("item_id").notNull(),
    contentVersionId: text("content_version_id").notNull(),
    artifactType: text("artifact_type").notNull(),
    version: integer().notNull(),
    status: text().notNull().default("pending"),
    content: text(),
    contentHash: text("content_hash"),
    provenance: text().notNull().default("generated"),
    promptVersion: text("prompt_version"),
    provider: text(),
    model: text(),
    isCurrent: boolean("is_current").notNull().default(false),
    supersedesArtifactId: text("supersedes_artifact_id"),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    completedAt: time("completed_at"),
  },
  (t) => [
    uniqueIndex("intelligence_artifacts_user_item_type_version_idx").on(
      t.userId,
      t.itemId,
      t.artifactType,
      t.version
    ),
    uniqueIndex("intelligence_artifacts_user_current_idx")
      .on(t.userId, t.itemId, t.artifactType)
      .where(sql`${t.isCurrent} = true`),
    uniqueIndex("intelligence_artifacts_user_id_idx").on(t.userId, t.id),
    index("intelligence_artifacts_content_version_idx").on(t.contentVersionId),
    index("intelligence_artifacts_status_idx").on(t.status, t.createdAt),
    foreignKey({
      columns: [t.contentVersionId, t.itemId],
      foreignColumns: [itemContentVersions.id, itemContentVersions.itemId],
      name: "intelligence_artifacts_version_item_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.supersedesArtifactId],
      foreignColumns: [t.id],
      name: "intelligence_artifacts_supersedes_fk",
    }).onDelete("set null"),
    check(
      "intelligence_artifacts_type_check",
      sql`${t.artifactType} in ('brief_summary', 'detailed_summary', 'claims')`
    ),
    check("intelligence_artifacts_version_check", sql`${t.version} > 0`),
    check(
      "intelligence_artifacts_status_check",
      sql`${t.status} in ('pending', 'ready', 'degraded', 'failed', 'stale')`
    ),
    check(
      "intelligence_artifacts_hash_check",
      sql`${t.contentHash} is null or ${t.contentHash} ~ '^sha256:[0-9a-f]{64}$'`
    ),
    check(
      "intelligence_artifacts_provenance_check",
      sql`${t.provenance} in ('generated', 'deterministic_fallback', 'legacy_unverified')`
    ),
    check(
      "intelligence_artifacts_completion_check",
      sql`${t.status} = 'pending' or ${t.completedAt} is not null`
    ),
    check(
      "intelligence_artifacts_current_check",
      sql`${t.isCurrent} = false or ${t.status} in ('ready', 'degraded')`
    ),
    check(
      "intelligence_artifacts_summary_content_check",
      sql`${t.artifactType} = 'claims' or ${t.status} not in ('ready', 'degraded') or (${t.content} is not null and ${t.contentHash} is not null)`
    ),
    check("intelligence_artifacts_metadata_check", sql`jsonb_typeof(${t.metadata}) = 'object'`),
  ]
);

export const intelligenceClaims = pgTable(
  "intelligence_claims",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => intelligenceArtifacts.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    claim: text().notNull(),
    claimHash: text("claim_hash").notNull(),
    confidence: doublePrecision(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("intelligence_claims_user_artifact_ordinal_idx").on(
      t.userId,
      t.artifactId,
      t.ordinal
    ),
    uniqueIndex("intelligence_claims_user_id_idx").on(t.userId, t.id),
    index("intelligence_claims_artifact_idx").on(t.artifactId),
    check("intelligence_claims_ordinal_check", sql`${t.ordinal} >= 0`),
    check("intelligence_claims_text_check", sql`length(${t.claim}) > 0`),
    check("intelligence_claims_hash_check", sql`${t.claimHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check(
      "intelligence_claims_confidence_check",
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`
    ),
  ]
);

export const claimEvidence = pgTable(
  "claim_evidence",
  {
    userId: tenantOwner(),
    claimId: text("claim_id")
      .notNull()
      .references(() => intelligenceClaims.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id")
      .notNull()
      .references(() => contentChunks.id, { onDelete: "cascade" }),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    exactExcerpt: text("exact_excerpt").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.chunkId, t.startOffset, t.endOffset] }),
    index("claim_evidence_chunk_idx").on(t.chunkId),
    check(
      "claim_evidence_offsets_check",
      sql`${t.startOffset} >= 0 and ${t.endOffset} > ${t.startOffset}`
    ),
    check("claim_evidence_excerpt_check", sql`length(${t.exactExcerpt}) > 0`),
    check("claim_evidence_hash_check", sql`${t.evidenceHash} ~ '^sha256:[0-9a-f]{64}$'`),
  ]
);

export const knowledgeBackfillCheckpoints = pgTable(
  "knowledge_backfill_checkpoints",
  {
    userId: tenantOwner(),
    jobKey: text("job_key").primaryKey(),
    jobType: text("job_type").notNull(),
    status: text().notNull().default("pending"),
    cursor: text(),
    checkpoint: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    processedCount: integer("processed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    attempt: integer().notNull().default(0),
    lastError: text("last_error"),
    startedAt: time("started_at"),
    completedAt: time("completed_at"),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_backfill_status_idx").on(t.status, t.updatedAt),
    check(
      "knowledge_backfill_type_check",
      sql`${t.jobType} in ('content_versions', 'chunks', 'legacy_artifacts', 'embeddings')`
    ),
    check(
      "knowledge_backfill_status_check",
      sql`${t.status} in ('pending', 'running', 'completed', 'failed')`
    ),
    check(
      "knowledge_backfill_counts_check",
      sql`${t.processedCount} >= 0 and ${t.failedCount} >= 0 and ${t.attempt} >= 0`
    ),
    check("knowledge_backfill_checkpoint_check", sql`jsonb_typeof(${t.checkpoint}) = 'object'`),
    check(
      "knowledge_backfill_completion_check",
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`
    ),
  ]
);

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    userId: tenantOwner(),
    provider: text().notNull(),
    teamId: text("team_id").notNull().default(""),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiryDate: bigint("expiry_date", { mode: "number" }),
    email: text(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider, t.teamId] })]
);
export const aiSummaries = pgTable(
  "ai_summaries",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    summary: text().notNull(),
    model: text().notNull(),
    promptType: text("prompt_type").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (t) => [uniqueIndex("ai_summaries_user_item_prompt_idx").on(t.userId, t.itemId, t.promptType)]
);
export const feedback = pgTable(
  "feedback",
  {
    userId: tenantOwner(),
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
    userId: tenantOwner(),
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
  (t) => [
    uniqueIndex("research_reports_user_id_idx").on(t.userId, t.id),
    index("research_reports_item_idx").on(t.itemId),
  ]
);
export const researchSuggestions = pgTable(
  "research_suggestions",
  {
    userId: tenantOwner(),
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
    uniqueIndex("research_suggestions_user_id_idx").on(t.userId, t.id),
    index("research_suggestions_status_idx").on(t.status),
    check("research_source_items_array_check", sql`jsonb_typeof(${t.sourceItemIds}) = 'array'`),
  ]
);
export const researchSuggestionSources = pgTable(
  "research_suggestion_sources",
  {
    userId: tenantOwner(),
    researchSuggestionId: text("research_suggestion_id").notNull(),
    itemId: text("item_id").notNull(),
    position: integer().notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.researchSuggestionId, t.position] }),
    index("research_suggestion_sources_item_idx").on(t.userId, t.itemId),
    check("research_suggestion_sources_position_check", sql`${t.position} >= 0`),
  ]
);
export const userSettings = pgTable(
  "user_settings",
  {
    userId: tenantOwner(),
    key: text().notNull(),
    value: text().notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })]
);
export const notifications = pgTable(
  "notifications",
  {
    userId: tenantOwner(),
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
    userId: tenantOwner(),
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
    userId: tenantOwner(),
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
    userId: tenantOwner(),
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
    uniqueIndex("workflow_runs_user_id_idx").on(t.userId, t.id),
    index("workflow_runs_status_idx").on(t.status),
    index("workflow_runs_item_idx").on(t.itemId),
    index("workflow_runs_created_idx").on(t.createdAt.desc()),
    check("workflow_steps_array_check", sql`jsonb_typeof(${t.stepsJson}) = 'array'`),
  ]
);
export const agentActions = pgTable(
  "agent_actions",
  {
    userId: tenantOwner(),
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
    userId: tenantOwner(),
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
export const chatConversations = pgTable(
  "chat_conversations",
  {
    userId: tenantOwner(),
    id: text().primaryKey(),
    title: text(),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [uniqueIndex("chat_conversations_user_id_idx").on(t.userId, t.id)]
);
export const chatMessages = pgTable(
  "chat_messages",
  {
    userId: tenantOwner(),
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
    userId: tenantOwner(),
    id: text().primaryKey(),
    jobType: text("job_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
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
    uniqueIndex("job_queue_user_idempotency_idx").on(t.userId, t.idempotencyKey),
    index("job_queue_status_idx").on(t.status, t.priority.desc(), t.createdAt),
    index("job_queue_type_idx").on(t.jobType),
    check("job_payload_object_check", sql`jsonb_typeof(${t.payload}) = 'object'`),
    check("job_attempts_check", sql`${t.attempts} >= 0 and ${t.maxRetries} >= 0`),
  ]
);
export const publisherQueue = pgTable(
  "publisher_queue",
  {
    userId: tenantOwner(),
    publisherId: text("publisher_id").notNull(),
    url: text().notNull(),
    discoveredAt: time("discovered_at").notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.publisherId, t.url] }),
    index("publisher_queue_status_idx").on(t.publisherId, t.status),
  ]
);
export const rawContent = pgTable(
  "raw_content",
  {
    userId: tenantOwner(),
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
    userId: tenantOwner(),
    id: text().primaryKey(),
    url: text().notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    title: text(),
    notes: text(),
    topics: jsonb().$type<string[]>().notNull().default([]),
    priority: text().notNull().default("medium"),
    source: text().notNull(),
    originActorKind: text("origin_actor_kind").notNull(),
    originActorId: uuid("origin_actor_id").notNull(),
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
    uniqueIndex("capture_user_active_url_idx")
      .on(t.userId, t.normalizedUrl)
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
    userId: tenantOwner(),
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
    userId: tenantOwner(),
    key: text().notNull(),
    environment: text().notNull(),
    principalKind: text("principal_kind").notNull(),
    principalId: text("principal_id").notNull(),
    operation: text().notNull(),
    windowStart: time("window_start").notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({
      columns: [
        t.userId,
        t.environment,
        t.principalKind,
        t.principalId,
        t.operation,
        t.windowStart,
        t.windowSeconds,
      ],
    }),
    index("rate_limit_expiry_idx").on(t.windowStart),
    check("rate_limit_window_seconds_check", sql`${t.windowSeconds} > 0`),
    check("rate_limit_count_check", sql`${t.count} >= 0`),
  ]
);
