import type { Sql } from "postgres";

import { mapItem } from "@/lib/postgres/mappers";
import type { ContentItem, Priority } from "@/lib/types";

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
  const score = item.manualPriority
    ? manualPriorityScore(item.manualPriority) + recencyBoost
    : base + recencyBoost;
  const reasons = item.manualPriority
    ? [`Manual priority: ${item.manualPriority}`, "Recent items receive a small tie-break"]
    : [
        sort === "priority" || item.aiPriorityScore === undefined
          ? `Item priority: ${item.priority}`
          : "Current baseline priority score",
        "Recent items receive a small tie-break",
      ];
  return {
    sort,
    score: Number(score.toFixed(6)),
    reasons,
    components: {
      manualPriority: item.manualPriority,
      itemPriority: item.priority,
      aiPriorityScore: item.aiPriorityScore,
      recencyBoost: Number(recencyBoost.toFixed(6)),
    },
  };
}

function rowAiPriorityScore(row: Row): number | undefined {
  return row.ai_priority_score == null ? undefined : Number(row.ai_priority_score);
}

/** PostgreSQL-backed filtered, keyset-paginated feed; no client-side filtering. */
export class PostgresFeedQuery {
  constructor(private readonly sql: Sql) {}

  async list(query: FeedQuery = {}): Promise<FeedPage> {
    const sort = query.sort ?? "for_you";
    const cursor = decodeFeedCursor(query.cursor, sort);
    if (query.cursor && !cursor) throw new FeedQueryError("INVALID_CURSOR", "cursor is invalid");
    const limit = clampPageSize(query.limit);
    const now = (query.now ?? new Date()).toISOString();
    const conditions = [this.sql`i.processing_status <> 'rejected'`];

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
        WHERE ci.item_id=i.id AND ci.collection_id = ANY(${this.sql.array(query.collectionIds)})
      )`);
    if (query.dateFrom) conditions.push(this.sql`i.created_at >= ${query.dateFrom}`);
    if (query.dateTo) conditions.push(this.sql`i.created_at <= ${query.dateTo}`);

    // The same expression is used for the ordering cursor and explainFeedRank.
    const baseline =
      sort === "priority"
        ? this.sql`CASE i.priority WHEN 'high' THEN 90 WHEN 'medium' THEN 50 ELSE 20 END`
        : this
            .sql`COALESCE(i.ai_priority_score, CASE i.priority WHEN 'high' THEN 90 WHEN 'medium' THEN 50 ELSE 20 END)`;
    const score = this.sql`CASE
      WHEN i.manual_priority='high' THEN 300 + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
      WHEN i.manual_priority='medium' THEN 200 + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
      WHEN i.manual_priority='low' THEN -100 + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
      ELSE ${baseline}
        + exp(-GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - i.created_at)) / 86400) / 10) * 10
    END`;

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
      SELECT i.*, s.summary AS ai_summary_text, i.ai_priority_score, ${score} AS feed_rank_score
      FROM items i
      LEFT JOIN ai_summaries s ON s.item_id=i.id AND s.prompt_type='brief'
      ${where}
      ${order}
      LIMIT ${limit + 1}`;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => {
      const item = mapItem(row);
      const rank = explainFeedRank(
        { ...item, aiPriorityScore: rowAiPriorityScore(row) },
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
