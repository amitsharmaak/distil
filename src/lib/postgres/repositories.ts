import type { Sql } from "postgres";
import type {
  AgentRepository,
  CaptureRepository,
  CaptureTokenRepository,
  CaptureTransition,
  AnnotationRecord,
  AnnotationRepository,
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
  JobQueueRepository,
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
import type { ContentItem, Notification, Priority } from "@/lib/types";
import { normalizeUrl } from "@/lib/utils";
import { mapCapture, mapCaptureToken, mapItem } from "./mappers";

type Row = Record<string, unknown>;
const first = <T>(rows: T[]): T | undefined => rows[0];
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

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
    const rows = await this.sql<
      Row[]
    >`INSERT INTO items (id,title,summary,full_content,source_type,content_type,topics,author,publication,url,normalized_url,priority,is_read,archived_at,read_at,last_opened_at,reading_progress,manual_priority,created_at,duration,thumbnail_url,extracted_links,content_extracted_at,processing_status,rejection_reason,content_classification,detected_media,information_density)
      VALUES (${item.id},${item.title},${item.summary},${item.fullContent ?? null},${item.sourceType},${item.contentType},${this.sql.json(item.topics)},${item.author ?? null},${item.publication ?? null},${item.url},${normalizeUrl(item.url)},${item.priority},${item.isRead},${item.archivedAt ?? null},${item.readAt ?? null},${item.lastOpenedAt ?? null},${item.readingProgress ?? 0},${item.manualPriority ?? null},${item.createdAt},${item.duration ?? null},${item.thumbnailUrl ?? null},${item.extractedLinks ? this.sql.json(item.extractedLinks as never) : null},${item.contentExtractedAt ?? null},${item.processingStatus ?? "ready"},${item.rejectionReason ?? null},${item.contentClassification ? this.sql.json(item.contentClassification as never) : null},${item.detectedMedia ? this.sql.json(item.detectedMedia as never) : null},${item.informationDensity ?? null})
      ON CONFLICT (normalized_url) DO UPDATE SET normalized_url=EXCLUDED.normalized_url RETURNING id`;
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
    const rows = await this.sql<Row[]>`
      INSERT INTO item_notes(item_id,body,created_at,updated_at)
      VALUES(${record.itemId},${record.body},${record.createdAt},${record.updatedAt})
      ON CONFLICT (item_id) DO UPDATE SET body=EXCLUDED.body,updated_at=EXCLUDED.updated_at
      RETURNING *`;
    return this.map(rows[0]);
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
    const rows = await this.sql<Row[]>`
      INSERT INTO collection_items(collection_id,item_id,position,added_at)
      VALUES(${record.collectionId},${record.itemId},${record.position},${record.addedAt})
      ON CONFLICT (collection_id,item_id) DO UPDATE SET position=EXCLUDED.position
      RETURNING *`;
    return this.mapItem(rows[0]);
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
    const inserted = await this.sql<Row[]>`
      INSERT INTO item_events(id,event_key,item_id,event_type,metadata,occurred_at)
      VALUES(${record.id},${record.eventKey},${record.itemId},${record.eventType},${this.sql.json(record.metadata as never)},${record.occurredAt})
      ON CONFLICT (event_key) DO NOTHING RETURNING *`;
    if (inserted[0]) return this.map(inserted[0]);
    const existing = first(
      await this.sql<Row[]>`SELECT * FROM item_events WHERE event_key=${record.eventKey}`
    );
    if (!existing) throw new Error(`Unable to persist item event ${record.eventKey}`);
    return this.map(existing);
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
  private async hydrate(run: DigestRunRecord): Promise<DigestRunWithItems> {
    const rows = await this.sql<Row[]>`
      SELECT * FROM digest_items WHERE digest_run_id=${run.id} ORDER BY position ASC`;
    return { ...run, items: rows.map((row) => this.mapItem(row)) };
  }
  async create(run: DigestRunRecord, items: DigestItemRecord[] = []) {
    if (items.some((item) => item.digestRunId !== run.id)) {
      throw new Error("Digest item belongs to another run");
    }
    const created = await this.sql.begin(async (tx) => {
      const rows = await tx<Row[]>`
        INSERT INTO digest_runs(id,digest_date,status,created_at,completed_at,dismissed_at)
        VALUES(${run.id},${run.digestDate},${run.status},${run.createdAt},${run.completedAt ?? null},${run.dismissedAt ?? null})
        ON CONFLICT (digest_date) DO NOTHING RETURNING id`;
      if (!rows[0]) return false;
      for (const item of items) {
        await tx`
          INSERT INTO digest_items(digest_run_id,item_id,category,position,reason)
          VALUES(${item.digestRunId},${item.itemId},${item.category},${item.position},${item.reason})`;
      }
      return true;
    });
    if (!created) {
      const existing = await this.findByDate(run.digestDate);
      if (!existing) throw new Error(`Unable to persist digest for ${run.digestDate}`);
      return existing;
    }
    return { ...run, items: [...items].sort((a, b) => a.position - b.position) };
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
    const rows = await this.sql<
      Row[]
    >`INSERT INTO capture_requests (id,url,normalized_url,title,notes,topics,priority,source,status,created_at,updated_at)
      VALUES (${v.id},${v.url},${v.normalizedUrl},${v.title ?? null},${v.notes ?? null},${this.sql.json(v.topics)},${v.priority},${v.source},'queued',${v.createdAt},${v.createdAt}) RETURNING *`;
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
      .sql`INSERT INTO capture_tokens (id,name,token_hash,token_prefix,created_at,last_used_at,revoked_at) VALUES (${v.id},${v.name},${v.tokenHash},${v.tokenPrefix},${v.createdAt},${v.lastUsedAt ?? null},${v.revokedAt ?? null})`;
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
    const rows = await this.sql<
      { count: number }[]
    >`INSERT INTO rate_limit_windows (key,window_start,window_seconds,count) VALUES (${v.key},${start},${v.windowSeconds},1) ON CONFLICT (key,window_start,window_seconds) DO UPDATE SET count=rate_limit_windows.count+1 RETURNING count`;
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
    await this
      .sql`INSERT INTO oauth_tokens (provider,team_id,access_token,refresh_token,expiry_date,email,updated_at) VALUES (${v.provider},${v.teamId},${v.accessToken},${v.refreshToken ?? null},${v.expiryDate ?? null},${v.email ?? null},${v.updatedAt}) ON CONFLICT (provider,team_id) DO UPDATE SET access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,expiry_date=EXCLUDED.expiry_date,email=EXCLUDED.email,updated_at=EXCLUDED.updated_at`;
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
    const r = await this.sql<
      Row[]
    >`INSERT INTO ai_summaries (id,item_id,summary,model,prompt_type,created_at) VALUES (${v.id},${v.itemId},${v.summary},${v.model},${v.promptType},now()) ON CONFLICT (item_id,prompt_type) DO UPDATE SET id=EXCLUDED.id,summary=EXCLUDED.summary,model=EXCLUDED.model,created_at=EXCLUDED.created_at RETURNING *`;
    return this.map(r[0]);
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
    await this
      .sql`INSERT INTO user_settings(key,value,updated_at) VALUES(${key},${value},now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;
  }
}
class PostgresNotifications implements NotificationRepository {
  constructor(private readonly sql: Sql) {}
  async insert(v: Pick<Notification, "id" | "itemId" | "title" | "message">) {
    await this
      .sql`INSERT INTO notifications(id,item_id,title,message,created_at) VALUES(${v.id},${v.itemId},${v.title},${v.message},now())`;
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
    await this
      .sql`INSERT INTO item_embeddings(item_id,embedding,model,created_at) VALUES(${id},${this.sql.json(e)},${model},now()) ON CONFLICT(item_id) DO UPDATE SET embedding=EXCLUDED.embedding,model=EXCLUDED.model,created_at=EXCLUDED.created_at`;
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
    await this.sql`INSERT INTO raw_content(id,item_id,source_type,raw_body,metadata,fetched_at)
           VALUES(${v.id},${v.itemId ?? null},${v.sourceType},${v.rawBody},${this.sql.json(v.metadata as never)},${v.fetchedAt})
           ON CONFLICT(id) DO UPDATE SET
             source_type=EXCLUDED.source_type,
             raw_body=EXCLUDED.raw_body,
             metadata=EXCLUDED.metadata,
             fetched_at=EXCLUDED.fetched_at`;
  }
  async attachItem(rawId: string, itemId: string) {
    await this.sql`UPDATE raw_content SET item_id=${itemId} WHERE id=${rawId}`;
  }
}

class PostgresPublisherQueue implements PublisherQueueRepository {
  constructor(private readonly sql: Sql) {}

  async enqueue(publisherId: string, url: string) {
    await this.sql`
      INSERT INTO publisher_queue (publisher_id, url, discovered_at)
      VALUES (${publisherId}, ${url}, now())
      ON CONFLICT (publisher_id, url) DO NOTHING
    `;
  }

  async listPending(publisherId: string, limit = 20) {
    const rows = await this.sql<Row[]>`
      SELECT * FROM publisher_queue
      WHERE publisher_id=${publisherId} AND status='pending'
      ORDER BY discovered_at ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
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
    await this.sql`
      INSERT INTO job_queue
        (id, job_type, payload, priority, max_retries, run_after, status, created_at, updated_at)
      VALUES
        (${input.id}, ${input.jobType}, ${this.sql.json(payload as never)},
         ${input.priority ?? 0}, ${input.maxRetries ?? 3}, ${input.runAfter ?? null},
         'pending', now(), now())
    `;
  }

  async dequeue(workerId: string) {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Row[]>`
        SELECT * FROM job_queue
        WHERE (
          (status='pending' AND (run_after IS NULL OR run_after <= now()))
          OR (status='running' AND locked_at < now() - interval '5 minutes')
        )
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
      return updated[0];
    });
  }

  async complete(id: string, error?: string) {
    if (!error) {
      await this.sql`
        UPDATE job_queue SET status='completed', completed_at=now(), updated_at=now()
        WHERE id=${id}
      `;
      return;
    }
    await this.sql`
      UPDATE job_queue
      SET attempts=attempts+1,
          last_error=${error},
          status=CASE WHEN attempts+1 < max_retries THEN 'pending' ELSE 'failed' END,
          locked_at=NULL,
          locked_by=NULL,
          completed_at=CASE WHEN attempts+1 < max_retries THEN NULL ELSE now() END,
          updated_at=now()
      WHERE id=${id}
    `;
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

export function createPostgresRepositories(sql: Sql): RepositorySet {
  return {
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
    summaries: new PostgresSummaries(sql),
    feedback: new PostgresFeedback(sql),
    research: new PostgresResearch(sql),
    settings: new PostgresSettings(sql),
    notifications: new PostgresNotifications(sql),
    embeddings: new PostgresEmbeddings(sql),
    rawContent: new PostgresRawContent(sql),
    publisherQueue: new PostgresPublisherQueue(sql),
    jobs: new PostgresJobs(sql),
    agent: new PostgresAgent(sql),
  };
}
