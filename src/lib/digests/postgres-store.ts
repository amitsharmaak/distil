import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import { tenantLockKey, withTenantLocks } from "@/lib/postgres/tenant-lock";

import type {
  DigestCandidate,
  DigestItem,
  DigestJob,
  DigestRun,
  DigestStore,
  PersonalPreferences,
} from "./types";

type Row = Record<string, unknown>;
const first = <T>(rows: T[]): T | undefined => rows[0];
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class PostgresDigestStore implements DigestStore {
  private readonly context: AuthContext;

  constructor(
    private readonly sql: Sql,
    context: AuthContext
  ) {
    this.context = parseAuthContext(context);
  }

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

  private async hydrate(row: Row, sql: Sql = this.sql): Promise<DigestRun> {
    const items = await sql<Row[]>`
      SELECT * FROM digest_items
      WHERE user_id=${this.context.userId}::uuid AND digest_run_id=${String(row.id)}
      ORDER BY position ASC`;
    return this.mapRun(
      row,
      items.map((item) => this.mapItem(item))
    );
  }

  async getPreferences(): Promise<PersonalPreferences> {
    return withTenantLocks(
      this.sql,
      [tenantLockKey("digest-preferences", "default")],
      async (tx) => {
        let rows = await tx<Row[]>`
          SELECT * FROM personal_preferences
          WHERE user_id=${this.context.userId}::uuid AND id='default'
        `;
        if (!rows[0]) {
          rows = await tx<Row[]>`
            INSERT INTO personal_preferences(id,user_id)
            VALUES ('default',${this.context.userId}::uuid)
            RETURNING *
          `;
        }
        return this.mapPreferences(rows[0]);
      }
    );
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
      WHERE user_id=${this.context.userId}::uuid AND id='default' RETURNING *`;
    return this.mapPreferences(rows[0]);
  }

  async resetPreferences(): Promise<PersonalPreferences> {
    const rows = await this.sql<Row[]>`
      UPDATE personal_preferences SET digest_enabled=false,digest_timezone='UTC',personalization_enabled=true,updated_at=now()
      WHERE user_id=${this.context.userId}::uuid AND id='default' RETURNING *`;
    return this.mapPreferences(rows[0]);
  }

  async findDigest(localDate: string): Promise<DigestRun | undefined> {
    const rows = await this.sql<Row[]>`
      SELECT * FROM digest_runs
      WHERE user_id=${this.context.userId}::uuid AND local_date=${localDate}`;
    return rows[0] ? this.hydrate(rows[0]) : undefined;
  }

  async listDigests(limit: number): Promise<DigestRun[]> {
    const rows = await this.sql<Row[]>`
      SELECT * FROM digest_runs
      WHERE user_id=${this.context.userId}::uuid
      ORDER BY local_date DESC, created_at DESC LIMIT ${limit}`;
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async createDigest(run: DigestRun): Promise<DigestRun> {
    return withTenantLocks(
      this.sql,
      [tenantLockKey("digest-id", run.id), tenantLockKey("digest-date", run.localDate)],
      async (tx) => {
        const existing = first(
          await tx<Row[]>`
            SELECT * FROM digest_runs
            WHERE user_id=${this.context.userId}::uuid AND local_date=${run.localDate}
          `
        );
        if (existing) return this.hydrate(existing, tx);
        await tx`
          INSERT INTO digest_runs(id,user_id,digest_date,local_date,status,created_at,completed_at,dismissed_at,timezone,selection_version,content_mode,selection_metadata,title_text,summary_text,updated_at)
          VALUES(${run.id},${this.context.userId}::uuid,${run.localDate},${run.localDate},${run.status},${run.createdAt},${run.completedAt ?? null},${run.dismissedAt ?? null},${run.timezone},${run.selectionVersion},${run.contentMode},${tx.json(run.selectionMetadata as never)},${run.title},${run.summary},${run.createdAt})
        `;
        for (const item of run.items) {
          await tx`
            INSERT INTO digest_items(user_id,digest_run_id,item_id,category,position,reason,title_snapshot,summary_snapshot,selection_metadata,dismissed_at)
            VALUES(${this.context.userId}::uuid,${run.id},${item.itemId},${item.category},${item.position},${item.reason},${item.title},${item.summary},${tx.json(item.selectionMetadata as never)},${item.dismissedAt ?? null})`;
        }
        return run;
      }
    );
  }

  async dismissDigest(id: string, at: string): Promise<DigestRun | undefined> {
    const rows = await this.sql<Row[]>`
      UPDATE digest_runs SET dismissed_at=COALESCE(dismissed_at,${at}),updated_at=${at}
      WHERE user_id=${this.context.userId}::uuid AND id=${id} RETURNING *`;
    return rows[0] ? this.hydrate(rows[0]) : undefined;
  }

  async dismissDigestItem(
    digestRunId: string,
    itemId: string,
    at: string
  ): Promise<DigestItem | undefined> {
    const eventKey = `digest-dismiss:${createHash("sha256")
      .update(`${digestRunId}:${itemId}`)
      .digest("hex")}`;
    return withTenantLocks(this.sql, [tenantLockKey("item-event-key", eventKey)], async (tx) => {
      const rows = await tx<Row[]>`
        UPDATE digest_items
        SET dismissed_at=COALESCE(dismissed_at,${at})
        WHERE user_id=${this.context.userId}::uuid
          AND digest_run_id=${digestRunId} AND item_id=${itemId}
        RETURNING *`;
      const row = rows[0];
      if (!row) return undefined;
      if (row.category === "resurfaced") {
        const existing = await tx`
          SELECT id FROM item_events
          WHERE user_id=${this.context.userId}::uuid AND event_key=${eventKey}
        `;
        if (!existing[0]) {
          await tx`
            INSERT INTO item_events(id,user_id,event_key,item_id,event_type,metadata,occurred_at)
            VALUES(${randomUUID()},${this.context.userId}::uuid,${eventKey},${itemId},'resurfacing_dismissed',${tx.json({ digestRunId } as never)},${at})
          `;
        }
      }
      return this.mapItem(row);
    });
  }

  async listPriorityCandidates(): Promise<DigestCandidate[]> {
    const rows = await this.sql<Row[]>`
      SELECT id,title,summary,priority,manual_priority,created_at FROM items i
      WHERE i.user_id=${this.context.userId}::uuid
        AND i.processing_status='ready' AND i.archived_at IS NULL AND NOT i.is_read
        AND NOT EXISTS (SELECT 1 FROM digest_items di
          WHERE di.user_id=${this.context.userId}::uuid AND di.item_id=i.id)
      ORDER BY CASE COALESCE(i.manual_priority,i.priority) WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        COALESCE(i.ai_priority_score,0) DESC,i.created_at DESC,i.id DESC
      LIMIT 30`;
    return rows.map((row) => this.mapCandidate(row));
  }

  async listResurfacedCandidates(): Promise<DigestCandidate[]> {
    const rows = await this.sql<Row[]>`
      SELECT id,title,summary,priority,manual_priority,created_at FROM items i
      WHERE i.user_id=${this.context.userId}::uuid
        AND i.processing_status='ready' AND i.archived_at IS NULL
        AND (NOT i.is_read OR EXISTS (SELECT 1 FROM collection_items ci
          WHERE ci.user_id=${this.context.userId}::uuid AND ci.item_id=i.id))
        AND i.last_opened_at <= now() - interval '14 days'
        AND NOT EXISTS (SELECT 1 FROM digest_items di
          WHERE di.user_id=${this.context.userId}::uuid AND di.item_id=i.id)
        AND NOT EXISTS (
          SELECT 1 FROM item_events e WHERE e.user_id=${this.context.userId}::uuid
            AND e.item_id=i.id AND e.event_type='resurfaced'
            AND e.occurred_at > now() - interval '30 days'
        )
        AND NOT EXISTS (
          SELECT 1 FROM item_events e WHERE e.user_id=${this.context.userId}::uuid
            AND e.item_id=i.id AND e.event_type='resurfacing_dismissed'
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
    return withTenantLocks(
      this.sql,
      [
        tenantLockKey("digest-job-id", job.id),
        tenantLockKey("digest-job-date", job.localDate),
        tenantLockKey("digest-job-idempotency", job.idempotencyKey),
      ],
      async (tx) => {
        let rows = await tx<Row[]>`
          UPDATE digest_jobs SET updated_at=${job.createdAt}
          WHERE user_id=${this.context.userId}::uuid AND local_date=${job.localDate}
          RETURNING *
        `;
        if (!rows[0]) {
          rows = await tx<Row[]>`
            INSERT INTO digest_jobs(id,user_id,local_date,idempotency_key,status,requested_by,created_at,updated_at)
            VALUES(${job.id},${this.context.userId}::uuid,${job.localDate},${job.idempotencyKey},${job.status},${job.requestedBy},${job.createdAt},${job.createdAt})
            RETURNING *
          `;
        }
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
    );
  }
}
