import { createHash, randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { parseAuthContext, type AuthContext, type UserId } from "@/lib/contracts";
import type {
  AccountDeletionRecord,
  AccountExportRecord,
  ControlPlaneLifecycleRepository,
  ExportDataset,
  PurgeVerification,
  TenantLifecycleRepository,
  UsageCounter,
  UserQuota,
} from "@/lib/lifecycle/ports";
import { tenantProtectedTables } from "@/lib/postgres/tenant-migration/manifest";

type Row = Record<string, unknown>;

const EXPORT_DATASETS = [
  [
    "profile",
    `SELECT jsonb_build_object('id', id, 'primaryEmail', primary_email, 'displayName', display_name, 'createdAt', created_at) AS value FROM users ORDER BY id::text`,
  ],
  ["items", `SELECT to_jsonb(t) - 'user_id' - 'search_vector' AS value FROM items t ORDER BY id`],
  ["item-notes", `SELECT to_jsonb(t) - 'user_id' AS value FROM item_notes t ORDER BY item_id`],
  ["annotations", `SELECT to_jsonb(t) - 'user_id' AS value FROM annotations t ORDER BY id`],
  ["collections", `SELECT to_jsonb(t) - 'user_id' AS value FROM collections t ORDER BY id`],
  [
    "collection-items",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM collection_items t ORDER BY collection_id, position, item_id`,
  ],
  [
    "item-events",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM item_events t ORDER BY occurred_at, id`,
  ],
  [
    "digest-runs",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM digest_runs t ORDER BY digest_date, id`,
  ],
  [
    "digest-items",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM digest_items t ORDER BY digest_run_id, position, item_id`,
  ],
  [
    "preferences",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM personal_preferences t ORDER BY id`,
  ],
  [
    "content-versions",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM item_content_versions t ORDER BY item_id, version, id`,
  ],
  [
    "content-chunks",
    `SELECT to_jsonb(t) - 'user_id' - 'embedding' AS value FROM content_chunks t ORDER BY content_version_id, ordinal, id`,
  ],
  [
    "intelligence-artifacts",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM intelligence_artifacts t ORDER BY item_id, artifact_type, version, id`,
  ],
  [
    "claims",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM intelligence_claims t ORDER BY artifact_id, ordinal, id`,
  ],
  [
    "claim-evidence",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM claim_evidence t ORDER BY claim_id, chunk_id, start_offset`,
  ],
  [
    "summaries",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM ai_summaries t ORDER BY item_id, prompt_type, id`,
  ],
  ["feedback", `SELECT to_jsonb(t) - 'user_id' AS value FROM feedback t ORDER BY created_at, id`],
  [
    "research-reports",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM research_reports t ORDER BY created_at, id`,
  ],
  [
    "research-suggestions",
    `SELECT to_jsonb(t) - 'user_id' - 'source_item_ids' AS value FROM research_suggestions t ORDER BY created_at, id`,
  ],
  [
    "research-suggestion-sources",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM research_suggestion_sources t ORDER BY research_suggestion_id, position`,
  ],
  ["settings", `SELECT to_jsonb(t) - 'user_id' AS value FROM user_settings t ORDER BY key`],
  [
    "notifications",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM notifications t ORDER BY created_at, id`,
  ],
  [
    "captures",
    `SELECT to_jsonb(t) - 'user_id' - 'origin_actor_id' - 'last_error_message' AS value FROM capture_requests t ORDER BY created_at, id`,
  ],
  [
    "raw-content",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM raw_content t ORDER BY created_at, id`,
  ],
  [
    "conversations",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM chat_conversations t ORDER BY created_at, id`,
  ],
  [
    "messages",
    `SELECT to_jsonb(t) - 'user_id' - 'tool_calls' AS value FROM chat_messages t ORDER BY conversation_id, created_at, id`,
  ],
  [
    "usage",
    `SELECT to_jsonb(t) - 'user_id' AS value FROM usage_counters t ORDER BY billing_date, operation, provider`,
  ],
] as const;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function optionalIso(value: unknown): string | undefined {
  return value == null ? undefined : iso(value);
}

function mapExport(row: Row | undefined): AccountExportRecord | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    userId: String(row.user_id) as UserId,
    status: row.status as AccountExportRecord["status"],
    idempotencyKey: String(row.idempotency_key),
    manifestVersion: Number(row.manifest_version),
    ...(row.object_ref ? { objectRef: String(row.object_ref) } : {}),
    ...(row.content_hash ? { contentHash: String(row.content_hash) } : {}),
    ...(row.size_bytes != null ? { sizeBytes: Number(row.size_bytes) } : {}),
    ...(row.failure_code ? { failureCode: String(row.failure_code) } : {}),
    requestedAt: iso(row.requested_at),
    updatedAt: iso(row.updated_at),
    ...(optionalIso(row.completed_at) ? { completedAt: optionalIso(row.completed_at) } : {}),
    downloadExpiresAt: iso(row.download_expires_at),
    purgeAfter: iso(row.purge_after),
  };
}

function mapDeletion(row: Row | undefined): AccountDeletionRecord | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    userId: String(row.user_id) as UserId,
    status: row.status as AccountDeletionRecord["status"],
    checkpoint: (row.checkpoint ?? {}) as Record<string, unknown>,
    requestedAt: iso(row.requested_at),
    purgeAfter: iso(row.purge_after),
    updatedAt: iso(row.updated_at),
    ...(optionalIso(row.started_at) ? { startedAt: optionalIso(row.started_at) } : {}),
    ...(optionalIso(row.cancelled_at) ? { cancelledAt: optionalIso(row.cancelled_at) } : {}),
    ...(optionalIso(row.completed_at) ? { completedAt: optionalIso(row.completed_at) } : {}),
    ...(row.failure_code ? { failureCode: String(row.failure_code) } : {}),
  };
}

function mapUsage(row: Row): UsageCounter {
  return {
    date: String(row.billing_date),
    operation: String(row.operation),
    provider: String(row.provider ?? ""),
    requestCount: Number(row.request_count),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costMicrousd: Number(row.cost_microusd),
  };
}

export class PostgresTenantLifecycleRepository implements TenantLifecycleRepository {
  private readonly context: AuthContext;

  constructor(
    private readonly sql: Sql,
    context: AuthContext
  ) {
    this.context = parseAuthContext(context);
  }

  async createExport(input: {
    id: string;
    idempotencyKey: string;
    requestedAt: string;
    downloadExpiresAt: string;
    purgeAfter: string;
  }) {
    await this
      .sql`SELECT pg_advisory_xact_lock(hashtext(${`export:${this.context.userId}:${input.idempotencyKey}`}))`;
    const existing = await this.sql<Row[]>`
      SELECT * FROM account_exports WHERE idempotency_key=${input.idempotencyKey} LIMIT 1`;
    if (existing[0]) return { record: mapExport(existing[0])!, created: false };
    const rows = await this.sql<Row[]>`
      INSERT INTO account_exports
        (id,user_id,status,idempotency_key,manifest_version,requested_at,updated_at,download_expires_at,purge_after)
      VALUES
        (${input.id}::uuid,${this.context.userId}::uuid,'pending',${input.idempotencyKey},1,
         ${input.requestedAt}::timestamptz,${input.requestedAt}::timestamptz,
         ${input.downloadExpiresAt}::timestamptz,${input.purgeAfter}::timestamptz)
      RETURNING *`;
    return { record: mapExport(rows[0])!, created: true };
  }

  async findExport(id: string) {
    return mapExport(
      (await this.sql<Row[]>`SELECT * FROM account_exports WHERE id=${id}::uuid LIMIT 1`)[0]
    );
  }

  async claimExport(id: string, at: string) {
    const rows = await this.sql<Row[]>`
      UPDATE account_exports SET status='running',updated_at=${at}::timestamptz,failure_code=NULL
      WHERE id=${id}::uuid AND status IN ('pending','failed') RETURNING *`;
    return mapExport(rows[0]);
  }

  async completeExport(input: {
    id: string;
    objectRef: string;
    contentHash: string;
    sizeBytes: number;
    completedAt: string;
  }) {
    const rows = await this.sql<Row[]>`
      UPDATE account_exports
      SET status='ready',object_ref=${input.objectRef},content_hash=${input.contentHash},
          size_bytes=${input.sizeBytes},completed_at=${input.completedAt}::timestamptz,
          updated_at=${input.completedAt}::timestamptz,failure_code=NULL
      WHERE id=${input.id}::uuid AND status='running' RETURNING *`;
    return mapExport(rows[0]);
  }

  async failExport(id: string, failureCode: string, at: string) {
    await this.sql`
      UPDATE account_exports SET status='failed',failure_code=${failureCode},updated_at=${at}::timestamptz
      WHERE id=${id}::uuid AND status IN ('pending','running')`;
  }

  async expireExport(id: string, at: string) {
    const rows = await this.sql<Row[]>`
      UPDATE account_exports
      SET status='expired',object_ref=NULL,updated_at=${at}::timestamptz
      WHERE id=${id}::uuid AND status IN ('ready','failed') AND purge_after<=${at}::timestamptz
      RETURNING *`;
    return mapExport(rows[0]);
  }

  async readExportDatasets(): Promise<ExportDataset[]> {
    const datasets: ExportDataset[] = [];
    for (const [name, query] of EXPORT_DATASETS) {
      const rows = await this.sql.unsafe<Array<{ value: Record<string, unknown> }>>(query);
      datasets.push({ name, rows: rows.map(({ value }) => value) });
    }
    return datasets;
  }

  async requestDeletion(input: { id: string; requestedAt: string; purgeAfter: string }) {
    await this.sql`SELECT pg_advisory_xact_lock(hashtext(${`deletion:${this.context.userId}`}))`;
    const existing = await this.sql<Row[]>`
      SELECT * FROM account_deletions
      WHERE status IN ('requested','draining','purging') ORDER BY requested_at DESC LIMIT 1`;
    if (existing[0]) return { record: mapDeletion(existing[0])!, created: false };
    const updated = await this.sql`
      UPDATE users SET status='deletion_pending',updated_at=${input.requestedAt}::timestamptz
      WHERE id=${this.context.userId}::uuid AND status='active' RETURNING id`;
    if (!updated[0]) throw new Error("Account is not active");
    await this.sql`
      UPDATE capture_tokens SET revoked_at=coalesce(revoked_at,${input.requestedAt}::timestamptz)
      WHERE revoked_at IS NULL`;
    await this
      .sql`UPDATE session_metadata SET revoked_at=coalesce(revoked_at,${input.requestedAt}::timestamptz) WHERE revoked_at IS NULL`;
    await this.sql`DELETE FROM oauth_tokens`;
    await this.sql`DELETE FROM connector_oauth_states`;
    await this.sql`
      UPDATE job_queue SET cancellation_requested_at=${input.requestedAt}::timestamptz,
        cancellation_reason='account_deletion',
        status=CASE WHEN status='pending' THEN 'cancelled' ELSE status END,
        completed_at=CASE WHEN status='pending' THEN ${input.requestedAt}::timestamptz ELSE completed_at END,
        updated_at=${input.requestedAt}::timestamptz
      WHERE status IN ('pending','running')`;
    await this
      .sql`UPDATE publisher_queue SET status='failed',last_error='account_deletion' WHERE status='pending'`;
    const rows = await this.sql<Row[]>`
      INSERT INTO account_deletions
        (id,user_id,status,checkpoint,requested_at,purge_after,updated_at)
      VALUES (${input.id}::uuid,${this.context.userId}::uuid,'requested','{}'::jsonb,
        ${input.requestedAt}::timestamptz,${input.purgeAfter}::timestamptz,${input.requestedAt}::timestamptz)
      RETURNING *`;
    return { record: mapDeletion(rows[0])!, created: true };
  }

  async findDeletion() {
    return mapDeletion(
      (
        await this.sql<Row[]>`
      SELECT * FROM account_deletions ORDER BY requested_at DESC LIMIT 1`
      )[0]
    );
  }

  async cancelDeletion(input: {
    deletionId: string;
    actorId: string;
    reason: string;
    cancelledAt: string;
  }) {
    const rows = await this.sql<Row[]>`
      UPDATE account_deletions
      SET status='cancelled',cancelled_at=${input.cancelledAt}::timestamptz,
          cancelled_by_actor_id=${input.actorId}::uuid,cancellation_reason=${input.reason},
          updated_at=${input.cancelledAt}::timestamptz
      WHERE id=${input.deletionId}::uuid AND status IN ('requested','draining')
        AND purge_after>${input.cancelledAt}::timestamptz RETURNING *`;
    if (!rows[0]) return undefined;
    await this
      .sql`UPDATE users SET status='active',updated_at=${input.cancelledAt}::timestamptz WHERE id=${this.context.userId}::uuid AND status='deletion_pending'`;
    return mapDeletion(rows[0]);
  }

  async getUsage(input: { from: string; through: string }) {
    return (
      await this.sql<Row[]>`
      SELECT * FROM usage_counters
      WHERE billing_date>=${input.from}::date AND billing_date<=${input.through}::date
      ORDER BY billing_date,operation,provider`
    ).map(mapUsage);
  }

  async listQuotas(): Promise<UserQuota[]> {
    return (await this.sql<Row[]>`SELECT * FROM user_quotas ORDER BY quota_key`).map((row) => ({
      quotaKey: String(row.quota_key),
      period: row.period as UserQuota["period"],
      hardLimit: Number(row.hard_limit),
    }));
  }

  async consumeUsage(input: {
    date: string;
    operation: string;
    provider?: string;
    requestCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    costMicrousd?: number;
  }) {
    const provider = input.provider ?? "";
    const delta = {
      requestCount: input.requestCount ?? 0,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      costMicrousd: input.costMicrousd ?? 0,
    };
    if (Object.values(delta).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error("Usage deltas must be nonnegative safe integers");
    }
    await this
      .sql`SELECT pg_advisory_xact_lock(hashtext(${`usage:${this.context.userId}:${input.operation}`}))`;
    const quotas = await this.listQuotas();
    const quota = quotas.find(({ quotaKey }) => quotaKey === input.operation);
    const from = quota?.period === "month" ? `${input.date.slice(0, 7)}-01` : input.date;
    const [aggregate] = await this.sql<Array<{ count: number }>>`
      SELECT coalesce(sum(request_count),0)::bigint AS count FROM usage_counters
      WHERE operation=${input.operation} AND billing_date>=${from}::date AND billing_date<=${input.date}::date`;
    const allowed = !quota || Number(aggregate?.count ?? 0) + delta.requestCount <= quota.hardLimit;
    if (!allowed) {
      const current = (
        await this.sql<
          Row[]
        >`SELECT * FROM usage_counters WHERE billing_date=${input.date}::date AND operation=${input.operation} AND provider=${provider} LIMIT 1`
      )[0];
      return {
        allowed: false,
        counter: current
          ? mapUsage(current)
          : {
              date: input.date,
              operation: input.operation,
              provider,
              requestCount: 0,
              inputTokens: 0,
              outputTokens: 0,
              costMicrousd: 0,
            },
        quota,
      };
    }
    let rows = await this.sql<Row[]>`
      UPDATE usage_counters SET request_count=request_count+${delta.requestCount},
        input_tokens=input_tokens+${delta.inputTokens},output_tokens=output_tokens+${delta.outputTokens},
        cost_microusd=cost_microusd+${delta.costMicrousd},updated_at=now()
      WHERE billing_date=${input.date}::date AND operation=${input.operation} AND provider=${provider}
      RETURNING *`;
    if (!rows[0]) {
      rows = await this.sql<Row[]>`
        INSERT INTO usage_counters
          (user_id,billing_date,operation,provider,request_count,input_tokens,output_tokens,cost_microusd,updated_at)
        VALUES (${this.context.userId}::uuid,${input.date}::date,${input.operation},${provider},
          ${delta.requestCount},${delta.inputTokens},${delta.outputTokens},${delta.costMicrousd},now())
        RETURNING *`;
    }
    return { allowed: true, counter: mapUsage(rows[0]), ...(quota ? { quota } : {}) };
  }
}

export class PostgresControlPlaneLifecycleRepository implements ControlPlaneLifecycleRepository {
  constructor(
    private readonly sql: Sql,
    private readonly inTransaction = false
  ) {}

  async findDeletionVerification(deletionId: string): Promise<PurgeVerification | undefined> {
    const [row] = await this.sql<Row[]>`
      SELECT * FROM public.account_deletion_tombstones
      WHERE deletion_id=${deletionId}::uuid LIMIT 1`;
    if (!row) return undefined;
    return {
      deletionId: String(row.deletion_id),
      zeroRowCount: Number(row.zero_row_count),
      zeroObjectCount: Number(row.zero_object_count),
      authPurged: Boolean(row.auth_purged),
      verificationHash: String(row.verification_hash),
    };
  }

  async findDeletionWork(deletionId: string, userId: UserId) {
    return mapDeletion(
      (
        await this.sql<Row[]>`
      SELECT * FROM public.account_deletions WHERE id=${deletionId}::uuid AND user_id=${userId}::uuid LIMIT 1`
      )[0]
    );
  }

  async markDeletionPurging(deletionId: string, userId: UserId, at: string) {
    const rows = await this.sql`
      UPDATE public.account_deletions SET status='purging',started_at=coalesce(started_at,${at}::timestamptz),updated_at=${at}::timestamptz
      WHERE id=${deletionId}::uuid AND user_id=${userId}::uuid AND status IN ('requested','draining','failed') AND purge_after<=${at}::timestamptz RETURNING id`;
    return rows.length === 1;
  }

  async completeDeletion(input: {
    deletionId: string;
    userId: UserId;
    completedAt: string;
    zeroObjectCount: number;
    authPurged: boolean;
    actorId: string;
    requestId: string;
  }): Promise<PurgeVerification> {
    if (!this.inTransaction) {
      return this.sql.begin((transaction) =>
        new PostgresControlPlaneLifecycleRepository(
          transaction as unknown as Sql,
          true
        ).completeDeletion(input)
      );
    }
    if (input.zeroObjectCount !== 0 || !input.authPurged)
      throw new Error("Deletion verification is incomplete");
    const existing = await this.sql<
      Row[]
    >`SELECT * FROM public.account_deletion_tombstones WHERE deletion_id=${input.deletionId}::uuid`;
    if (existing[0]) {
      return {
        deletionId: String(existing[0].deletion_id),
        zeroRowCount: Number(existing[0].zero_row_count),
        zeroObjectCount: Number(existing[0].zero_object_count),
        authPurged: Boolean(existing[0].auth_purged),
        verificationHash: String(existing[0].verification_hash),
      };
    }
    await this.sql`DELETE FROM public.users WHERE id=${input.userId}::uuid`;
    let rowCount = 0;
    for (const table of tenantProtectedTables) {
      const predicate = table.ownerColumn === "id" ? "id" : "user_id";
      const rows = await this.sql.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::integer AS count FROM public."${table.table}" WHERE "${predicate}" = $1::uuid`,
        [input.userId]
      );
      rowCount += Number(rows[0]?.count ?? 0);
    }
    if (rowCount !== 0) throw new Error("Relational purge verification failed");
    const verificationHash = createHash("sha256")
      .update(`v1:${input.deletionId}:0:0:true`)
      .digest("hex");
    await this.sql`
      INSERT INTO public.account_deletion_tombstones
        (deletion_id,completed_at,verifier_version,zero_row_count,zero_object_count,auth_purged,verification_hash)
      VALUES (${input.deletionId}::uuid,${input.completedAt}::timestamptz,1,0,0,true,${verificationHash})`;
    await this.audit({
      id: randomUUID(),
      actorId: input.actorId,
      action: "account.delete",
      targetUserId: input.userId,
      reason: "retention_elapsed",
      requestId: input.requestId,
      outcome: "succeeded",
      metadata: { verifierVersion: 1 },
      at: input.completedAt,
    });
    return {
      deletionId: input.deletionId,
      zeroRowCount: 0,
      zeroObjectCount: 0,
      authPurged: true,
      verificationHash,
    };
  }

  async failDeletion(deletionId: string, userId: UserId, failureCode: string, at: string) {
    await this.sql`
      UPDATE public.account_deletions SET status='failed',failure_code=${failureCode},updated_at=${at}::timestamptz
      WHERE id=${deletionId}::uuid AND user_id=${userId}::uuid AND status='purging'`;
  }

  async suspendAccount(input: {
    userId: UserId;
    actorId: string;
    requestId: string;
    reason: string;
    at: string;
  }): Promise<boolean> {
    if (!this.inTransaction) {
      return this.sql.begin((transaction) =>
        new PostgresControlPlaneLifecycleRepository(
          transaction as unknown as Sql,
          true
        ).suspendAccount(input)
      );
    }
    const rows = await this.sql<Array<{ id: string; primary_email: string | null }>>`
      UPDATE public.users SET status='suspended',updated_at=${input.at}::timestamptz
      WHERE id=${input.userId}::uuid AND status='active' RETURNING id,primary_email`;
    if (!rows[0]) return false;
    await this
      .sql`UPDATE public.capture_tokens SET revoked_at=coalesce(revoked_at,${input.at}::timestamptz) WHERE user_id=${input.userId}::uuid`;
    await this
      .sql`UPDATE public.session_metadata SET revoked_at=coalesce(revoked_at,${input.at}::timestamptz) WHERE user_id=${input.userId}::uuid`;
    await this.sql`DELETE FROM public.oauth_tokens WHERE user_id=${input.userId}::uuid`;
    await this.sql`DELETE FROM public.connector_oauth_states WHERE user_id=${input.userId}::uuid`;
    if (rows[0].primary_email) {
      await this.sql`
        UPDATE public.invitations SET status='revoked',revoked_by_actor_id=${input.actorId}::uuid,
          revoke_reason=${input.reason},revoked_at=${input.at}::timestamptz
        WHERE normalized_email=${rows[0].primary_email} AND status='pending'`;
    }
    await this.sql`
      UPDATE public.job_queue SET cancellation_requested_at=${input.at}::timestamptz,
        cancellation_reason='account_suspension',status=CASE WHEN status='pending' THEN 'cancelled' ELSE status END,
        updated_at=${input.at}::timestamptz WHERE user_id=${input.userId}::uuid AND status IN ('pending','running')`;
    await this.audit({
      id: randomUUID(),
      actorId: input.actorId,
      action: "account.suspend",
      targetUserId: input.userId,
      reason: input.reason,
      requestId: input.requestId,
      outcome: "succeeded",
      at: input.at,
    });
    return true;
  }

  async audit(input: {
    id: string;
    actorId: string;
    action: string;
    targetUserId: UserId;
    reason: string;
    requestId: string;
    outcome: "succeeded" | "failed" | "no-op";
    metadata?: Record<string, string | number | boolean>;
    at: string;
  }) {
    if (!/^(account\.(suspend|delete|export|restore)|invitation\.revoke)$/u.test(input.action)) {
      throw new Error("Unsupported privileged audit action");
    }
    const targetHash = createHash("sha256").update(String(input.targetUserId)).digest("hex");
    await this.sql`
      INSERT INTO public.operator_audit_events
        (id,actor_id,action,target_user_hash,reason,request_id,outcome,metadata,created_at)
      VALUES (${input.id}::uuid,${input.actorId}::uuid,${input.action},${targetHash},${input.reason},
        ${input.requestId}::uuid,${input.outcome},${this.sql.json((input.metadata ?? {}) as never)},${input.at}::timestamptz)`;
  }
}

export const accountExportDatasetNames = EXPORT_DATASETS.map(([name]) => name);
