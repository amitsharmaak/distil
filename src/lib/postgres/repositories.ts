import type { Sql } from "postgres";
import type {
  AgentRepository,
  CaptureRepository,
  CaptureTokenRepository,
  CaptureTransition,
  ClaimRepository,
  AnnotationRecord,
  AnnotationRepository,
  ContentChunkRepository,
  ContentVersionRepository,
  CollectionItemRecord,
  CollectionRecord,
  CollectionRepository,
  DigestItemRecord,
  DigestRepository,
  DigestRunRecord,
  DigestRunWithItems,
  EmbeddingRepository,
  FeedbackRecord,
  FeedbackRepository,
  ItemFilters,
  ItemEventRecord,
  ItemEventRepository,
  ItemNoteRecord,
  ItemNoteRepository,
  ItemRepository,
  IntelligenceArtifactRepository,
  JobQueueRecord,
  JobQueueRepository,
  KnowledgeBackfillRepository,
  NewCaptureRecord,
  NotificationRepository,
  OAuthTokenRecord,
  OAuthTokenRepository,
  PublisherQueueRepository,
  RateLimitRepository,
  RawContentRepository,
  RepositorySet,
  ResearchReportRecord,
  ResearchRepository,
  ResearchSuggestionRecord,
  SettingsRepository,
  SummaryRecord,
  SummaryRepository,
} from "@/lib/repositories/ports";
import { sha256 } from "@/lib/knowledge/content-identity";
import type { IntelligenceArtifact } from "@/lib/knowledge/artifacts";
import type {
  ContentChunkRecord,
  GroundedClaim,
  ItemContentVersion,
  KnowledgeBackfillCheckpoint,
} from "@/lib/knowledge/types";
import type { ContentItem, Notification, Priority } from "@/lib/types";
import { userIdSchema } from "@/lib/contracts/tenant-context";
import { normalizeUrl } from "@/lib/utils";
import { mapCapture, mapCaptureToken, mapItem } from "./mappers";
import { PostgresAuthRepository } from "./auth-repository";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { PostgresFeedQuery } from "@/lib/feed/feed-query";
import { PostgresPassageSearchStore } from "@/lib/knowledge/retrieval";
import { tenantLockKey, withTenantLocks } from "./tenant-lock";
import { PostgresTenantLifecycleRepository } from "./lifecycle-repositories";
import { PostgresConnectorOAuthStateRepository } from "@/lib/connectors/oauth-state";

type Row = Record<string, unknown>;
const first = <T>(rows: T[]): T | undefined => rows[0];
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const nullableString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const mapJobQueueRecord = (row: Row): JobQueueRecord => ({
  ...row,
  user_id: userIdSchema.parse(row.user_id),
  id: String(row.id),
  job_type: String(row.job_type),
  idempotency_key: String(row.idempotency_key),
  payload:
    typeof row.payload === "string"
      ? (JSON.parse(row.payload) as Record<string, unknown>)
      : (row.payload as Record<string, unknown>),
  status: String(row.status),
});

class PostgresItems implements ItemRepository {
  constructor(private readonly sql: Sql) {}
  private async select(extra = this.sql``): Promise<ContentItem[]> {
    const rows = await this.sql<Row[]>`
      SELECT i.*, s.summary AS ai_summary_text FROM items i
      LEFT JOIN ai_summaries s ON s.item_id=i.id AND s.prompt_type='brief' ${extra}`;
    return rows.map(mapItem);
  }
  async list(f: ItemFilters = {}): Promise<ContentItem[]> {
    const conditions = [];
    if (f.sourceType) conditions.push(this.sql`i.source_type=${f.sourceType}`);
    if (f.contentType) conditions.push(this.sql`i.content_type=${f.contentType}`);
    if (f.priority) conditions.push(this.sql`i.priority=${f.priority}`);
    if (f.isRead !== undefined) conditions.push(this.sql`i.is_read=${f.isRead}`);
    if (!f.includeProcessing) conditions.push(this.sql`i.processing_status='ready'`);
    if (f.query?.trim())
      conditions.push(
        this.sql`i.search_vector @@ websearch_to_tsquery('english', ${f.query.trim()})`
      );
    const where = conditions.length
      ? this.sql`WHERE ${conditions.reduce((a, b) => this.sql`${a} AND ${b}`)}`
      : this.sql``;
    const order = f.query?.trim()
      ? this
          .sql`ORDER BY ts_rank(i.search_vector, websearch_to_tsquery('english', ${f.query.trim()})) DESC, i.created_at DESC`
      : f.sort === "priority"
        ? this
            .sql`ORDER BY CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.created_at DESC`
        : f.sort === "ai_priority"
          ? this.sql`ORDER BY COALESCE(i.ai_priority_score,0) DESC, i.created_at DESC`
          : this.sql`ORDER BY i.created_at DESC`;
    return this.select(
      this.sql`${where} ${order} LIMIT ${f.limit ?? 1000000} OFFSET ${f.offset ?? 0}`
    );
  }
  async findById(id: string) {
    return first(await this.select(this.sql`WHERE i.id=${id}`));
  }
  async findByNormalizedUrl(url: string) {
    return first(await this.select(this.sql`WHERE i.normalized_url=${normalizeUrl(url)}`));
  }
  async listRejected(limit = 50, offset = 0) {
    const count = await this.sql<
      { count: number }[]
    >`SELECT count(*)::int count FROM items WHERE processing_status='rejected'`;
    return {
      items: await this.select(
        this
          .sql`WHERE i.processing_status='rejected' ORDER BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}`
      ),
      total: first(count)?.count ?? 0,
    };
  }
  async insert(item: ContentItem): Promise<ContentItem> {
    const existing = await this.findByNormalizedUrl(item.url);
    if (existing) return existing;
    let rows: Row[];
    try {
      rows = await this.sql.begin(
        async (tx) =>
          await tx<
            Row[]
          >`INSERT INTO items (id,title,summary,full_content,source_type,content_type,topics,author,publication,url,normalized_url,priority,is_read,archived_at,read_at,last_opened_at,reading_progress,manual_priority,created_at,duration,thumbnail_url,extracted_links,content_extracted_at,processing_status,rejection_reason,content_classification,detected_media,information_density)
          VALUES (${item.id},${item.title},${item.summary},${item.fullContent ?? null},${item.sourceType},${item.contentType},${tx.json(item.topics)},${item.author ?? null},${item.publication ?? null},${item.url},${normalizeUrl(item.url)},${item.priority},${item.isRead},${item.archivedAt ?? null},${item.readAt ?? null},${item.lastOpenedAt ?? null},${item.readingProgress ?? 0},${item.manualPriority ?? null},${item.createdAt},${item.duration ?? null},${item.thumbnailUrl ?? null},${item.extractedLinks ? tx.json(item.extractedLinks as never) : null},${item.contentExtractedAt ?? null},${item.processingStatus ?? "ready"},${item.rejectionReason ?? null},${item.contentClassification ? tx.json(item.contentClassification as never) : null},${item.detectedMedia ? tx.json(item.detectedMedia as never) : null},${item.informationDensity ?? null})
          RETURNING id`
      );
    } catch (error) {
      // Security-barrier tenant views cannot use insert conflict clauses. A
      // savepoint contains the unique race, then the tenant-scoped lookup wins.
      const concurrent = await this.findByNormalizedUrl(item.url);
      if (concurrent) return concurrent;
      throw error;
    }
    return (await this.findById(String(rows[0].id)))!;
  }
  async update(id: string, patch: Partial<ContentItem>) {
    const old = await this.findById(id);
    if (!old) return undefined;
    const v = { ...old, ...patch };
    await this
      .sql`UPDATE items SET title=${v.title},summary=${v.summary},full_content=${v.fullContent ?? null},source_type=${v.sourceType},content_type=${v.contentType},topics=${this.sql.json(v.topics)},author=${v.author ?? null},publication=${v.publication ?? null},url=${v.url},normalized_url=${normalizeUrl(v.url)},priority=${v.priority},is_read=${v.isRead},archived_at=${v.archivedAt ?? null},read_at=${v.readAt ?? null},last_opened_at=${v.lastOpenedAt ?? null},reading_progress=${v.readingProgress ?? 0},manual_priority=${v.manualPriority ?? null},created_at=${v.createdAt},duration=${v.duration ?? null},thumbnail_url=${v.thumbnailUrl ?? null},extracted_links=${v.extractedLinks ? this.sql.json(v.extractedLinks as never) : null},content_extracted_at=${v.contentExtractedAt ?? null},processing_status=${v.processingStatus ?? "ready"},rejection_reason=${v.rejectionReason ?? null},content_classification=${v.contentClassification ? this.sql.json(v.contentClassification as never) : null},detected_media=${v.detectedMedia ? this.sql.json(v.detectedMedia as never) : null},information_density=${v.informationDensity ?? null} WHERE id=${id}`;
    return this.findById(id);
  }
  async delete(id: string) {
    return (await this.sql`DELETE FROM items WHERE id=${id} RETURNING id`).length > 0;
  }
  async updateProcessingStatus(
    id: string,
    status: "processing" | "ready" | "rejected",
    rejectionReason?: string
  ) {
    await this
      .sql`UPDATE items SET processing_status=${status},rejection_reason=${rejectionReason ?? null} WHERE id=${id}`;
  }
  async updatePriorityScore(id: string, score: number, priority: Priority) {
    await this.sql`UPDATE items SET ai_priority_score=${score},priority=${priority} WHERE id=${id}`;
  }
}

class PostgresItemNotes implements ItemNoteRepository {
  constructor(private readonly sql: Sql) {}
  private map(row: Row): ItemNoteRecord {
    return {
      itemId: String(row.item_id),
      body: String(row.body),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }
  async find(itemId: string) {
    const rows = await this.sql<Row[]>`SELECT * FROM item_notes WHERE item_id=${itemId}`;
    return rows[0] ? this.map(rows[0]) : undefined;
  }
  async upsert(record: ItemNoteRecord) {
    return withTenantLocks(this.sql, [tenantLockKey("item-note", record.itemId)], async (tx) => {
      const updated = await tx<Row[]>`
        UPDATE item_notes SET body=${record.body},updated_at=${record.updatedAt}
        WHERE item_id=${record.itemId}
        RETURNING *
      `;
      if (updated[0]) return this.map(updated[0]);
      const inserted = await tx<Row[]>`
        INSERT INTO item_notes(item_id,body,created_at,updated_at)
        VALUES(${record.itemId},${record.body},${record.createdAt},${record.updatedAt})
        RETURNING *
      `;
      return this.map(inserted[0]);
    });
  }
  async delete(itemId: string) {
    return (
      (await this.sql`DELETE FROM item_notes WHERE item_id=${itemId} RETURNING item_id`).length > 0
    );
  }
}

class PostgresAnnotations implements AnnotationRepository {
  constructor(private readonly sql: Sql) {}
  private map(row: Row): AnnotationRecord {
    return {
      id: String(row.id),
      itemId: String(row.item_id),
      selectedQuote: String(row.selected_quote),
      prefix: String(row.prefix),
      suffix: String(row.suffix),
      startOffset: row.start_offset == null ? undefined : Number(row.start_offset),
      endOffset: row.end_offset == null ? undefined : Number(row.end_offset),
      contentHash: String(row.content_hash),
      contentVersion: String(row.content_version),
      comment: row.comment == null ? undefined : String(row.comment),
      status: row.status as AnnotationRecord["status"],
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }
  async listForItem(itemId: string) {
    return (
      await this.sql<
        Row[]
      >`SELECT * FROM annotations WHERE item_id=${itemId} ORDER BY created_at ASC`
    ).map((row) => this.map(row));
  }
  async create(record: AnnotationRecord) {
    const rows = await this.sql<Row[]>`
      INSERT INTO annotations(id,item_id,selected_quote,prefix,suffix,start_offset,end_offset,content_hash,content_version,comment,status,created_at,updated_at)
      VALUES(${record.id},${record.itemId},${record.selectedQuote},${record.prefix},${record.suffix},${record.startOffset ?? null},${record.endOffset ?? null},${record.contentHash},${record.contentVersion},${record.comment ?? null},${record.status},${record.createdAt},${record.updatedAt}) RETURNING *`;
    return this.map(rows[0]);
  }
  async update(id: string, patch: Parameters<AnnotationRepository["update"]>[1]) {
    const current = first(await this.sql<Row[]>`SELECT * FROM annotations WHERE id=${id}`);
    if (!current) return undefined;
    const value = { ...this.map(current), ...patch };
    const rows = await this.sql<Row[]>`
      UPDATE annotations SET selected_quote=${value.selectedQuote},prefix=${value.prefix},suffix=${value.suffix},start_offset=${value.startOffset ?? null},end_offset=${value.endOffset ?? null},content_hash=${value.contentHash},content_version=${value.contentVersion},comment=${value.comment ?? null},status=${value.status},updated_at=${value.updatedAt}
      WHERE id=${id} RETURNING *`;
    return rows[0] ? this.map(rows[0]) : undefined;
  }
  async delete(id: string) {
    return (await this.sql`DELETE FROM annotations WHERE id=${id} RETURNING id`).length > 0;
  }
}

class PostgresCollections implements CollectionRepository {
  constructor(private readonly sql: Sql) {}
  private map(row: Row): CollectionRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      description: row.description == null ? undefined : String(row.description),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }
  private mapItem(row: Row): CollectionItemRecord {
    return {
      collectionId: String(row.collection_id),
      itemId: String(row.item_id),
      position: Number(row.position),
      addedAt: iso(row.added_at),
    };
  }
  async list() {
    return (await this.sql<Row[]>`SELECT * FROM collections ORDER BY created_at ASC`).map((row) =>
      this.map(row)
    );
  }
  async find(id: string) {
    const rows = await this.sql<Row[]>`SELECT * FROM collections WHERE id=${id}`;
    return rows[0] ? this.map(rows[0]) : undefined;
  }
  async create(record: CollectionRecord) {
    const rows = await this.sql<Row[]>`
      INSERT INTO collections(id,name,description,created_at,updated_at)
      VALUES(${record.id},${record.name},${record.description ?? null},${record.createdAt},${record.updatedAt}) RETURNING *`;
    return this.map(rows[0]);
  }
  async update(id: string, patch: Parameters<CollectionRepository["update"]>[1]) {
    const current = await this.find(id);
    if (!current) return undefined;
    const value = { ...current, ...patch };
    const rows = await this.sql<Row[]>`
      UPDATE collections SET name=${value.name},description=${value.description ?? null},updated_at=${value.updatedAt}
      WHERE id=${id} RETURNING *`;
    return rows[0] ? this.map(rows[0]) : undefined;
  }
  async delete(id: string) {
    return (await this.sql`DELETE FROM collections WHERE id=${id} RETURNING id`).length > 0;
  }
  async addItem(record: CollectionItemRecord) {
    return withTenantLocks(
      this.sql,
      [tenantLockKey("collection-item", record.collectionId, record.itemId)],
      async (tx) => {
        const updated = await tx<Row[]>`
          UPDATE collection_items SET position=${record.position}
          WHERE collection_id=${record.collectionId} AND item_id=${record.itemId}
          RETURNING *
        `;
        if (updated[0]) return this.mapItem(updated[0]);
        const inserted = await tx<Row[]>`
          INSERT INTO collection_items(collection_id,item_id,position,added_at)
          VALUES(${record.collectionId},${record.itemId},${record.position},${record.addedAt})
          RETURNING *
        `;
        return this.mapItem(inserted[0]);
      }
    );
  }
  async removeItem(collectionId: string, itemId: string) {
    return (
      (
        await this
          .sql`DELETE FROM collection_items WHERE collection_id=${collectionId} AND item_id=${itemId} RETURNING item_id`
      ).length > 0
    );
  }
  async listItems(collectionId: string) {
    return (
      await this.sql<Row[]>`
        SELECT * FROM collection_items WHERE collection_id=${collectionId}
        ORDER BY position ASC,added_at ASC,item_id ASC`
    ).map((row) => this.mapItem(row));
  }
}

class PostgresItemEvents implements ItemEventRepository {
  constructor(private readonly sql: Sql) {}
  private map(row: Row): ItemEventRecord {
    return {
      id: String(row.id),
      eventKey: String(row.event_key),
      itemId: String(row.item_id),
      eventType: row.event_type as ItemEventRecord["eventType"],
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      occurredAt: iso(row.occurred_at),
    };
  }
  async append(record: ItemEventRecord) {
    return withTenantLocks(
      this.sql,
      [tenantLockKey("item-event-id", record.id), tenantLockKey("item-event-key", record.eventKey)],
      async (tx) => {
        const existing = first(
          await tx<Row[]>`SELECT * FROM item_events WHERE event_key=${record.eventKey}`
        );
        if (existing) return this.map(existing);
        const inserted = await tx<Row[]>`
          INSERT INTO item_events(id,event_key,item_id,event_type,metadata,occurred_at)
          VALUES(${record.id},${record.eventKey},${record.itemId},${record.eventType},${tx.json(record.metadata as never)},${record.occurredAt})
          RETURNING *
        `;
        return this.map(inserted[0]);
      }
    );
  }
  async listForItem(itemId: string, limit = 100) {
    return (
      await this.sql<Row[]>`
        SELECT * FROM item_events WHERE item_id=${itemId}
        ORDER BY occurred_at DESC,id DESC LIMIT ${limit}`
    ).map((row) => this.map(row));
  }
}

class PostgresDigests implements DigestRepository {
  constructor(private readonly sql: Sql) {}
  private mapRun(row: Row): DigestRunRecord {
    return {
      id: String(row.id),
      digestDate: String(row.digest_date),
      status: row.status as DigestRunRecord["status"],
      createdAt: iso(row.created_at),
      completedAt: row.completed_at == null ? undefined : iso(row.completed_at),
      dismissedAt: row.dismissed_at == null ? undefined : iso(row.dismissed_at),
    };
  }
  private mapItem(row: Row): DigestItemRecord {
    return {
      digestRunId: String(row.digest_run_id),
      itemId: String(row.item_id),
      category: row.category as DigestItemRecord["category"],
      position: Number(row.position),
      reason: String(row.reason),
    };
  }
  private async hydrate(run: DigestRunRecord, sql: Sql = this.sql): Promise<DigestRunWithItems> {
    const rows = await sql<Row[]>`
      SELECT * FROM digest_items WHERE digest_run_id=${run.id} ORDER BY position ASC`;
    return { ...run, items: rows.map((row) => this.mapItem(row)) };
  }
  async create(run: DigestRunRecord, items: DigestItemRecord[] = []) {
    if (items.some((item) => item.digestRunId !== run.id)) {
      throw new Error("Digest item belongs to another run");
    }
    return withTenantLocks(
      this.sql,
      [tenantLockKey("digest-id", run.id), tenantLockKey("digest-date", run.digestDate)],
      async (tx) => {
        const existing = first(
          await tx<Row[]>`SELECT * FROM digest_runs WHERE digest_date=${run.digestDate}`
        );
        if (existing) return this.hydrate(this.mapRun(existing), tx);
        await tx`
        INSERT INTO digest_runs(id,digest_date,local_date,status,created_at,completed_at,dismissed_at)
        VALUES(${run.id},${run.digestDate},${run.digestDate},${run.status},${run.createdAt},${run.completedAt ?? null},${run.dismissedAt ?? null})
      `;
        for (const item of items) {
          await tx`
            INSERT INTO digest_items(digest_run_id,item_id,category,position,reason)
            VALUES(${item.digestRunId},${item.itemId},${item.category},${item.position},${item.reason})`;
        }
        return { ...run, items: [...items].sort((a, b) => a.position - b.position) };
      }
    );
  }
  async findByDate(digestDate: string) {
    const row = first(
      await this.sql<Row[]>`SELECT * FROM digest_runs WHERE digest_date=${digestDate}`
    );
    return row ? this.hydrate(this.mapRun(row)) : undefined;
  }
  async list(limit = 30) {
    const rows = await this.sql<Row[]>`
      SELECT * FROM digest_runs ORDER BY digest_date DESC LIMIT ${limit}`;
    return Promise.all(rows.map((row) => this.hydrate(this.mapRun(row))));
  }
  async updateStatus(id: string, status: DigestRunRecord["status"], at: string) {
    const rows = await this.sql<Row[]>`
      UPDATE digest_runs SET status=${status},completed_at=${at} WHERE id=${id} RETURNING *`;
    return rows[0] ? this.hydrate(this.mapRun(rows[0])) : undefined;
  }
  async dismiss(id: string, at: string) {
    const rows = await this.sql<Row[]>`
      UPDATE digest_runs SET dismissed_at=${at} WHERE id=${id} RETURNING *`;
    return rows[0] ? this.hydrate(this.mapRun(rows[0])) : undefined;
  }
}

class PostgresCaptures implements CaptureRepository {
  constructor(private readonly sql: Sql) {}
  async create(v: NewCaptureRecord) {
    if (!v.userId || !v.originActorKind || !v.originActorId) {
      throw new Error("Tenant identity is required to create a capture");
    }
    const rows = await this.sql<
      Row[]
    >`INSERT INTO capture_requests (user_id,id,url,normalized_url,title,notes,topics,priority,source,origin_actor_kind,origin_actor_id,status,created_at,updated_at)
      VALUES (${v.userId},${v.id},${v.url},${v.normalizedUrl},${v.title ?? null},${v.notes ?? null},${this.sql.json(v.topics)},${v.priority},${v.source},${v.originActorKind},${v.originActorId},'queued',${v.createdAt},${v.createdAt}) RETURNING *`;
    return mapCapture(rows[0]);
  }
  async findById(id: string) {
    const r = await this.sql<Row[]>`SELECT * FROM capture_requests WHERE id=${id}`;
    return r[0] ? mapCapture(r[0]) : undefined;
  }
  async findActiveOrReadyByNormalizedUrl(url: string) {
    const r = await this.sql<
      Row[]
    >`SELECT * FROM capture_requests WHERE normalized_url=${url} AND status IN ('queued','processing','ready') ORDER BY created_at ASC LIMIT 1`;
    return r[0] ? mapCapture(r[0]) : undefined;
  }
  async list(limit = 50) {
    return (
      await this.sql<Row[]>`SELECT * FROM capture_requests ORDER BY created_at DESC LIMIT ${limit}`
    ).map(mapCapture);
  }
  async transition(id: string, allowed: readonly string[], t: CaptureTransition) {
    if (!allowed.length) return undefined;
    const rows = await this.sql<
      Row[]
    >`UPDATE capture_requests SET status=${t.status},item_id=COALESCE(${t.itemId ?? null},item_id),retryable=COALESCE(${t.retryable ?? null},retryable),attempts=COALESCE(${t.attempts ?? null},attempts),last_error_code=${t.errorCode ?? null},last_error_message=${t.errorMessage ?? null},updated_at=${t.updatedAt} WHERE id=${id} AND status IN ${this.sql(allowed)} RETURNING *`;
    return rows[0] ? mapCapture(rows[0]) : undefined;
  }
}

class PostgresCaptureTokens implements CaptureTokenRepository {
  constructor(private readonly sql: Sql) {}
  async create(v: Parameters<CaptureTokenRepository["create"]>[0]) {
    await this
      .sql`INSERT INTO capture_tokens (user_id,id,name,token_hash,token_prefix,created_at,last_used_at,revoked_at) VALUES (${v.userId},${v.id},${v.name},${v.tokenHash},${v.tokenPrefix},${v.createdAt},${v.lastUsedAt ?? null},${v.revokedAt ?? null})`;
  }
  async findActiveByHash(hash: string) {
    const r = await this.sql<
      Row[]
    >`SELECT * FROM capture_tokens WHERE token_hash=${hash} AND revoked_at IS NULL`;
    return r[0] ? mapCaptureToken(r[0]) : undefined;
  }
  async list() {
    return (await this.sql<Row[]>`SELECT * FROM capture_tokens ORDER BY created_at DESC`).map(
      (row) => ({
        userId: userIdSchema.parse(row.user_id),
        id: String(row.id),
        name: String(row.name),
        tokenPrefix: String(row.token_prefix),
        createdAt: iso(row.created_at),
        lastUsedAt: row.last_used_at == null ? undefined : iso(row.last_used_at),
        revokedAt: row.revoked_at == null ? undefined : iso(row.revoked_at),
      })
    );
  }
  async revoke(id: string, at: string) {
    return (
      (
        await this
          .sql`UPDATE capture_tokens SET revoked_at=${at} WHERE id=${id} AND revoked_at IS NULL RETURNING id`
      ).length > 0
    );
  }
  async touchLastUsed(id: string, at: string) {
    await this
      .sql`UPDATE capture_tokens SET last_used_at=${at} WHERE id=${id} AND revoked_at IS NULL`;
  }
}

class PostgresRateLimits implements RateLimitRepository {
  constructor(private readonly sql: Sql) {}
  async consume(v: Parameters<RateLimitRepository["consume"]>[0]) {
    const now = new Date(v.now);
    const start = new Date(
      Math.floor(now.getTime() / (v.windowSeconds * 1000)) * v.windowSeconds * 1000
    ).toISOString();
    const environment = v.environment ?? "runtime";
    const principalKind = v.principalKind ?? "system";
    const principalId = v.principalId ?? "legacy";
    const operation = v.operation ?? "rate-limit";
    if (!v.userId) {
      let legacyRows = await this.sql<{ count: number }[]>`
        UPDATE rate_limit_windows SET count=count+1
        WHERE key=${v.key} AND window_start=${start} AND window_seconds=${v.windowSeconds}
        RETURNING count`;
      if (!legacyRows[0]) {
        try {
          legacyRows = await this.sql.begin(
            async (tx) =>
              await tx<{ count: number }[]>`
              INSERT INTO rate_limit_windows (key,window_start,window_seconds,count)
              VALUES (${v.key},${start},${v.windowSeconds},1) RETURNING count`
          );
        } catch (error) {
          legacyRows = await this.sql<{ count: number }[]>`
            UPDATE rate_limit_windows SET count=count+1
            WHERE key=${v.key} AND window_start=${start} AND window_seconds=${v.windowSeconds}
            RETURNING count`;
          if (!legacyRows[0]) throw error;
        }
      }
      const count = legacyRows[0].count;
      return {
        allowed: count <= v.limit,
        remaining: Math.max(0, v.limit - count),
        resetAt: new Date(new Date(start).getTime() + v.windowSeconds * 1000).toISOString(),
      };
    }
    let rows = await this.sql<{ count: number }[]>`
      UPDATE rate_limit_windows
      SET count=count+1
      WHERE key=${v.key} AND environment=${environment}
        AND principal_kind=${principalKind} AND principal_id=${principalId}
        AND operation=${operation} AND window_start=${start}
        AND window_seconds=${v.windowSeconds}
      RETURNING count`;
    if (!rows[0]) {
      try {
        rows = await this.sql.begin(async (tx) =>
          v.userId
            ? await tx<{ count: number }[]>`
                INSERT INTO rate_limit_windows (user_id,key,environment,principal_kind,principal_id,operation,window_start,window_seconds,count)
                VALUES (${v.userId},${v.key},${environment},${principalKind},${principalId},${operation},${start},${v.windowSeconds},1)
                RETURNING count`
            : await tx<{ count: number }[]>`
                INSERT INTO rate_limit_windows (key,environment,principal_kind,principal_id,operation,window_start,window_seconds,count)
                VALUES (${v.key},${environment},${principalKind},${principalId},${operation},${start},${v.windowSeconds},1)
                RETURNING count`
        );
      } catch (error) {
        rows = await this.sql<{ count: number }[]>`
          UPDATE rate_limit_windows
          SET count=count+1
          WHERE key=${v.key} AND environment=${environment}
            AND principal_kind=${principalKind} AND principal_id=${principalId}
            AND operation=${operation} AND window_start=${start}
            AND window_seconds=${v.windowSeconds}
          RETURNING count`;
        if (!rows[0]) throw error;
      }
    }
    const count = rows[0].count;
    return {
      allowed: count <= v.limit,
      remaining: Math.max(0, v.limit - count),
      resetAt: new Date(new Date(start).getTime() + v.windowSeconds * 1000).toISOString(),
    };
  }
}

class PostgresOAuth implements OAuthTokenRepository {
  constructor(private readonly sql: Sql) {}
  private map(r: Row): OAuthTokenRecord {
    return {
      provider: String(r.provider),
      teamId: String(r.team_id),
      accessToken: String(r.access_token),
      refreshToken: r.refresh_token == null ? undefined : String(r.refresh_token),
      expiryDate: r.expiry_date == null ? undefined : Number(r.expiry_date),
      email: r.email == null ? undefined : String(r.email),
      updatedAt: iso(r.updated_at),
    };
  }
  async find(provider: string, teamId?: string) {
    const r =
      teamId === undefined
        ? await this.sql<
            Row[]
          >`SELECT * FROM oauth_tokens WHERE provider=${provider} ORDER BY updated_at DESC LIMIT 1`
        : await this.sql<
            Row[]
          >`SELECT * FROM oauth_tokens WHERE provider=${provider} AND team_id=${teamId}`;
    return r[0] ? this.map(r[0]) : undefined;
  }
  async listByProvider(provider: string) {
    return (
      await this.sql<
        Row[]
      >`SELECT * FROM oauth_tokens WHERE provider=${provider} ORDER BY updated_at DESC`
    ).map((r) => this.map(r));
  }
  async upsert(v: OAuthTokenRecord) {
    await withTenantLocks(
      this.sql,
      [tenantLockKey("oauth-token", v.provider, v.teamId)],
      async (tx) => {
        const updated = await tx`
          UPDATE oauth_tokens
          SET access_token=${v.accessToken},refresh_token=${v.refreshToken ?? null},
              expiry_date=${v.expiryDate ?? null},email=${v.email ?? null},updated_at=${v.updatedAt}
          WHERE provider=${v.provider} AND team_id=${v.teamId}
          RETURNING provider
        `;
        if (updated[0]) return;
        await tx`
          INSERT INTO oauth_tokens
            (provider,team_id,access_token,refresh_token,expiry_date,email,updated_at)
          VALUES
            (${v.provider},${v.teamId},${v.accessToken},${v.refreshToken ?? null},
             ${v.expiryDate ?? null},${v.email ?? null},${v.updatedAt})
        `;
      }
    );
  }
  async delete(provider: string, teamId?: string) {
    if (teamId === undefined) await this.sql`DELETE FROM oauth_tokens WHERE provider=${provider}`;
    else await this.sql`DELETE FROM oauth_tokens WHERE provider=${provider} AND team_id=${teamId}`;
  }
}

class PostgresSummaries implements SummaryRepository {
  constructor(private readonly sql: Sql) {}
  private map(r: Row): SummaryRecord {
    return {
      id: String(r.id),
      itemId: String(r.item_id),
      summary: String(r.summary),
      model: String(r.model),
      promptType: String(r.prompt_type),
      createdAt: iso(r.created_at),
    };
  }
  async find(id: string, type?: "brief" | "detailed") {
    const r = type
      ? await this.sql<
          Row[]
        >`SELECT * FROM ai_summaries WHERE item_id=${id} AND prompt_type=${type}`
      : await this.sql<
          Row[]
        >`SELECT * FROM ai_summaries WHERE item_id=${id} ORDER BY created_at DESC LIMIT 1`;
    return r[0] ? this.map(r[0]) : undefined;
  }
  async findAll(id: string) {
    const r = await this.sql<
      Row[]
    >`SELECT summary,prompt_type FROM ai_summaries WHERE item_id=${id}`;
    const out: { brief?: string; detailed?: string } = {};
    for (const x of r)
      if (x.prompt_type === "brief") out.brief = String(x.summary);
      else if (x.prompt_type === "detailed") out.detailed = String(x.summary);
    return out;
  }
  async upsert(v: Omit<SummaryRecord, "createdAt">) {
    return withTenantLocks(
      this.sql,
      [
        tenantLockKey("summary-id", v.id),
        tenantLockKey("summary-item-prompt", v.itemId, v.promptType),
      ],
      async (tx) => {
        const updated = await tx<Row[]>`
          UPDATE ai_summaries
          SET id=${v.id},summary=${v.summary},model=${v.model},created_at=now()
          WHERE item_id=${v.itemId} AND prompt_type=${v.promptType}
          RETURNING *
        `;
        if (updated[0]) return this.map(updated[0]);
        const inserted = await tx<Row[]>`
          INSERT INTO ai_summaries (id,item_id,summary,model,prompt_type,created_at)
          VALUES (${v.id},${v.itemId},${v.summary},${v.model},${v.promptType},now())
          RETURNING *
        `;
        return this.map(inserted[0]);
      }
    );
  }
  async deleteForItem(id: string) {
    await this.sql`DELETE FROM ai_summaries WHERE item_id=${id}`;
  }
}

class PostgresFeedback implements FeedbackRepository {
  constructor(private readonly sql: Sql) {}
  private map(r: Row): FeedbackRecord {
    return {
      id: String(r.id),
      itemId: String(r.item_id),
      rating: Number(r.rating),
      reason: r.reason == null ? undefined : String(r.reason),
      createdAt: iso(r.created_at),
    };
  }
  async insert(v: Omit<FeedbackRecord, "createdAt">) {
    const r = await this.sql<
      Row[]
    >`INSERT INTO feedback(id,item_id,rating,reason,created_at) VALUES(${v.id},${v.itemId},${v.rating},${v.reason ?? null},now()) RETURNING *`;
    return this.map(r[0]);
  }
  async findForItem(id: string) {
    const r = await this.sql<
      Row[]
    >`SELECT * FROM feedback WHERE item_id=${id} ORDER BY created_at DESC LIMIT 1`;
    return r[0] ? this.map(r[0]) : undefined;
  }
  async list() {
    return (await this.sql<Row[]>`SELECT * FROM feedback ORDER BY created_at DESC`).map((r) =>
      this.map(r)
    );
  }
}

class PostgresResearch implements ResearchRepository {
  constructor(private readonly sql: Sql) {}
  private report(r: Row): ResearchReportRecord {
    return {
      id: String(r.id),
      itemId: r.item_id == null ? undefined : String(r.item_id),
      query: String(r.query),
      report: String(r.report),
      sources: String(r.sources),
      model: String(r.model),
      status: String(r.status),
      createdAt: iso(r.created_at),
      completedAt: r.completed_at == null ? undefined : iso(r.completed_at),
      progress: r.progress == null ? undefined : String(r.progress),
    };
  }
  private suggestion(r: Row): ResearchSuggestionRecord {
    return {
      id: String(r.id),
      topicKey: String(r.topic_key),
      topic: String(r.topic),
      reason: String(r.reason),
      suggestedQuery: String(r.suggested_query),
      sourceItemIds: (r.source_item_ids ?? []) as string[],
      status: String(r.status),
      researchReportId: r.research_report_id == null ? undefined : String(r.research_report_id),
      createdAt: iso(r.created_at),
    };
  }
  async insertReport(
    v: Pick<ResearchReportRecord, "id" | "query" | "model"> & { itemId?: string }
  ) {
    const r = await this.sql<
      Row[]
    >`INSERT INTO research_reports(id,item_id,query,model,created_at) VALUES(${v.id},${v.itemId ?? null},${v.query},${v.model},now()) RETURNING *`;
    return this.report(r[0]);
  }
  async findReport(id: string) {
    const r = await this.sql<Row[]>`SELECT * FROM research_reports WHERE id=${id}`;
    return r[0] ? this.report(r[0]) : undefined;
  }
  async updateReport(
    id: string,
    p: Partial<
      Pick<ResearchReportRecord, "report" | "sources" | "status" | "completedAt" | "progress">
    >
  ) {
    const old = await this.findReport(id);
    if (!old) return undefined;
    const r = await this.sql<
      Row[]
    >`UPDATE research_reports SET report=${p.report ?? old.report},sources=${p.sources ?? old.sources},status=${p.status ?? old.status},completed_at=${p.completedAt ?? old.completedAt ?? null},progress=${p.progress !== undefined ? p.progress : (old.progress ?? null)} WHERE id=${id} RETURNING *`;
    return this.report(r[0]);
  }
  async listReports(limit = 20) {
    return (
      await this.sql<Row[]>`SELECT * FROM research_reports ORDER BY created_at DESC LIMIT ${limit}`
    ).map((r) => this.report(r));
  }
  async listPendingSuggestions() {
    return (
      await this.sql<
        Row[]
      >`SELECT * FROM research_suggestions WHERE status='pending' ORDER BY created_at DESC`
    ).map((r) => this.suggestion(r));
  }
  async findSuggestion(id: string) {
    const r = await this.sql<Row[]>`SELECT * FROM research_suggestions WHERE id=${id}`;
    return r[0] ? this.suggestion(r[0]) : undefined;
  }
  async replacePendingSuggestions(
    v: Array<Omit<ResearchSuggestionRecord, "status" | "createdAt" | "researchReportId">>
  ) {
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM research_suggestions WHERE status='pending'`;
      for (const x of v)
        await tx`INSERT INTO research_suggestions(id,topic_key,topic,reason,suggested_query,source_item_ids,status,created_at) VALUES(${x.id},${x.topicKey},${x.topic},${x.reason},${x.suggestedQuery},${tx.json(x.sourceItemIds)},'pending',now())`;
    });
  }
  async dismissSuggestion(id: string) {
    return (
      (
        await this
          .sql`UPDATE research_suggestions SET status='dismissed' WHERE id=${id} AND status='pending' RETURNING id`
      ).length > 0
    );
  }
  async markSuggestionStarted(id: string, rid: string) {
    return (
      (
        await this
          .sql`UPDATE research_suggestions SET status='started',research_report_id=${rid} WHERE id=${id} AND status='pending' RETURNING id`
      ).length > 0
    );
  }
}

class PostgresSettings implements SettingsRepository {
  constructor(private readonly sql: Sql) {}
  async get(key: string) {
    return first(
      await this.sql<{ value: string }[]>`SELECT value FROM user_settings WHERE key=${key}`
    )?.value;
  }
  async set(key: string, value: string) {
    await withTenantLocks(this.sql, [tenantLockKey("user-setting", key)], async (tx) => {
      const updated = await tx`
        UPDATE user_settings SET value=${value},updated_at=now()
        WHERE key=${key}
        RETURNING key
      `;
      if (updated[0]) return;
      await tx`INSERT INTO user_settings(key,value,updated_at) VALUES(${key},${value},now())`;
    });
  }
}
class PostgresNotifications implements NotificationRepository {
  constructor(private readonly sql: Sql) {}
  async insert(v: Pick<Notification, "id" | "itemId" | "title" | "message">) {
    await this
      .sql`INSERT INTO notifications(id,item_id,title,message,created_at) VALUES(${v.id},${v.itemId},${v.title},${v.message},now())`;
  }
  async find(id: string) {
    const row = first(await this.sql<Row[]>`SELECT * FROM notifications WHERE id=${id}`);
    return row
      ? {
          id: String(row.id),
          itemId: String(row.item_id),
          title: String(row.title),
          message: String(row.message),
          isRead: Boolean(row.is_read),
          createdAt: iso(row.created_at),
        }
      : undefined;
  }
  async list(limit = 20) {
    return (
      await this.sql<Row[]>`SELECT * FROM notifications ORDER BY created_at DESC LIMIT ${limit}`
    ).map((r) => ({
      id: String(r.id),
      itemId: String(r.item_id),
      title: String(r.title),
      message: String(r.message),
      isRead: Boolean(r.is_read),
      createdAt: iso(r.created_at),
    }));
  }
  async unreadCount() {
    return (
      first(
        await this.sql<
          { count: number }[]
        >`SELECT count(*)::int count FROM notifications WHERE NOT is_read`
      )?.count ?? 0
    );
  }
  async markRead(id: string) {
    await this.sql`UPDATE notifications SET is_read=true WHERE id=${id}`;
  }
  async markAllRead() {
    await this.sql`UPDATE notifications SET is_read=true WHERE NOT is_read`;
  }
}
class PostgresEmbeddings implements EmbeddingRepository {
  constructor(private readonly sql: Sql) {}
  async find(id: string) {
    const r = first(await this.sql<Row[]>`SELECT * FROM item_embeddings WHERE item_id=${id}`);
    return r
      ? {
          itemId: String(r.item_id),
          embedding: r.embedding as number[],
          model: String(r.model),
          createdAt: iso(r.created_at),
        }
      : undefined;
  }
  async upsert(id: string, e: number[], model: string) {
    await withTenantLocks(this.sql, [tenantLockKey("item-embedding", id)], async (tx) => {
      const updated = await tx`
        UPDATE item_embeddings
        SET embedding=${tx.json(e)},model=${model},created_at=now()
        WHERE item_id=${id}
        RETURNING item_id
      `;
      if (updated[0]) return;
      await tx`
        INSERT INTO item_embeddings(item_id,embedding,model,created_at)
        VALUES(${id},${tx.json(e)},${model},now())
      `;
    });
  }
  async listRecent(days = 30) {
    const r = await this.sql<
      Row[]
    >`SELECT item_id,embedding FROM item_embeddings WHERE created_at > now()-(${days}*interval '1 day') ORDER BY created_at DESC`;
    return r.map((x) => ({ itemId: String(x.item_id), embedding: x.embedding as number[] }));
  }
}
class PostgresRawContent implements RawContentRepository {
  constructor(private readonly sql: Sql) {}
  async insert(v: Parameters<RawContentRepository["insert"]>[0]) {
    const columns = v.userId
      ? this.sql`(user_id,id,item_id,source_type,raw_body,metadata,fetched_at)`
      : this.sql`(id,item_id,source_type,raw_body,metadata,fetched_at)`;
    const values = v.userId
      ? this
          .sql`(${v.userId},${v.id},${v.itemId ?? null},${v.sourceType},${v.rawBody},${this.sql.json(v.metadata as never)},${v.fetchedAt})`
      : this
          .sql`(${v.id},${v.itemId ?? null},${v.sourceType},${v.rawBody},${this.sql.json(v.metadata as never)},${v.fetchedAt})`;
    const updated = await this.sql`
      UPDATE raw_content SET source_type=${v.sourceType},raw_body=${v.rawBody},
        metadata=${this.sql.json(v.metadata as never)},fetched_at=${v.fetchedAt}
      WHERE id=${v.id} RETURNING id`;
    if (!updated[0]) await this.sql`INSERT INTO raw_content ${columns} VALUES ${values}`;
  }
  async attachItem(rawId: string, itemId: string) {
    await this.sql`UPDATE raw_content SET item_id=${itemId} WHERE id=${rawId}`;
  }
}

const mapContentVersion = (row: Row): ItemContentVersion => ({
  id: String(row.id),
  itemId: String(row.item_id),
  version: Number(row.version),
  contentHash: String(row.content_hash),
  extractorVersion: String(row.extractor_version),
  source: row.source as ItemContentVersion["source"],
  content: String(row.content),
  characterCount: Number(row.character_count),
  tokenCount: Number(row.token_count),
  createdAt: iso(row.created_at),
});

class PostgresContentVersions implements ContentVersionRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string) {
    const row = first(await this.sql<Row[]>`SELECT * FROM item_content_versions WHERE id=${id}`);
    return row ? mapContentVersion(row) : undefined;
  }

  async findLatestForItem(itemId: string) {
    const row = first(
      await this.sql<
        Row[]
      >`SELECT * FROM item_content_versions WHERE item_id=${itemId} ORDER BY version DESC LIMIT 1`
    );
    return row ? mapContentVersion(row) : undefined;
  }

  async listForItem(itemId: string) {
    return (
      await this.sql<
        Row[]
      >`SELECT * FROM item_content_versions WHERE item_id=${itemId} ORDER BY version ASC`
    ).map(mapContentVersion);
  }

  async create(record: Parameters<ContentVersionRepository["create"]>[0]) {
    return this.sql.begin(async (tx) => {
      await tx`SELECT id FROM items WHERE id=${record.itemId} FOR UPDATE`;
      const existing = first(
        await tx<Row[]>`
          SELECT * FROM item_content_versions
          WHERE item_id=${record.itemId}
            AND content_hash=${record.contentHash}
            AND extractor_version=${record.extractorVersion}
        `
      );
      if (existing) return { record: mapContentVersion(existing), created: false };

      const versions = await tx<{ version: number }[]>`
        SELECT COALESCE(MAX(version), 0)::int + 1 AS version
        FROM item_content_versions
        WHERE item_id=${record.itemId}
      `;
      const version = versions[0].version;
      const rows = await tx<Row[]>`
        INSERT INTO item_content_versions
          (id,item_id,version,content_hash,extractor_version,source,content,
           character_count,token_count,created_at)
        VALUES
          (${record.id},${record.itemId},${version},${record.contentHash},
           ${record.extractorVersion},${record.source},${record.content},
           ${record.characterCount},${record.tokenCount},${record.createdAt})
        RETURNING *
      `;
      return { record: mapContentVersion(rows[0]), created: true };
    });
  }

  async listReadyCandidates(input: Parameters<ContentVersionRepository["listReadyCandidates"]>[0]) {
    const after = input.afterItemId ?? null;
    return (
      await this.sql<Row[]>`
        SELECT id AS item_id,title,full_content,summary
        FROM items
        WHERE processing_status='ready'
          AND (${after}::text IS NULL OR id > ${after})
          AND length(trim(COALESCE(NULLIF(trim(full_content), ''), summary))) > 0
        ORDER BY id ASC
        LIMIT ${input.limit}
      `
    ).map((row) => ({
      itemId: String(row.item_id),
      title: String(row.title),
      fullContent: row.full_content == null ? undefined : String(row.full_content),
      summary: String(row.summary),
    }));
  }
}

const mapContentChunk = (row: Row): ContentChunkRecord => ({
  id: String(row.id),
  contentVersionId: String(row.content_version_id),
  itemId: String(row.item_id),
  ordinal: Number(row.ordinal),
  content: String(row.content),
  contentHash: String(row.content_hash),
  startOffset: Number(row.start_offset),
  endOffset: Number(row.end_offset),
  tokenCount: Number(row.token_count),
  embeddingModel: row.embedding_model == null ? undefined : String(row.embedding_model),
  embeddingDimensions:
    row.embedding_dimensions == null ? undefined : Number(row.embedding_dimensions),
  embeddingStatus: row.embedding_status as ContentChunkRecord["embeddingStatus"],
  embeddingError: row.embedding_error == null ? undefined : String(row.embedding_error),
  embeddingUpdatedAt: row.embedding_updated_at == null ? undefined : iso(row.embedding_updated_at),
  embeddedAt: row.embedded_at == null ? undefined : iso(row.embedded_at),
  createdAt: iso(row.created_at),
});

class PostgresContentChunks implements ContentChunkRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string) {
    const row = first(await this.sql<Row[]>`SELECT * FROM content_chunks WHERE id=${id}`);
    return row ? mapContentChunk(row) : undefined;
  }

  async listForContentVersion(contentVersionId: string) {
    return (
      await this.sql<
        Row[]
      >`SELECT * FROM content_chunks WHERE content_version_id=${contentVersionId} ORDER BY ordinal ASC`
    ).map(mapContentChunk);
  }

  async insertMany(records: ContentChunkRecord[]) {
    if (records.length === 0) return { records: [], insertedCount: 0 };
    const lockKeys = records.flatMap((record) => [
      tenantLockKey("content-chunk-id", record.id),
      tenantLockKey("content-chunk-ordinal", record.contentVersionId, record.ordinal),
    ]);
    return withTenantLocks(this.sql, lockKeys, async (tx) => {
      let insertedCount = 0;
      const stored: ContentChunkRecord[] = [];
      for (const record of records) {
        const existing = first(await tx<Row[]>`SELECT * FROM content_chunks WHERE id=${record.id}`);
        if (existing) {
          stored.push(mapContentChunk(existing));
          continue;
        }
        const ordinalConflict = first(
          await tx<Row[]>`
            SELECT id FROM content_chunks
            WHERE content_version_id=${record.contentVersionId} AND ordinal=${record.ordinal}
          `
        );
        if (ordinalConflict) throw new Error(`Chunk identity conflict for ${record.id}`);
        const inserted = await tx<Row[]>`
          INSERT INTO content_chunks
            (id,content_version_id,item_id,ordinal,content,content_hash,start_offset,end_offset,
             token_count,embedding_model,embedding_dimensions,embedding_status,embedding_error,
             embedding_updated_at,embedded_at,created_at)
          VALUES
            (${record.id},${record.contentVersionId},${record.itemId},${record.ordinal},
             ${record.content},${record.contentHash},${record.startOffset},${record.endOffset},
             ${record.tokenCount},${record.embeddingModel ?? null},
             ${record.embeddingDimensions ?? null},${record.embeddingStatus},
             ${record.embeddingError ?? null},${record.embeddingUpdatedAt ?? null},
             ${record.embeddedAt ?? null},${record.createdAt})
          RETURNING *
        `;
        insertedCount += 1;
        stored.push(mapContentChunk(inserted[0]));
      }
      return { records: stored, insertedCount };
    });
  }

  async listUnchunkedVersions(
    input: Parameters<ContentChunkRepository["listUnchunkedVersions"]>[0]
  ) {
    const after = input.afterContentVersionId ?? null;
    return (
      await this.sql<Row[]>`
        SELECT versions.*
        FROM item_content_versions versions
        WHERE (${after}::text IS NULL OR versions.id > ${after})
          AND NOT EXISTS (
            SELECT 1 FROM content_chunks chunks
            WHERE chunks.content_version_id=versions.id
          )
        ORDER BY versions.id ASC
        LIMIT ${input.limit}
      `
    ).map(mapContentVersion);
  }
}

const mapArtifact = (row: Row): IntelligenceArtifact => ({
  id: String(row.id),
  itemId: String(row.item_id),
  contentVersionId: String(row.content_version_id),
  artifactType: row.artifact_type as IntelligenceArtifact["artifactType"],
  version: Number(row.version),
  status: row.status as IntelligenceArtifact["status"],
  content: row.content == null ? undefined : String(row.content),
  contentHash: row.content_hash == null ? undefined : String(row.content_hash),
  provenance: row.provenance as IntelligenceArtifact["provenance"],
  promptVersion: row.prompt_version == null ? undefined : String(row.prompt_version),
  provider: row.provider == null ? undefined : String(row.provider),
  model: row.model == null ? undefined : String(row.model),
  isCurrent: Boolean(row.is_current),
  supersedesArtifactId:
    row.supersedes_artifact_id == null ? undefined : String(row.supersedes_artifact_id),
  metadata: row.metadata as Record<string, unknown>,
  errorCode:
    row.error_code == null
      ? undefined
      : (String(row.error_code) as IntelligenceArtifact["errorCode"]),
  errorMessage: row.error_message == null ? undefined : String(row.error_message),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  completedAt: row.completed_at == null ? undefined : iso(row.completed_at),
});

class PostgresIntelligenceArtifacts implements IntelligenceArtifactRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string) {
    const row = first(await this.sql<Row[]>`SELECT * FROM intelligence_artifacts WHERE id=${id}`);
    return row ? mapArtifact(row) : undefined;
  }

  async findCurrent(itemId: string, artifactType: IntelligenceArtifact["artifactType"]) {
    const row = first(
      await this.sql<Row[]>`
        SELECT * FROM intelligence_artifacts
        WHERE item_id=${itemId} AND artifact_type=${artifactType} AND is_current=true
      `
    );
    return row ? mapArtifact(row) : undefined;
  }

  async listForItem(itemId: string) {
    return (
      await this.sql<Row[]>`
        SELECT * FROM intelligence_artifacts
        WHERE item_id=${itemId}
        ORDER BY artifact_type ASC,version ASC
      `
    ).map(mapArtifact);
  }

  async publish(record: Parameters<IntelligenceArtifactRepository["publish"]>[0]) {
    return this.sql.begin(async (tx) => {
      await tx`SELECT id FROM items WHERE id=${record.itemId} FOR UPDATE`;
      const existing = first(
        await tx<Row[]>`SELECT * FROM intelligence_artifacts WHERE id=${record.id}`
      );
      if (existing) return { record: mapArtifact(existing), created: false };

      const current = first(
        await tx<Row[]>`
          SELECT * FROM intelligence_artifacts
          WHERE item_id=${record.itemId}
            AND artifact_type=${record.artifactType}
            AND is_current=true
          FOR UPDATE
        `
      );
      const makeCurrent = record.makeCurrent || (record.makeCurrentIfNone === true && !current);

      const versions = await tx<{ version: number }[]>`
        SELECT COALESCE(MAX(version), 0)::int + 1 AS version
        FROM intelligence_artifacts
        WHERE item_id=${record.itemId} AND artifact_type=${record.artifactType}
      `;
      const version = versions[0].version;
      if (makeCurrent && current) {
        await tx`
          UPDATE intelligence_artifacts
          SET status='stale',is_current=false,updated_at=${record.updatedAt}
          WHERE id=${String(current.id)}
        `;
      }
      const rows = await tx<Row[]>`
        INSERT INTO intelligence_artifacts
          (id,item_id,content_version_id,artifact_type,version,status,content,content_hash,
           provenance,prompt_version,provider,model,is_current,supersedes_artifact_id,metadata,
           error_code,error_message,created_at,updated_at,completed_at)
        VALUES
          (${record.id},${record.itemId},${record.contentVersionId},${record.artifactType},
           ${version},${record.status},${record.content ?? null},${record.contentHash ?? null},
           ${record.provenance},${record.promptVersion ?? null},${record.provider ?? null},
           ${record.model ?? null},${makeCurrent},
           ${makeCurrent && current ? String(current.id) : null},
           ${tx.json(record.metadata as never)},${record.errorCode ?? null},
           ${record.errorMessage ?? null},${record.createdAt},${record.updatedAt},
           ${record.completedAt ?? null})
        RETURNING *
      `;
      return { record: mapArtifact(rows[0]), created: true };
    });
  }

  async updatePending(
    id: string,
    patch: Parameters<IntelligenceArtifactRepository["updatePending"]>[1]
  ) {
    const row = first(
      await this.sql<Row[]>`
        UPDATE intelligence_artifacts
        SET content=${patch.content ?? null},content_hash=${patch.contentHash ?? null},
            prompt_version=${patch.promptVersion ?? null},provider=${patch.provider ?? null},
            model=${patch.model ?? null},metadata=metadata || ${this.sql.json(patch.metadata as never)},
            updated_at=${patch.updatedAt}
        WHERE id=${id} AND status='pending'
        RETURNING *
      `
    );
    if (row) return mapArtifact(row);
    return this.findById(id);
  }

  async complete(
    id: string,
    completion: Parameters<IntelligenceArtifactRepository["complete"]>[1]
  ) {
    return this.sql.begin(async (tx) => {
      const artifact = first(
        await tx<Row[]>`SELECT * FROM intelligence_artifacts WHERE id=${id} FOR UPDATE`
      );
      if (!artifact) return undefined;
      if (String(artifact.status) !== "pending") return mapArtifact(artifact);
      const canBeCurrent = completion.status === "ready" || completion.status === "degraded";
      const makeCurrent = completion.makeCurrent && canBeCurrent;
      await tx`SELECT id FROM items WHERE id=${String(artifact.item_id)} FOR UPDATE`;
      const current = makeCurrent
        ? first(
            await tx<Row[]>`
              SELECT * FROM intelligence_artifacts
              WHERE item_id=${String(artifact.item_id)}
                AND artifact_type=${String(artifact.artifact_type)}
                AND is_current=true
                AND id<>${id}
              FOR UPDATE
            `
          )
        : undefined;
      if (current) {
        await tx`
          UPDATE intelligence_artifacts
          SET status='stale',is_current=false,updated_at=${completion.updatedAt}
          WHERE id=${String(current.id)}
        `;
      }
      const content = completion.content ?? nullableString(artifact.content);
      const contentHash = completion.contentHash ?? nullableString(artifact.content_hash);
      const promptVersion = completion.promptVersion ?? nullableString(artifact.prompt_version);
      const provider = completion.provider ?? nullableString(artifact.provider);
      const model = completion.model ?? nullableString(artifact.model);
      const rows = await tx<Row[]>`
        UPDATE intelligence_artifacts
        SET status=${completion.status},content=${content},content_hash=${contentHash},
            prompt_version=${promptVersion},provider=${provider},model=${model},is_current=${makeCurrent},
            supersedes_artifact_id=${current ? String(current.id) : null},
            metadata=metadata || ${tx.json(completion.metadata as never)},
            error_code=${completion.errorCode ?? null},error_message=${completion.errorMessage ?? null},
            updated_at=${completion.updatedAt},completed_at=${completion.completedAt ?? completion.updatedAt}
        WHERE id=${id} AND status='pending'
        RETURNING *
      `;
      return rows[0] ? mapArtifact(rows[0]) : undefined;
    });
  }

  async listLegacySummaryCandidates(
    input: Parameters<IntelligenceArtifactRepository["listLegacySummaryCandidates"]>[0]
  ) {
    const after = input.afterSummaryId ?? null;
    return (
      await this.sql<Row[]>`
        SELECT summaries.id AS summary_id,summaries.item_id,versions.id AS content_version_id,
               summaries.prompt_type,summaries.summary,summaries.model,summaries.created_at
        FROM ai_summaries summaries
        JOIN LATERAL (
          SELECT id FROM item_content_versions
          WHERE item_id=summaries.item_id
          ORDER BY version DESC
          LIMIT 1
        ) versions ON true
        WHERE (${after}::text IS NULL OR summaries.id > ${after})
        ORDER BY summaries.id ASC
        LIMIT ${input.limit}
      `
    ).map((row) => ({
      summaryId: String(row.summary_id),
      itemId: String(row.item_id),
      contentVersionId: String(row.content_version_id),
      promptType: String(row.prompt_type),
      summary: String(row.summary),
      model: String(row.model),
      createdAt: iso(row.created_at),
    }));
  }

  async listDegradedSummaryCandidates(
    input: Parameters<IntelligenceArtifactRepository["listDegradedSummaryCandidates"]>[0]
  ) {
    const after = input.afterItemId ?? null;
    return (
      await this.sql<Row[]>`
        SELECT items.id AS item_id,items.title,versions.id AS content_version_id,versions.content
        FROM items
        JOIN LATERAL (
          SELECT id,content FROM item_content_versions
          WHERE item_id=items.id
          ORDER BY version DESC
          LIMIT 1
        ) versions ON true
        WHERE items.processing_status='ready'
          AND (${after}::text IS NULL OR items.id > ${after})
          AND NOT EXISTS (
            SELECT 1 FROM intelligence_artifacts artifacts
            WHERE artifacts.item_id=items.id
              AND artifacts.artifact_type='brief_summary'
              AND artifacts.is_current=true
          )
        ORDER BY items.id ASC
        LIMIT ${input.limit}
      `
    ).map((row) => ({
      itemId: String(row.item_id),
      title: String(row.title),
      contentVersionId: String(row.content_version_id),
      content: String(row.content),
    }));
  }
}

class PostgresClaims implements ClaimRepository {
  constructor(private readonly sql: Sql) {}

  async listForArtifact(artifactId: string) {
    const claimRows = await this.sql<
      Row[]
    >`SELECT * FROM intelligence_claims WHERE artifact_id=${artifactId} ORDER BY ordinal ASC`;
    const claims: GroundedClaim[] = [];
    for (const row of claimRows) {
      const evidenceRows = await this.sql<Row[]>`
        SELECT * FROM claim_evidence
        WHERE claim_id=${String(row.id)}
        ORDER BY chunk_id ASC,start_offset ASC,end_offset ASC
      `;
      claims.push({
        id: String(row.id),
        artifactId: String(row.artifact_id),
        ordinal: Number(row.ordinal),
        claim: String(row.claim),
        claimHash: String(row.claim_hash),
        confidence: row.confidence == null ? undefined : Number(row.confidence),
        evidence: evidenceRows.map((evidence) => ({
          claimId: String(evidence.claim_id),
          chunkId: String(evidence.chunk_id),
          startOffset: Number(evidence.start_offset),
          endOffset: Number(evidence.end_offset),
          exactExcerpt: String(evidence.exact_excerpt),
          evidenceHash: String(evidence.evidence_hash),
        })),
      });
    }
    return claims;
  }

  async insertWithEvidence(claims: Parameters<ClaimRepository["insertWithEvidence"]>[0]) {
    if (claims.length === 0) return [];
    const artifactIds = new Set(claims.map((claim) => claim.artifactId));
    if (artifactIds.size !== 1) throw new Error("Claims in one batch must share an artifact");

    const lockKeys = claims.flatMap((claim) => [
      tenantLockKey("claim-id", claim.id),
      tenantLockKey("claim-ordinal", claim.artifactId, claim.ordinal),
      ...claim.evidence.map((evidence) =>
        tenantLockKey(
          "claim-evidence",
          evidence.claimId,
          evidence.chunkId,
          evidence.startOffset,
          evidence.endOffset
        )
      ),
    ]);
    await withTenantLocks(this.sql, lockKeys, async (tx) => {
      for (const claim of claims) {
        if (claim.claimHash !== sha256(claim.claim)) {
          throw new Error(`Claim hash does not match claim text for ${claim.id}`);
        }
        const existingClaim = first(
          await tx<Row[]>`SELECT id FROM intelligence_claims WHERE id=${claim.id}`
        );
        if (!existingClaim) {
          await tx`
            INSERT INTO intelligence_claims
              (id,artifact_id,ordinal,claim,claim_hash,confidence)
            VALUES
              (${claim.id},${claim.artifactId},${claim.ordinal},${claim.claim},
               ${claim.claimHash},${claim.confidence ?? null})
          `;
        }
        for (const evidence of claim.evidence) {
          if (evidence.claimId !== claim.id) {
            throw new Error(`Evidence ${evidence.chunkId} belongs to a different claim`);
          }
          const chunk = first(
            await tx<Row[]>`SELECT content FROM content_chunks WHERE id=${evidence.chunkId}`
          );
          if (!chunk) throw new Error(`Evidence chunk ${evidence.chunkId} does not exist`);
          const excerpt = String(chunk.content).slice(evidence.startOffset, evidence.endOffset);
          if (excerpt !== evidence.exactExcerpt || sha256(excerpt) !== evidence.evidenceHash) {
            throw new Error(`Evidence does not match chunk ${evidence.chunkId}`);
          }
          const existingEvidence = first(
            await tx<Row[]>`
              SELECT claim_id FROM claim_evidence
              WHERE claim_id=${evidence.claimId} AND chunk_id=${evidence.chunkId}
                AND start_offset=${evidence.startOffset} AND end_offset=${evidence.endOffset}
            `
          );
          if (!existingEvidence) {
            await tx`
              INSERT INTO claim_evidence
                (claim_id,chunk_id,start_offset,end_offset,exact_excerpt,evidence_hash)
              VALUES
                (${evidence.claimId},${evidence.chunkId},${evidence.startOffset},
                 ${evidence.endOffset},${evidence.exactExcerpt},${evidence.evidenceHash})
            `;
          }
        }
      }
    });
    return this.listForArtifact(claims[0].artifactId);
  }
}

const mapBackfillCheckpoint = (row: Row): KnowledgeBackfillCheckpoint => ({
  jobKey: String(row.job_key),
  jobType: row.job_type as KnowledgeBackfillCheckpoint["jobType"],
  status: row.status as KnowledgeBackfillCheckpoint["status"],
  cursor: row.cursor == null ? undefined : String(row.cursor),
  checkpoint:
    typeof row.checkpoint === "string"
      ? (JSON.parse(row.checkpoint) as Record<string, unknown>)
      : (row.checkpoint as Record<string, unknown>),
  processedCount: Number(row.processed_count),
  failedCount: Number(row.failed_count),
  attempt: Number(row.attempt),
  lastError: row.last_error == null ? undefined : String(row.last_error),
  startedAt: row.started_at == null ? undefined : iso(row.started_at),
  completedAt: row.completed_at == null ? undefined : iso(row.completed_at),
  updatedAt: iso(row.updated_at),
});

class PostgresKnowledgeBackfills implements KnowledgeBackfillRepository {
  constructor(private readonly sql: Sql) {}

  async find(jobKey: string) {
    const row = first(
      await this.sql<Row[]>`SELECT * FROM knowledge_backfill_checkpoints WHERE job_key=${jobKey}`
    );
    return row ? mapBackfillCheckpoint(row) : undefined;
  }

  async create(checkpoint: KnowledgeBackfillCheckpoint) {
    return withTenantLocks(
      this.sql,
      [tenantLockKey("knowledge-backfill", checkpoint.jobKey)],
      async (tx) => {
        const existing = first(
          await tx<Row[]>`
            SELECT * FROM knowledge_backfill_checkpoints WHERE job_key=${checkpoint.jobKey}
          `
        );
        if (existing) return mapBackfillCheckpoint(existing);
        const inserted = await tx<Row[]>`
          INSERT INTO knowledge_backfill_checkpoints
            (job_key,job_type,status,cursor,checkpoint,processed_count,failed_count,attempt,
             last_error,started_at,completed_at,updated_at)
          VALUES
            (${checkpoint.jobKey},${checkpoint.jobType},${checkpoint.status},
             ${checkpoint.cursor ?? null},${tx.json(checkpoint.checkpoint as never)},
             ${checkpoint.processedCount},${checkpoint.failedCount},${checkpoint.attempt},
             ${checkpoint.lastError ?? null},${checkpoint.startedAt ?? null},
             ${checkpoint.completedAt ?? null},${checkpoint.updatedAt})
          RETURNING *
        `;
        return mapBackfillCheckpoint(inserted[0]);
      }
    );
  }

  async start(jobKey: string, at: string) {
    const row = first(
      await this.sql<Row[]>`
        UPDATE knowledge_backfill_checkpoints
        SET status='running',
            attempt=attempt + CASE WHEN status IN ('pending','failed') THEN 1 ELSE 0 END,
            last_error=NULL,
            started_at=COALESCE(started_at,${at}),
            completed_at=NULL,
            updated_at=${at}
        WHERE job_key=${jobKey} AND status IN ('pending','failed','running')
        RETURNING *
      `
    );
    return row ? mapBackfillCheckpoint(row) : this.find(jobKey);
  }

  async advance(jobKey: string, advance: Parameters<KnowledgeBackfillRepository["advance"]>[1]) {
    const expectedCursor = advance.expectedCursor ?? null;
    const row = first(
      await this.sql<Row[]>`
        UPDATE knowledge_backfill_checkpoints
        SET status=${advance.completed ? "completed" : "running"},
            cursor=${advance.cursor ?? null},
            checkpoint=${this.sql.json(advance.checkpoint as never)},
            processed_count=processed_count + ${advance.processedDelta},
            completed_at=${advance.completed ? advance.at : null},
            updated_at=${advance.at}
        WHERE job_key=${jobKey}
          AND status='running'
          AND cursor IS NOT DISTINCT FROM ${expectedCursor}
        RETURNING *
      `
    );
    return row ? mapBackfillCheckpoint(row) : undefined;
  }

  async fail(jobKey: string, error: string, at: string) {
    const row = first(
      await this.sql<Row[]>`
        UPDATE knowledge_backfill_checkpoints
        SET status='failed',failed_count=failed_count+1,last_error=${error},updated_at=${at}
        WHERE job_key=${jobKey} AND status='running'
        RETURNING *
      `
    );
    return row ? mapBackfillCheckpoint(row) : undefined;
  }

  async listByType(jobType: KnowledgeBackfillCheckpoint["jobType"], limit = 100) {
    return (
      await this.sql<Row[]>`
        SELECT * FROM knowledge_backfill_checkpoints
        WHERE job_type=${jobType}
        ORDER BY updated_at DESC
        LIMIT ${limit}
      `
    ).map(mapBackfillCheckpoint);
  }
}

class PostgresPublisherQueue implements PublisherQueueRepository {
  constructor(private readonly sql: Sql) {}

  async enqueue(input: Parameters<PublisherQueueRepository["enqueue"]>[0], legacyUrl?: string) {
    const publisherId = typeof input === "string" ? input : input.publisherId;
    const url = typeof input === "string" ? legacyUrl! : input.url;
    const userId = typeof input === "string" ? undefined : input.userId;
    const exists = await this.sql`
      SELECT 1 FROM publisher_queue WHERE publisher_id=${publisherId} AND url=${url} LIMIT 1`;
    if (exists[0]) return;
    try {
      await this.sql.begin(async (tx) => {
        if (userId) {
          await tx`
            INSERT INTO publisher_queue (user_id, publisher_id, url, discovered_at)
            VALUES (${userId}, ${publisherId}, ${url}, now())`;
        } else {
          await tx`
            INSERT INTO publisher_queue (publisher_id, url, discovered_at)
            VALUES (${publisherId}, ${url}, now())`;
        }
      });
    } catch (error) {
      const concurrent = await this.sql`
        SELECT 1 FROM publisher_queue WHERE publisher_id=${publisherId} AND url=${url} LIMIT 1`;
      if (!concurrent[0]) throw error;
    }
  }

  async listPending(publisherId: string, limit = 20) {
    const rows = await this.sql<Row[]>`
      SELECT * FROM publisher_queue
      WHERE publisher_id=${publisherId} AND status='pending'
      ORDER BY discovered_at ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      userId: userIdSchema.parse(row.user_id),
      publisherId: String(row.publisher_id),
      url: String(row.url),
      discoveredAt: iso(row.discovered_at),
      status: String(row.status) as "pending" | "fetched" | "failed",
      attempts: Number(row.attempts),
      lastError: row.last_error == null ? undefined : String(row.last_error),
    }));
  }

  async markFetched(publisherId: string, url: string) {
    await this.sql`
      UPDATE publisher_queue SET status='fetched'
      WHERE publisher_id=${publisherId} AND url=${url}
    `;
  }

  async markFailed(publisherId: string, url: string, error: string, maxAttempts = 3) {
    await this.sql`
      UPDATE publisher_queue
      SET attempts=attempts+1,
          last_error=${error},
          status=CASE WHEN attempts+1 >= ${maxAttempts} THEN 'failed' ELSE 'pending' END
      WHERE publisher_id=${publisherId} AND url=${url}
    `;
  }

  async getStats(publisherId: string) {
    const rows = await this.sql<{ status: string; count: number }[]>`
      SELECT status, count(*)::int AS count FROM publisher_queue
      WHERE publisher_id=${publisherId}
      GROUP BY status
    `;
    const stats = { pending: 0, fetched: 0, failed: 0 };
    for (const row of rows) {
      if (row.status === "pending") stats.pending = row.count;
      else if (row.status === "fetched") stats.fetched = row.count;
      else if (row.status === "failed") stats.failed = row.count;
    }
    return stats;
  }
}

class PostgresJobs implements JobQueueRepository {
  constructor(private readonly sql: Sql) {}

  async enqueue(input: Parameters<JobQueueRepository["enqueue"]>[0]) {
    let payload: unknown = {};
    try {
      payload = input.payload ? JSON.parse(input.payload) : {};
    } catch {
      payload = input.payload ?? {};
    }
    // Phase 2 databases predate the tenant idempotency column. Preserve their
    // primary-key deduplication until the Phase 3 migration has been applied.
    if (!input.userId) {
      const existing = await this.sql`SELECT 1 FROM job_queue WHERE id=${input.id} LIMIT 1`;
      if (existing[0]) return;
      try {
        await this.sql`
          INSERT INTO job_queue
            (id,job_type,payload,priority,max_retries,run_after,status,created_at,updated_at)
          VALUES
            (${input.id},${input.jobType},${this.sql.json(payload as never)},${input.priority ?? 0},${input.maxRetries ?? 3},${input.runAfter ?? null},'pending',now(),now())`;
      } catch (error) {
        const concurrent = await this.sql`SELECT 1 FROM job_queue WHERE id=${input.id} LIMIT 1`;
        if (!concurrent[0]) throw error;
      }
      return;
    }

    const columns = this
      .sql`(user_id,id,job_type,idempotency_key,payload,priority,max_retries,run_after,status,created_at,updated_at)`;
    const values = this
      .sql`(${input.userId},${input.id},${input.jobType},${input.idempotencyKey ?? input.id},${this.sql.json(payload as never)},${input.priority ?? 0},${input.maxRetries ?? 3},${input.runAfter ?? null},'pending',now(),now())`;
    const idempotencyKey = input.idempotencyKey ?? input.id;
    const exists = await this.sql`
      SELECT 1 FROM job_queue WHERE idempotency_key=${idempotencyKey} LIMIT 1`;
    if (exists[0]) return;
    try {
      await this.sql.begin(async (tx) => {
        await tx`INSERT INTO job_queue ${columns} VALUES ${values}`;
      });
    } catch (error) {
      const concurrent = await this.sql`
        SELECT 1 FROM job_queue WHERE idempotency_key=${idempotencyKey} LIMIT 1`;
      if (!concurrent[0]) throw error;
    }
  }

  async dequeue(workerId: string) {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Row[]>`
        SELECT * FROM job_queue
        WHERE (
          (status='pending' AND (run_after IS NULL OR run_after <= now()))
          OR (status='running' AND locked_at < now() - interval '5 minutes')
        )
          AND cancellation_requested_at IS NULL
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const job = rows[0];
      if (!job) return undefined;
      const updated = await tx<Row[]>`
        UPDATE job_queue
        SET locked_at=now(), locked_by=${workerId}, status='running', updated_at=now()
        WHERE id=${String(job.id)}
        RETURNING *
      `;
      return updated[0] ? mapJobQueueRecord(updated[0]) : undefined;
    });
  }

  async claim(id: string, workerId: string) {
    const rows = await this.sql<Row[]>`
      UPDATE job_queue
      SET locked_at=now(), locked_by=${workerId}, status='running', updated_at=now()
      WHERE id=${id}
        AND cancellation_requested_at IS NULL
        AND ((status='pending' AND (run_after IS NULL OR run_after <= now()))
          OR (status='running' AND locked_at < now() - interval '5 minutes'))
      RETURNING *
    `;
    return rows[0] ? mapJobQueueRecord(rows[0]) : undefined;
  }

  async complete(id: string, error?: string) {
    if (!error) {
      await this.sql`
        UPDATE job_queue
        SET status=CASE WHEN cancellation_requested_at IS NULL THEN 'completed' ELSE 'cancelled' END,
            completed_at=now(), updated_at=now()
        WHERE id=${id}
      `;
      return;
    }
    await this.sql`
      UPDATE job_queue
      SET attempts=attempts+1,
          last_error=${error},
          status=CASE
            WHEN cancellation_requested_at IS NOT NULL THEN 'cancelled'
            WHEN attempts+1 < max_retries THEN 'pending'
            ELSE 'failed'
          END,
          locked_at=NULL,
          locked_by=NULL,
          completed_at=CASE
            WHEN cancellation_requested_at IS NOT NULL OR attempts+1 >= max_retries THEN now()
            ELSE NULL
          END,
          updated_at=now()
      WHERE id=${id}
    `;
  }

  async requestCancellation(id: string, reason: string, at: string) {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE job_queue
      SET cancellation_requested_at=${at}::timestamptz,
          cancellation_reason=${reason},
          status=CASE WHEN status='pending' THEN 'cancelled' ELSE status END,
          completed_at=CASE WHEN status='pending' THEN ${at}::timestamptz ELSE completed_at END,
          updated_at=${at}::timestamptz
      WHERE id=${id} AND status IN ('pending','running')
      RETURNING id
    `;
    return rows.length === 1;
  }

  async cancelAll(reason: string, at: string) {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE job_queue
      SET cancellation_requested_at=${at}::timestamptz,
          cancellation_reason=${reason},
          status=CASE WHEN status='pending' THEN 'cancelled' ELSE status END,
          completed_at=CASE WHEN status='pending' THEN ${at}::timestamptz ELSE completed_at END,
          updated_at=${at}::timestamptz
      WHERE status IN ('pending','running')
      RETURNING id
    `;
    return rows.length;
  }

  async isCancellationRequested(id: string) {
    const rows = await this.sql<{ cancelled: boolean }[]>`
      SELECT (cancellation_requested_at IS NOT NULL OR status='cancelled') AS cancelled
      FROM job_queue WHERE id=${id} LIMIT 1
    `;
    return rows[0]?.cancelled ?? true;
  }

  async getStats() {
    const rows = await this.sql<{ status: string; count: number }[]>`
      SELECT status, count(*)::int AS count FROM job_queue GROUP BY status
    `;
    const stats = { pending: 0, running: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      if (row.status in stats) stats[row.status as keyof typeof stats] = row.count;
    }
    return stats;
  }
}

class PostgresAgent implements AgentRepository {
  constructor(private readonly sql: Sql) {}
  private now() {
    return new Date().toISOString();
  }
  async insertAuditLog(d: Record<string, unknown> & { id: string; action: string }) {
    await this
      .sql`INSERT INTO audit_log(id,action,tool_name,input_hash,output_hash,model,provider,tokens_in,tokens_out,cost,latency_ms,trace_id,created_at) VALUES(${d.id},${d.action},${(d.toolName as string) ?? null},${(d.inputHash as string) ?? null},${(d.outputHash as string) ?? null},${(d.model as string) ?? null},${(d.provider as string) ?? null},${(d.tokensIn as number) ?? null},${(d.tokensOut as number) ?? null},${(d.cost as number) ?? null},${(d.latencyMs as number) ?? null},${(d.traceId as string) ?? null},${this.now()})`;
  }
  async listAuditLogs(limit = 50) {
    return await this.sql<Row[]>`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${limit}`;
  }
  async getDailyAuditStats() {
    const r = first(
      await this.sql<
        { totalCost: number; totalCalls: number; totalTokens: number }[]
      >`SELECT coalesce(sum(cost),0)::float8 "totalCost",count(*)::int "totalCalls",coalesce(sum(coalesce(tokens_in,0)+coalesce(tokens_out,0)),0)::int "totalTokens" FROM audit_log WHERE created_at>=date_trunc('day',now())`
    );
    return r ?? { totalCost: 0, totalCalls: 0, totalTokens: 0 };
  }
  async getAuditStatsSince(since: string) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.valueOf())) throw new Error("since must be an ISO timestamp");
    const r = first(
      await this.sql<
        { totalCost: number; totalCalls: number; totalTokens: number }[]
      >`SELECT coalesce(sum(cost),0)::float8 "totalCost",count(*)::int "totalCalls",coalesce(sum(coalesce(tokens_in,0)+coalesce(tokens_out,0)),0)::int "totalTokens" FROM audit_log WHERE created_at>=${parsed.toISOString()}::timestamptz`
    );
    return r ?? { totalCost: 0, totalCalls: 0, totalTokens: 0 };
  }
  async insertWorkflow(d: Record<string, unknown> & { id: string; workflowType: string }) {
    const n = this.now();
    await this
      .sql`INSERT INTO workflow_runs(id,workflow_type,item_id,status,trace_id,created_at,updated_at) VALUES(${d.id},${d.workflowType},${(d.itemId as string) ?? null},'pending',${(d.traceId as string) ?? null},${n},${n})`;
  }
  async updateWorkflow(id: string, p: Record<string, unknown>) {
    const old = await this.findWorkflow(id);
    if (!old) return;
    await this
      .sql`UPDATE workflow_runs SET status=${(p.status as string) ?? old.status},current_step=${(p.currentStep as string) ?? old.current_step ?? null},steps_json=${p.stepsJson ? this.sql.json(JSON.parse(String(p.stepsJson))) : (old.steps_json as never)},error=${(p.error as string) ?? old.error ?? null},completed_at=${(p.completedAt as string) ?? old.completed_at ?? null},updated_at=${this.now()} WHERE id=${id}`;
  }
  async findWorkflow(id: string) {
    return first(await this.sql<Row[]>`SELECT * FROM workflow_runs WHERE id=${id}`);
  }
  async listWorkflows(f: Record<string, unknown> = {}) {
    const status = f.status as string | undefined,
      type = f.workflowType as string | undefined,
      limit = Number(f.limit ?? 20);
    return await this.sql<
      Row[]
    >`SELECT * FROM workflow_runs WHERE (${status ?? null}::text IS NULL OR status=${status ?? null}) AND (${type ?? null}::text IS NULL OR workflow_type=${type ?? null}) ORDER BY created_at DESC LIMIT ${limit}`;
  }
  async insertAction(d: Record<string, unknown> & { id: string; actionType: string }) {
    await this
      .sql`INSERT INTO agent_actions(id,workflow_id,action_type,tool_name,input,output,reasoning,status,trace_id,created_at) VALUES(${d.id},${(d.workflowId as string) ?? null},${d.actionType},${(d.toolName as string) ?? null},${(d.input as string) ?? null},${(d.output as string) ?? null},${(d.reasoning as string) ?? null},${(d.status as string) ?? "completed"},${(d.traceId as string) ?? null},${this.now()})`;
  }
  async listActions(f: Record<string, unknown> = {}) {
    const w = f.workflowId as string | undefined,
      l = Number(f.limit ?? 50);
    return w
      ? await this.sql<
          Row[]
        >`SELECT * FROM agent_actions WHERE workflow_id=${w} ORDER BY created_at DESC LIMIT ${l}`
      : await this.sql<Row[]>`SELECT * FROM agent_actions ORDER BY created_at DESC LIMIT ${l}`;
  }
  async insertApproval(d: Record<string, unknown> & { id: string; actionType: string }) {
    let payload: unknown = {};
    try {
      payload = typeof d.payload === "string" ? JSON.parse(d.payload) : (d.payload ?? {});
    } catch {
      payload = {};
    }
    await this
      .sql`INSERT INTO approval_queue(id,workflow_id,action_type,description,payload,trace_id,created_at) VALUES(${d.id},${(d.workflowId as string) ?? null},${d.actionType},${String(d.description)},${this.sql.json(payload as never)},${(d.traceId as string) ?? null},${this.now()})`;
  }
  async listPendingApprovals(limit = 20) {
    return await this.sql<
      Row[]
    >`SELECT * FROM approval_queue WHERE status='pending' ORDER BY created_at DESC LIMIT ${limit}`;
  }
  async resolveApproval(id: string, status: "approved" | "rejected") {
    await this
      .sql`UPDATE approval_queue SET status=${status},decided_at=${this.now()} WHERE id=${id}`;
  }
  async insertConversation(d: { id: string; title?: string }) {
    const n = this.now();
    await this
      .sql`INSERT INTO chat_conversations(id,title,created_at,updated_at) VALUES(${d.id},${d.title ?? null},${n},${n})`;
  }
  async insertMessage(d: Record<string, unknown> & { id: string; conversationId: string }) {
    const parse = (x: unknown) => {
      if (x == null) return null;
      if (typeof x !== "string") return x;
      try {
        return JSON.parse(x);
      } catch {
        return x;
      }
    };
    await this
      .sql`INSERT INTO chat_messages(id,conversation_id,role,content,citations,tool_calls,created_at) VALUES(${d.id},${d.conversationId},${String(d.role)},${String(d.content)},${d.citations == null ? null : this.sql.json(parse(d.citations) as never)},${d.toolCalls == null ? null : this.sql.json(parse(d.toolCalls) as never)},${this.now()})`;
  }
  async listMessages(id: string) {
    return await this.sql<
      Row[]
    >`SELECT * FROM chat_messages WHERE conversation_id=${id} ORDER BY created_at ASC`;
  }
  async listConversations(limit = 20) {
    return await this.sql<
      Row[]
    >`SELECT * FROM chat_conversations ORDER BY updated_at DESC LIMIT ${limit}`;
  }
}

function tenantOnly<T>(name: string): T {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return undefined;
        return () => Promise.reject(new Error(`${name} requires an AuthContext`));
      },
    }
  ) as T;
}

export function createPostgresRepositories(sql: Sql, context?: AuthContext): RepositorySet {
  return {
    auth: new PostgresAuthRepository(sql),
    items: new PostgresItems(sql),
    itemNotes: new PostgresItemNotes(sql),
    annotations: new PostgresAnnotations(sql),
    collections: new PostgresCollections(sql),
    itemEvents: new PostgresItemEvents(sql),
    digests: new PostgresDigests(sql),
    captures: new PostgresCaptures(sql),
    captureTokens: new PostgresCaptureTokens(sql),
    rateLimits: new PostgresRateLimits(sql),
    oauthTokens: new PostgresOAuth(sql),
    connectorOAuthStates: new PostgresConnectorOAuthStateRepository(sql),
    summaries: new PostgresSummaries(sql),
    feedback: new PostgresFeedback(sql),
    research: new PostgresResearch(sql),
    settings: new PostgresSettings(sql),
    notifications: new PostgresNotifications(sql),
    embeddings: new PostgresEmbeddings(sql),
    rawContent: new PostgresRawContent(sql),
    contentVersions: new PostgresContentVersions(sql),
    contentChunks: new PostgresContentChunks(sql),
    intelligenceArtifacts: new PostgresIntelligenceArtifacts(sql),
    claims: new PostgresClaims(sql),
    knowledgeBackfills: new PostgresKnowledgeBackfills(sql),
    publisherQueue: new PostgresPublisherQueue(sql),
    jobs: new PostgresJobs(sql),
    lifecycle: context
      ? new PostgresTenantLifecycleRepository(sql, context)
      : tenantOnly<RepositorySet["lifecycle"]>("Account lifecycle"),
    agent: new PostgresAgent(sql),
    feed: context
      ? new PostgresFeedQuery(sql, context)
      : tenantOnly<RepositorySet["feed"]>("Feed queries"),
    passages: context
      ? new PostgresPassageSearchStore(sql, context)
      : tenantOnly<RepositorySet["passages"]>("Passage retrieval"),
    digestExperience: context
      ? new PostgresDigestStore(sql, context)
      : tenantOnly<RepositorySet["digestExperience"]>("Digest experience"),
  };
}
