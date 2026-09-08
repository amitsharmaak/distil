import type { Sql } from "postgres";

import { mapItem } from "@/lib/postgres/mappers";
import type { ContentItem, Priority } from "@/lib/types";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";

export const DEFAULT_FEED_PAGE_SIZE = 30;
export const MAX_FEED_PAGE_SIZE = 100;

export type FeedSort = "recent" | "priority" | "for_you";
export type FeedArchiveFilter = "exclude" | "only" | "include";

export interface FeedFilters {
  read?: boolean;
  archive?: FeedArchiveFilter;
  topics?: string[];
  sources?: string[];
  contentTypes?: string[];
  priorities?: Priority[];
  collectionIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface FeedQuery extends FeedFilters {
  sort?: FeedSort;
  limit?: number;
  cursor?: string;
  /** Injectable clock keeps ordering and cursor tests deterministic. */
  now?: Date;
  /** Server-gated and user-controlled; never inferred from a client request. */
  personalizationEnabled?: boolean;
}

export interface FeedRankExplanation {
  sort: FeedSort;
  score: number;
  reasons: string[];
  components: {
    manualPriority?: Priority;
    itemPriority: Priority;
    aiPriorityScore?: number;
    recencyBoost?: number;
    affinityScore?: number;
  };
}

export type FeedItem = ContentItem & { rank: FeedRankExplanation };

export interface FeedPage {
  items: FeedItem[];
  nextCursor?: string;
}

export interface ResurfacingCandidate extends Pick<
  ContentItem,
  "isRead" | "archivedAt" | "lastOpenedAt" | "processingStatus"
> {
  /** A manually saved collection is an intentional signal to revisit. */
  isInCollection: boolean;
  lastResurfacedAt?: string;
  lastDismissedAt?: string;
}

export type ResurfacingEligibility =
  | { eligible: true; reason: "Worth revisiting" }
  | {
      eligible: false;
      reason:
        | "archived"
        | "not_ready"
        | "not_stale"
        | "not_unread_or_saved"
        | "resurfacing_cooldown"
        | "dismissal_cooldown";
    };

/**
 * Pure policy for Today/revisit selection. Event lookup remains a separate
 * concern, allowing the policy to be tested without persistence or clocks.
 */
export function resurfacingEligibility(
  candidate: ResurfacingCandidate,
  now = new Date()
): ResurfacingEligibility {
  if (candidate.archivedAt) return { eligible: false, reason: "archived" };
  if (candidate.processingStatus && candidate.processingStatus !== "ready") {
    return { eligible: false, reason: "not_ready" };
  }
  if (
    !candidate.lastOpenedAt ||
    now.getTime() - new Date(candidate.lastOpenedAt).getTime() < 14 * 86_400_000
  ) {
    return { eligible: false, reason: "not_stale" };
  }
  if (candidate.isRead && !candidate.isInCollection) {
    return { eligible: false, reason: "not_unread_or_saved" };
  }
  if (
    candidate.lastDismissedAt &&
    now.getTime() - new Date(candidate.lastDismissedAt).getTime() < 90 * 86_400_000
  ) {
    return { eligible: false, reason: "dismissal_cooldown" };
  }
  if (
    candidate.lastResurfacedAt &&
    now.getTime() - new Date(candidate.lastResurfacedAt).getTime() < 30 * 86_400_000
  ) {
    return { eligible: false, reason: "resurfacing_cooldown" };
  }
  return { eligible: true, reason: "Worth revisiting" };
}

interface Cursor {
  v: 1;
  sort: FeedSort;
  score?: number;
  createdAt: string;
  id: string;
}

type Row = Record<string, unknown>;

function priorityScore(priority: Priority): number {
  return priority === "high" ? 90 : priority === "medium" ? 50 : 20;
}

function manualPriorityScore(priority: Priority): number {
  // A manual setting is deliberately outside the learned/baseline score range.
  return priority === "high" ? 300 : priority === "medium" ? 200 : -100;
}

export const PERSONALIZATION_HALF_LIFE_DAYS = 60;

export function decayAffinity(weight: number, occurredAt: string, now = new Date()): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(occurredAt).getTime()) / 86_400_000);
  return weight * Math.exp((-Math.LN2 * ageDays) / PERSONALIZATION_HALF_LIFE_DAYS);
}

/**
 * Reserves at most two places in a complete top ten for relevant alternatives.
 * Pagination deliberately applies the SQL score only; reordering a partial page
 * would make opaque keyset cursors skip unreturned rows.
 */
export function reserveTopTenDiversity<T extends Pick<ContentItem, "id" | "sourceType" | "topics">>(
  items: T[]
): T[] {
  if (items.length <= 10) return items;
  const top = items.slice(0, 10);
  const dominantSource = top.reduce<Record<string, number>>((counts, item) => {
    counts[item.sourceType] = (counts[item.sourceType] ?? 0) + 1;
    return counts;
  }, {});
  const source = Object.entries(dominantSource).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0];
  if (!source || source[1] < 8) return items;
  const alternatives = items
    .slice(10)
    .filter((item) => item.sourceType !== source[0])
    .slice(0, 2);
  if (!alternatives.length) return items;
  const replacementCount = alternatives.length;
  const removed = top.slice(10 - replacementCount);
  const retained = top.slice(0, 10 - replacementCount);
  const selectedIds = new Set([...retained, ...alternatives].map((item) => item.id));
  return [
    ...retained,
    ...alternatives,
    ...removed,
    ...items.slice(10).filter((item) => !selectedIds.has(item.id)),
  ];
}

function clampPageSize(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_FEED_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 1), MAX_FEED_PAGE_SIZE);
}

export function encodeFeedCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeFeedCursor(value: string | undefined, sort: FeedSort): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (
      parsed.v !== 1 ||
      parsed.sort !== sort ||
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(new Date(parsed.createdAt).getTime()) ||
      (sort !== "recent" && !Number.isFinite(parsed.score))
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Keep this calculation deliberately independent from preference-learning.
 * It mirrors the SQL expression used for keyset pagination, so the returned
 * explanation is the actual ordering decision rather than a best-effort copy.
 */
export function explainFeedRank(
  item: Pick<ContentItem, "priority" | "manualPriority" | "createdAt"> & {
    aiPriorityScore?: number;
    affinityScore?: number;
  },
  sort: FeedSort,
  now = new Date()
): FeedRankExplanation {
  if (sort === "recent") {
    return {
      sort,
      score: new Date(item.createdAt).getTime(),
      reasons: ["Chronological order"],
      components: { itemPriority: item.priority },
    };
  }

  const ageDays = Math.max(0, (now.getTime() - new Date(item.createdAt).getTime()) / 86_400_000);
  const recencyBoost = Math.exp(-ageDays / 10) * 10;
  const base =
    sort === "priority"
      ? priorityScore(item.priority)
      : (item.aiPriorityScore ?? priorityScore(item.priority));
  const affinityScore = sort === "for_you" ? (item.affinityScore ?? 0) : 0;
  const score = item.manualPriority
    ? manualPriorityScore(item.manualPriority) + recencyBoost
    : base + recencyBoost + affinityScore;
  const reasons = item.manualPriority
    ? [`Manual priority: ${item.manualPriority}`, "Recent items receive a small tie-break"]
    : [
        sort === "priority" || item.aiPriorityScore === undefined
          ? `Item priority: ${item.priority}`
          : "Current baseline priority score",
        "Recent items receive a small tie-break",
      ];
  if (!item.manualPriority && affinityScore !== 0) {
    reasons.splice(1, 0, "Personalized from explicit feedback and reading actions");
  }
  return {
    sort,
    score: Number(score.toFixed(6)),
    reasons,
    components: {
      manualPriority: item.manualPriority,
      itemPriority: item.priority,
      aiPriorityScore: item.aiPriorityScore,
      recencyBoost: Number(recencyBoost.toFixed(6)),
      affinityScore: Number(affinityScore.toFixed(6)),
    },
  };
}

function rowAiPriorityScore(row: Row): number | undefined {
  return row.ai_priority_score == null ? undefined : Number(row.ai_priority_score);
}

function rowAffinityScore(row: Row): number | undefined {
  return row.feed_affinity_score == null ? undefined : Number(row.feed_affinity_score);
}

/** PostgreSQL-backed filtered, keyset-paginated feed; no client-side filtering. */
export class PostgresFeedQuery {
  private readonly context: AuthContext;

  constructor(
    private readonly sql: Sql,
    context: AuthContext
  ) {
    this.context = parseAuthContext(context);
  }

  async list(query: FeedQuery = {}): Promise<FeedPage> {
    const sort = query.sort ?? "for_you";
    const cursor = decodeFeedCursor(query.cursor, sort);
    if (query.cursor && !cursor) throw new FeedQueryError("INVALID_CURSOR", "cursor is invalid");
    const limit = clampPageSize(query.limit);
    const now = (query.now ?? new Date()).toISOString();
    const conditions = [
      this.sql`i.user_id=${this.context.userId}::uuid`,
      this.sql`i.processing_status <> 'rejected'`,
    ];

    if (query.read !== undefined) conditions.push(this.sql`i.is_read=${query.read}`);
    if (query.archive === "only") conditions.push(this.sql`i.archived_at IS NOT NULL`);
    else if (query.archive !== "include") conditions.push(this.sql`i.archived_at IS NULL`);
    if (query.topics?.length)
      conditions.push(this.sql`i.topics ?| ${this.sql.array(query.topics)}`);
    if (query.sources?.length)
      conditions.push(this.sql`i.source_type = ANY(${this.sql.array(query.sources)})`);
    if (query.contentTypes?.length)
      conditions.push(this.sql`i.content_type = ANY(${this.sql.array(query.contentTypes)})`);
    if (query.priorities?.length)
      conditions.push(
        this.sql`COALESCE(i.manual_priority, i.priority) = ANY(${this.sql.array(query.priorities)})`
      );
    if (query.collectionIds?.length)
      conditions.push(this.sql`EXISTS (
        SELECT 1 FROM collection_items ci
        WHERE ci.user_id=${this.context.userId}::uuid
          AND ci.item_id=i.id AND ci.collection_id = ANY(${this.sql.array(query.collectionIds)})
      )`);
    if (query.dateFrom) conditions.push(this.sql`i.created_at >= ${query.dateFrom}`);
    if (query.dateTo) conditions.push(this.sql`i.created_at <= ${query.dateTo}`);

    // The same expression is used for the ordering cursor and explainFeedRank.
    const baseline =
      sort === "priority"
        ? this.sql`CASE i.priority WHEN 'high' THEN 90 WHEN 'medium' THEN 50 ELSE 20 END`
        : this
            .sql`COALESCE(i.ai_priority_score, CASE i.priority WHEN 'high' THEN 90 WHEN 'medium' THEN 50 ELSE 20 END)`;
    const affinity =
      query.personalizationEnabled && sort === "for_you"
        ? this.sql`COALESCE((
            SELECT SUM(
              (CASE e.event_type
                WHEN 'feedback_recorded' THEN CASE
                  WHEN COALESCE(e.metadata->>'rating','') ~ '^-?[0-9]+$'
                    THEN CASE WHEN (e.metadata->>'rating')::integer > 0 THEN 3 ELSE -3 END
                  ELSE 1
                END
                WHEN 'collection_added' THEN 2
                WHEN 'completed' THEN 3
                WHEN 'archived' THEN -2
                ELSE 0
              END) * exp(-ln(2) * GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - e.occurred_at)) / 86400) / ${PERSONALIZATION_HALF_LIFE_DAYS})
            )
            FROM item_events e
            JOIN items signal ON signal.user_id=e.user_id AND signal.id=e.item_id
            WHERE e.user_id=${this.context.userId}::uuid
              AND signal.user_id=${this.context.userId}::uuid
              AND e.event_type IN ('feedback_recorded','collection_added','completed','archived')
              AND (
                signal.source_type=i.source_type
                OR (i.author IS NOT NULL AND signal.author=i.author)
                OR signal.content_type=i.content_type
                OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(i.topics) target(topic)
                  WHERE signal.topics ? target.topic
                )
              )
          ), 0)`
        : this.sql`0`;
    const unroundedScore = this.sql`CASE
      WHEN i.manual_priority='high' THEN 300 + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
      WHEN i.manual_priority='medium' THEN 200 + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
      WHEN i.manual_priority='low' THEN -100 + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
      ELSE ${baseline}
        + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
        + ${affinity}
    END`;
    // Keyset cursors cross the PostgreSQL/JSON boundary. Quantize once in SQL
    // so ordering, equality checks, and the serialized cursor use the same
    // stable value instead of comparing a binary float after a JS round-trip.
    const score = this.sql`ROUND((${unroundedScore})::numeric, 6)`;

    if (cursor) {
      if (sort === "recent") {
        conditions.push(
          this
            .sql`(i.created_at < ${cursor.createdAt}::timestamptz OR (i.created_at = ${cursor.createdAt}::timestamptz AND i.id < ${cursor.id}))`
        );
      } else {
        conditions.push(this.sql`(
          ${score} < ${cursor.score!} OR
          (${score} = ${cursor.score!} AND i.created_at < ${cursor.createdAt}::timestamptz) OR
          (${score} = ${cursor.score!} AND i.created_at = ${cursor.createdAt}::timestamptz AND i.id < ${cursor.id})
        )`);
      }
    }

    const where = this
      .sql`WHERE ${conditions.reduce((left, right) => this.sql`${left} AND ${right}`)}`;
    const order =
      sort === "recent"
        ? this.sql`ORDER BY i.created_at DESC, i.id DESC`
        : this.sql`ORDER BY ${score} DESC, i.created_at DESC, i.id DESC`;
    const rows = await this.sql<Row[]>`
      SELECT i.*, s.summary AS ai_summary_text, i.ai_priority_score, ${affinity} AS feed_affinity_score, ${score} AS feed_rank_score
      FROM items i
      LEFT JOIN ai_summaries s ON s.user_id=${this.context.userId}::uuid
        AND s.item_id=i.id AND s.prompt_type='brief'
      ${where}
      ${order}
      LIMIT ${limit + 1}`;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    let items = pageRows.map((row) => {
      const item = mapItem(row);
      const rank = explainFeedRank(
        { ...item, aiPriorityScore: rowAiPriorityScore(row), affinityScore: rowAffinityScore(row) },
        sort,
        new Date(now)
      );
      // PostgreSQL's value is retained verbatim for an exact keyset cursor.
      // Recent order is keyed by createdAt, so its explanation keeps the timestamp score.
      if (sort !== "recent") rank.score = Number(row.feed_rank_score);
      return {
        ...item,
        rank,
      };
    });
    // See reserveTopTenDiversity: only a complete result can be safely
    // rearranged without weakening the feed's opaque keyset cursor contract.
    if (!query.cursor && !hasMore && sort === "for_you" && query.personalizationEnabled) {
      items = reserveTopTenDiversity(items);
    }
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeFeedCursor({
              v: 1,
              sort,
              score: sort === "recent" ? undefined : last.rank.score,
              createdAt: last.createdAt,
              id: last.id,
            })
          : undefined,
    };
  }
}

export class FeedQueryError extends Error {
  constructor(
    readonly code: "INVALID_CURSOR",
    message: string
  ) {
    super(message);
    this.name = "FeedQueryError";
  }
}
