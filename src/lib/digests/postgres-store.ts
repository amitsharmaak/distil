import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";

import type {
  DigestCandidate,
  DigestItem,
  DigestJob,
  DigestRun,
  DigestStore,
  PersonalPreferences,
} from "./types";

type Row = Record<string, unknown>;
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class PostgresDigestStore implements DigestStore {
  constructor(private readonly sql: Sql) {}

  private mapPreferences(row: Row): PersonalPreferences {
    return {
      digestEnabled: Boolean(row.digest_enabled),
      digestTimezone: String(row.digest_timezone),
      personalizationEnabled: Boolean(row.personalization_enabled),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapItem(row: Row): DigestItem {
    return {
      digestRunId: String(row.digest_run_id),
      itemId: String(row.item_id),
      category: row.category as DigestItem["category"],
      position: Number(row.position),
      reason: String(row.reason),
      title: String(row.title_snapshot),
      summary: String(row.summary_snapshot),
      selectionMetadata: record(row.selection_metadata),
      dismissedAt: row.dismissed_at == null ? undefined : iso(row.dismissed_at),
    };
  }

  private mapRun(row: Row, items: DigestItem[] = []): DigestRun {
    return {
      id: String(row.id),
      localDate: String(row.local_date),
      timezone: String(row.timezone),
      status: row.status as DigestRun["status"],
      contentMode: row.content_mode as DigestRun["contentMode"],
      selectionVersion: String(row.selection_version),
      selectionMetadata: record(row.selection_metadata),
      title: String(row.title_text),
      summary: String(row.summary_text),
      createdAt: iso(row.created_at),
      completedAt: row.completed_at == null ? undefined : iso(row.completed_at),
      dismissedAt: row.dismissed_at == null ? undefined : iso(row.dismissed_at),
      items,
    };
  }

  private async hydrate(row: Row): Promise<DigestRun> {
    const items = await this.sql<Row[]>`
      SELECT * FROM digest_items WHERE digest_run_id=${String(row.id)} ORDER BY position ASC`;
    return this.mapRun(
      row,
      items.map((item) => this.mapItem(item))
    );
  }

  async getPreferences(): Promise<PersonalPreferences> {
    await this
      .sql`INSERT INTO personal_preferences(id) VALUES ('default') ON CONFLICT (id) DO NOTHING`;
    const rows = await this.sql<Row[]>`SELECT * FROM personal_preferences WHERE id='default'`;
    return this.mapPreferences(rows[0]);
  }

  async updatePreferences(
    patch: Partial<
      Pick<PersonalPreferences, "digestEnabled" | "digestTimezone" | "personalizationEnabled">
    >
  ): Promise<PersonalPreferences> {
    const current = await this.getPreferences();
    const rows = await this.sql<Row[]>`
      UPDATE personal_preferences SET
        digest_enabled=${patch.digestEnabled ?? current.digestEnabled},
        digest_timezone=${patch.digestTimezone ?? current.digestTimezone},
        personalization_enabled=${patch.personalizationEnabled ?? current.personalizationEnabled},
        updated_at=now()
      WHERE id='default' RETURNING *`;
    return this.mapPreferences(rows[0]);
  }

  async resetPreferences(): Promise<PersonalPreferences> {
    const rows = await this.sql<Row[]>`
      UPDATE personal_preferences SET digest_enabled=false,digest_timezone='UTC',personalization_enabled=true,updated_at=now()
      WHERE id='default' RETURNING *`;
    return this.mapPreferences(rows[0]);
  }

  async findDigest(localDate: string): Promise<DigestRun | undefined> {
    const rows = await this.sql<Row[]>`SELECT * FROM digest_runs WHERE local_date=${localDate}`;
    return rows[0] ? this.hydrate(rows[0]) : undefined;
  }

  async listDigests(limit: number): Promise<DigestRun[]> {
    const rows = await this.sql<Row[]>`
      SELECT * FROM digest_runs ORDER BY local_date DESC, created_at DESC LIMIT ${limit}`;
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async createDigest(run: DigestRun): Promise<DigestRun> {
    const inserted = await this.sql.begin(async (tx) => {
      const rows = await tx<Row[]>`
        INSERT INTO digest_runs(id,digest_date,local_date,status,created_at,completed_at,dismissed_at,timezone,selection_version,content_mode,selection_metadata,title_text,summary_text,updated_at)
        VALUES(${run.id},${run.localDate},${run.localDate},${run.status},${run.createdAt},${run.completedAt ?? null},${run.dismissedAt ?? null},${run.timezone},${run.selectionVersion},${run.contentMode},${tx.json(run.selectionMetadata as never)},${run.title},${run.summary},${run.createdAt})
        ON CONFLICT (local_date) DO NOTHING RETURNING id`;
      if (!rows[0]) return false;
      for (const item of run.items) {
        await tx`
          INSERT INTO digest_items(digest_run_id,item_id,category,position,reason,title_snapshot,summary_snapshot,selection_metadata,dismissed_at)
          VALUES(${run.id},${item.itemId},${item.category},${item.position},${item.reason},${item.title},${item.summary},${tx.json(item.selectionMetadata as never)},${item.dismissedAt ?? null})`;
      }
      return true;
    });
    if (inserted) return run;
    const existing = await this.findDigest(run.localDate);
    if (!existing) throw new Error(`Unable to create digest for ${run.localDate}`);
    return existing;
  }

  async dismissDigest(id: string, at: string): Promise<DigestRun | undefined> {
    const rows = await this.sql<Row[]>`
      UPDATE digest_runs SET dismissed_at=COALESCE(dismissed_at,${at}),updated_at=${at} WHERE id=${id} RETURNING *`;
    return rows[0] ? this.hydrate(rows[0]) : undefined;
  }

  async dismissDigestItem(
    digestRunId: string,
    itemId: string,
    at: string
  ): Promise<DigestItem | undefined> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Row[]>`
        UPDATE digest_items
        SET dismissed_at=COALESCE(dismissed_at,${at})
        WHERE digest_run_id=${digestRunId} AND item_id=${itemId}
        RETURNING *`;
      const row = rows[0];
      if (!row) return undefined;
      if (row.category === "resurfaced") {
        const eventKey = `digest-dismiss:${createHash("sha256")
          .update(`${digestRunId}:${itemId}`)
          .digest("hex")}`;
        await tx`
          INSERT INTO item_events(id,event_key,item_id,event_type,metadata,occurred_at)
          VALUES(${randomUUID()},${eventKey},${itemId},'resurfacing_dismissed',${tx.json({ digestRunId } as never)},${at})
          ON CONFLICT (event_key) DO NOTHING`;
      }
      return this.mapItem(row);
    });
  }

  async listPriorityCandidates(): Promise<DigestCandidate[]> {
    const rows = await this.sql<Row[]>`
      SELECT id,title,summary,priority,manual_priority,created_at FROM items i
      WHERE i.processing_status='ready' AND i.archived_at IS NULL AND NOT i.is_read
        AND NOT EXISTS (SELECT 1 FROM digest_items di WHERE di.item_id=i.id)
      ORDER BY CASE COALESCE(i.manual_priority,i.priority) WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        COALESCE(i.ai_priority_score,0) DESC,i.created_at DESC,i.id DESC
      LIMIT 30`;
    return rows.map((row) => this.mapCandidate(row));
  }

  async listResurfacedCandidates(): Promise<DigestCandidate[]> {
    const rows = await this.sql<Row[]>`
      SELECT id,title,summary,priority,manual_priority,created_at FROM items i
      WHERE i.processing_status='ready' AND i.archived_at IS NULL
        AND (NOT i.is_read OR EXISTS (SELECT 1 FROM collection_items ci WHERE ci.item_id=i.id))
        AND i.last_opened_at <= now() - interval '14 days'
        AND NOT EXISTS (SELECT 1 FROM digest_items di WHERE di.item_id=i.id)
        AND NOT EXISTS (
          SELECT 1 FROM item_events e WHERE e.item_id=i.id AND e.event_type='resurfaced'
            AND e.occurred_at > now() - interval '30 days'
        )
        AND NOT EXISTS (
          SELECT 1 FROM item_events e WHERE e.item_id=i.id AND e.event_type='resurfacing_dismissed'
            AND e.occurred_at > now() - interval '90 days'
        )
      ORDER BY i.last_opened_at ASC,i.created_at ASC,i.id ASC LIMIT 30`;
    return rows.map((row) => this.mapCandidate(row));
  }

  private mapCandidate(row: Row): DigestCandidate {
    return {
      id: String(row.id),
      title: String(row.title),
      summary: String(row.summary ?? ""),
      priority: row.priority as DigestCandidate["priority"],
      manualPriority:
        row.manual_priority == null
          ? undefined
          : (row.manual_priority as DigestCandidate["manualPriority"]),
      createdAt: iso(row.created_at),
    };
  }

  async enqueue(job: DigestJob): Promise<DigestJob> {
    const rows = await this.sql<Row[]>`
      INSERT INTO digest_jobs(id,local_date,idempotency_key,status,requested_by,created_at,updated_at)
      VALUES(${job.id},${job.localDate},${job.idempotencyKey},${job.status},${job.requestedBy},${job.createdAt},${job.createdAt})
      ON CONFLICT (local_date) DO UPDATE SET updated_at=EXCLUDED.updated_at
      RETURNING *`;
    const row = rows[0];
    return {
      id: String(row.id),
      localDate: String(row.local_date),
      idempotencyKey: String(row.idempotency_key),
      status: row.status as DigestJob["status"],
      requestedBy: row.requested_by as DigestJob["requestedBy"],
      createdAt: iso(row.created_at),
    };
  }
}
