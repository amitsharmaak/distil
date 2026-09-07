import type {
  JsonColumnClassification,
  QueueClassification,
  ReferenceClassification,
  TenantMigrationManifest,
  TenantProtectedTableClassification,
  TenantTableClassification,
  UniquenessClassification,
} from "./types";

const ref = (
  name: string,
  columns: readonly string[],
  targetTable: string,
  targetColumns: readonly string[] = ["id"]
): ReferenceClassification => ({ name, columns, targetTable, targetColumns });

const unique = (
  name: string,
  columns: readonly string[],
  predicate?: string
): UniquenessClassification => ({ name, columns, ...(predicate ? { predicate } : {}) });

const json = (column: string, noTenantReferences: string): JsonColumnClassification => ({
  column,
  noTenantReferences,
});

const jsonRefs = (
  column: string,
  references: JsonColumnClassification["references"]
): JsonColumnClassification => ({ column, references });

interface TableInput {
  identity: readonly string[];
  highValue?: readonly string[];
  references?: readonly ReferenceClassification[];
  uniqueness?: readonly UniquenessClassification[];
  jsonColumns?: readonly JsonColumnClassification[];
  queue?: QueueClassification;
}

const tenant = (table: string, input: TableInput): TenantTableClassification => ({
  schema: "public",
  table,
  tenantBearing: true,
  ownerColumn: "user_id",
  identityColumns: input.identity,
  highValueColumns: input.highValue ?? [],
  references: input.references ?? [],
  uniqueness: input.uniqueness ?? [],
  jsonColumns: input.jsonColumns ?? [],
  ...(input.queue ? { queue: input.queue } : {}),
});

/**
 * Authoritative classification for every application table that exists through Phase 2.
 *
 * Adding a table or JSONB column without updating this manifest intentionally makes the
 * verifier fail closed. This file describes the future ownership contract; it does not
 * alter the schema or application behavior.
 */
export const tenantMigrationManifest: TenantMigrationManifest = {
  contractVersion: 1,
  id: "phase3-tenant-migration-v1",
  applicationSchemas: ["public"],
  immutableOwner: {
    label: "Amit",
    source: "explicit-cli-argument",
    column: "user_id",
    sqlType: "uuid",
  },
  tables: [
    tenant("items", {
      identity: ["id"],
      highValue: ["url", "normalized_url", "summary", "full_content"],
      uniqueness: [unique("normalized_url", ["normalized_url"], "normalized_url IS NOT NULL")],
      jsonColumns: [
        json("topics", "Topic labels contain no row identifiers."),
        json("extracted_links", "Extracted outbound URLs are not Distil row identifiers."),
        json("content_classification", "Classifier output contains no contractual row references."),
        json("detected_media", "Detected media metadata contains no contractual row references."),
      ],
    }),
    tenant("item_notes", {
      identity: ["item_id"],
      highValue: ["body"],
      references: [ref("item", ["item_id"], "items")],
    }),
    tenant("annotations", {
      identity: ["id"],
      highValue: ["selected_quote", "content_hash", "comment"],
      references: [ref("item", ["item_id"], "items")],
    }),
    tenant("collections", {
      identity: ["id"],
      highValue: ["name", "description"],
    }),
    tenant("collection_items", {
      identity: ["collection_id", "item_id"],
      highValue: ["position", "added_at"],
      references: [
        ref("collection", ["collection_id"], "collections"),
        ref("item", ["item_id"], "items"),
      ],
    }),
    tenant("item_events", {
      identity: ["id"],
      highValue: ["event_key", "metadata"],
      references: [ref("item", ["item_id"], "items")],
      uniqueness: [unique("event_key", ["event_key"])],
      jsonColumns: [json("metadata", "Event metadata has no contractual row reference shape.")],
    }),
    tenant("digest_runs", {
      identity: ["id"],
      highValue: ["title_text", "summary_text", "selection_metadata"],
      uniqueness: [unique("digest_date", ["digest_date"]), unique("local_date", ["local_date"])],
      jsonColumns: [
        json("selection_metadata", "Digest selection evidence is descriptive, not referential."),
      ],
    }),
    tenant("digest_items", {
      identity: ["digest_run_id", "item_id"],
      highValue: ["title_snapshot", "summary_snapshot", "selection_metadata"],
      references: [
        ref("digest_run", ["digest_run_id"], "digest_runs"),
        ref("item", ["item_id"], "items"),
      ],
      uniqueness: [unique("run_position", ["digest_run_id", "position"])],
      jsonColumns: [
        json(
          "selection_metadata",
          "Digest item selection evidence is descriptive, not referential."
        ),
      ],
    }),
    tenant("personal_preferences", {
      identity: ["id"],
      highValue: ["digest_enabled", "digest_timezone", "personalization_enabled"],
      uniqueness: [unique("preference_key", ["id"])],
    }),
    tenant("digest_jobs", {
      identity: ["id"],
      highValue: ["idempotency_key", "status"],
      uniqueness: [
        unique("local_date", ["local_date"]),
        unique("idempotency_key", ["idempotency_key"]),
      ],
      queue: { statusColumn: "status", kindColumn: "requested_by" },
    }),
    tenant("item_content_versions", {
      identity: ["id"],
      highValue: ["content_hash", "content"],
      references: [ref("item", ["item_id"], "items")],
      uniqueness: [
        unique("item_version", ["item_id", "version"]),
        unique("item_content_extractor", ["item_id", "content_hash", "extractor_version"]),
      ],
    }),
    tenant("content_chunks", {
      identity: ["id"],
      highValue: ["content_hash", "content"],
      references: [
        ref("item", ["item_id"], "items"),
        ref("content_version_item", ["content_version_id", "item_id"], "item_content_versions", [
          "id",
          "item_id",
        ]),
      ],
      uniqueness: [unique("version_ordinal", ["content_version_id", "ordinal"])],
    }),
    tenant("intelligence_artifacts", {
      identity: ["id"],
      highValue: ["content_hash", "content", "metadata"],
      references: [
        ref("content_version_item", ["content_version_id", "item_id"], "item_content_versions", [
          "id",
          "item_id",
        ]),
        ref("superseded_artifact", ["supersedes_artifact_id"], "intelligence_artifacts"),
      ],
      uniqueness: [
        unique("item_type_version", ["item_id", "artifact_type", "version"]),
        unique("current_item_type", ["item_id", "artifact_type"], "is_current = true"),
      ],
      jsonColumns: [
        json("metadata", "Artifact provenance metadata has no contractual row reference shape."),
      ],
    }),
    tenant("intelligence_claims", {
      identity: ["id"],
      highValue: ["claim_hash", "claim"],
      references: [ref("artifact", ["artifact_id"], "intelligence_artifacts")],
      uniqueness: [unique("artifact_ordinal", ["artifact_id", "ordinal"])],
    }),
    tenant("claim_evidence", {
      identity: ["claim_id", "chunk_id", "start_offset", "end_offset"],
      highValue: ["evidence_hash", "exact_excerpt"],
      references: [
        ref("claim", ["claim_id"], "intelligence_claims"),
        ref("chunk", ["chunk_id"], "content_chunks"),
      ],
    }),
    tenant("knowledge_backfill_checkpoints", {
      identity: ["job_key"],
      highValue: ["cursor", "checkpoint", "processed_count", "failed_count"],
      jsonColumns: [
        json("checkpoint", "Checkpoint cursors are opaque processing state, not row references."),
      ],
      queue: { statusColumn: "status", kindColumn: "job_type" },
    }),
    tenant("oauth_tokens", {
      identity: ["provider", "team_id"],
      highValue: ["access_token", "refresh_token"],
      uniqueness: [unique("provider_team", ["provider", "team_id"])],
    }),
    tenant("ai_summaries", {
      identity: ["id"],
      highValue: ["summary"],
      references: [ref("item", ["item_id"], "items")],
      uniqueness: [unique("item_prompt", ["item_id", "prompt_type"])],
    }),
    tenant("feedback", {
      identity: ["id"],
      highValue: ["rating", "reason"],
      references: [ref("item", ["item_id"], "items")],
    }),
    tenant("research_reports", {
      identity: ["id"],
      highValue: ["query", "report", "sources"],
      references: [ref("item", ["item_id"], "items")],
    }),
    tenant("research_suggestions", {
      identity: ["id"],
      highValue: ["topic_key", "suggested_query", "source_item_ids"],
      references: [ref("research_report", ["research_report_id"], "research_reports")],
      jsonColumns: [
        jsonRefs("source_item_ids", [
          {
            name: "source_items",
            column: "source_item_ids",
            path: "$[*]",
            targetTable: "items",
            targetColumn: "id",
          },
        ]),
      ],
    }),
    tenant("user_settings", {
      identity: ["key"],
      highValue: ["value"],
      uniqueness: [unique("setting_key", ["key"])],
    }),
    tenant("notifications", {
      identity: ["id"],
      highValue: ["title", "message"],
      references: [ref("item", ["item_id"], "items")],
    }),
    tenant("item_embeddings", {
      identity: ["item_id"],
      highValue: ["embedding", "model"],
      references: [ref("item", ["item_id"], "items")],
      jsonColumns: [json("embedding", "Embedding vectors contain no row identifiers.")],
    }),
    tenant("audit_log", {
      identity: ["id"],
      highValue: ["input_hash", "output_hash", "trace_id"],
    }),
    tenant("workflow_runs", {
      identity: ["id"],
      highValue: ["steps_json", "trace_id"],
      references: [ref("item", ["item_id"], "items")],
      jsonColumns: [
        json(
          "steps_json",
          "Workflow steps are historical execution output without a stable reference schema."
        ),
      ],
    }),
    tenant("agent_actions", {
      identity: ["id"],
      highValue: ["input", "output", "reasoning", "trace_id"],
      references: [ref("workflow", ["workflow_id"], "workflow_runs")],
    }),
    tenant("approval_queue", {
      identity: ["id"],
      highValue: ["payload", "trace_id"],
      references: [ref("workflow", ["workflow_id"], "workflow_runs")],
      jsonColumns: [
        jsonRefs("payload", [
          {
            name: "nested_item_ids",
            column: "payload",
            path: "$.**.itemId",
            targetTable: "items",
            targetColumn: "id",
          },
        ]),
      ],
      queue: { statusColumn: "status", kindColumn: "action_type" },
    }),
    tenant("chat_conversations", {
      identity: ["id"],
      highValue: ["title"],
    }),
    tenant("chat_messages", {
      identity: ["id"],
      highValue: ["content", "citations", "tool_calls"],
      references: [ref("conversation", ["conversation_id"], "chat_conversations")],
      jsonColumns: [
        jsonRefs("citations", [
          {
            name: "citation_items",
            column: "citations",
            path: "$[*].id",
            targetTable: "items",
            targetColumn: "id",
          },
        ]),
        json("tool_calls", "Tool call history is opaque and has no stable reference schema."),
      ],
    }),
    tenant("job_queue", {
      identity: ["id"],
      highValue: ["payload", "status", "last_error"],
      jsonColumns: [
        jsonRefs("payload", [
          {
            name: "item_ids",
            column: "payload",
            path: "$.**.itemId",
            targetTable: "items",
            targetColumn: "id",
          },
          {
            name: "content_version_ids",
            column: "payload",
            path: "$.**.contentVersionId",
            targetTable: "item_content_versions",
            targetColumn: "id",
          },
          {
            name: "artifact_ids",
            column: "payload",
            path: "$.**.artifactId",
            targetTable: "intelligence_artifacts",
            targetColumn: "id",
          },
        ]),
      ],
      queue: { statusColumn: "status", kindColumn: "job_type" },
    }),
    tenant("publisher_queue", {
      identity: ["publisher_id", "url"],
      highValue: ["url", "status", "last_error"],
      queue: { statusColumn: "status", kindColumn: "publisher_id" },
    }),
    tenant("raw_content", {
      identity: ["id"],
      highValue: ["raw_body", "metadata"],
      references: [ref("item", ["item_id"], "items")],
      jsonColumns: [
        json(
          "metadata",
          "Source metadata contains external identifiers, not Distil row references."
        ),
      ],
    }),
    tenant("capture_requests", {
      identity: ["id"],
      highValue: ["url", "normalized_url", "notes", "topics"],
      references: [ref("item", ["item_id"], "items")],
      uniqueness: [
        unique(
          "active_normalized_url",
          ["normalized_url"],
          "status IN ('queued','processing','ready')"
        ),
      ],
      jsonColumns: [json("topics", "Capture topic labels contain no row identifiers.")],
      queue: { statusColumn: "status", kindColumn: "source" },
    }),
    tenant("capture_tokens", {
      identity: ["id"],
      highValue: ["token_hash", "token_prefix"],
      uniqueness: [unique("token_hash", ["token_hash"])],
    }),
    tenant("rate_limit_windows", {
      identity: ["key", "window_start", "window_seconds"],
      highValue: ["key", "count"],
      uniqueness: [unique("window", ["key", "window_start", "window_seconds"])],
    }),
  ],
  supplementalTables: [
    {
      schema: "public",
      table: "users",
      tenantBearing: true,
      ownerColumn: "id",
      lifecycle: "identity",
      jsonColumns: [],
      reason: "Account root created by Phase 3 expand; the frozen dataset has no predecessor row.",
    },
    {
      schema: "public",
      table: "auth_identities",
      tenantBearing: true,
      ownerColumn: "user_id",
      lifecycle: "identity",
      jsonColumns: [],
      reason: "Provider identities are created by the account acceptance boundary.",
    },
    {
      schema: "public",
      table: "invitations",
      tenantBearing: false,
      lifecycle: "identity",
      jsonColumns: [],
      reason:
        "Operator-issued invitation exists before the invited account and is control-plane data.",
    },
    {
      schema: "public",
      table: "session_metadata",
      tenantBearing: true,
      ownerColumn: "user_id",
      lifecycle: "identity",
      jsonColumns: [],
      reason: "Session metadata starts empty and is populated only by Phase 3 authentication.",
    },
    {
      schema: "public",
      table: "account_exports",
      tenantBearing: true,
      ownerColumn: "user_id",
      lifecycle: "account",
      jsonColumns: [],
      reason: "Export state starts empty and has no frozen Phase 2 predecessor.",
    },
    {
      schema: "public",
      table: "account_deletions",
      tenantBearing: true,
      ownerColumn: "user_id",
      lifecycle: "account",
      jsonColumns: [
        json("checkpoint", "Deletion checkpoint contains stage cursors, not row identifiers."),
      ],
      reason: "Deletion state starts empty and has no frozen Phase 2 predecessor.",
    },
    {
      schema: "public",
      table: "usage_counters",
      tenantBearing: true,
      ownerColumn: "user_id",
      lifecycle: "account",
      jsonColumns: [],
      reason: "Per-account usage starts empty and is not synthesized from Phase 2 audit rows.",
    },
    {
      schema: "public",
      table: "user_entitlements",
      tenantBearing: true,
      ownerColumn: "user_id",
      lifecycle: "account",
      jsonColumns: [],
      reason: "Entitlements start empty and are assigned by the account control plane.",
    },
    {
      schema: "public",
      table: "research_suggestion_sources",
      tenantBearing: true,
      ownerColumn: "user_id",
      lifecycle: "normalized-link",
      jsonColumns: [],
      reason: "Backfill-normalized projection of Phase 2 research_suggestions.source_item_ids.",
    },
  ],
  controlTables: [
    {
      schema: "public",
      table: "distil_migrations",
      tenantBearing: false,
      reason: "Schema migration ledger contains release metadata and no user data.",
    },
    {
      schema: "public",
      table: "distil_tenant_migrations",
      tenantBearing: false,
      reason:
        "Staged tenant migration ledger contains checksums and the approved opaque owner UUID.",
    },
  ],
};

export const tenantBearingTableNames = tenantMigrationManifest.tables.map(
  ({ schema, table }) => `${schema}.${table}`
);

export const tenantProtectedTables: readonly TenantProtectedTableClassification[] = [
  ...tenantMigrationManifest.tables.map(({ schema, table, ownerColumn }) => ({
    schema,
    table,
    ownerColumn,
  })),
  ...tenantMigrationManifest.supplementalTables
    .filter(
      (table): table is typeof table & { tenantBearing: true; ownerColumn: "id" | "user_id" } =>
        table.tenantBearing && table.ownerColumn !== undefined
    )
    .map(({ schema, table, ownerColumn }) => ({ schema, table, ownerColumn })),
];
