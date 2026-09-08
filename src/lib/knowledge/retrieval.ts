import type { Sql } from "postgres";

import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type { Priority } from "@/lib/types";

export type RetrievalMode = "keyword" | "semantic" | "hybrid" | "recent_fallback";
export type SearchArchiveFilter = "exclude" | "only" | "include";

export interface PassageFilters {
  read?: boolean;
  archive?: SearchArchiveFilter;
  topics?: string[];
  sources?: string[];
  contentTypes?: string[];
  priorities?: Priority[];
  collectionIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface PassageSearchQuery extends PassageFilters {
  query: string;
  limit?: number;
}

export interface RetrievalDegradation {
  code: "SEMANTIC_UNAVAILABLE" | "GENERATION_UNAVAILABLE";
  reason: string;
}

export interface PassageSearchResult {
  itemId: string;
  chunkId: string;
  contentVersionId: string;
  title: string;
  url: string;
  sourceType: string;
  excerpt: string;
  excerptStart: number;
  excerptEnd: number;
  score: number;
  reasons: string[];
  retrievalMode: RetrievalMode;
  degradation: RetrievalDegradation[];
}

export interface PassageSearchResponse {
  query: string;
  results: PassageSearchResult[];
  retrievalMode: RetrievalMode;
  degradation: RetrievalDegradation[];
}

export interface PassageSearchStore {
  searchKeyword(query: PassageSearchQuery): Promise<PassageSearchResult[]>;
  listRecent(query: PassageFilters & { limit?: number }): Promise<PassageSearchResult[]>;
}

export interface EmbeddingSpace {
  provider: string;
  model: string;
  dimensions: number;
  version: string;
}

export interface SemanticPassageQuery extends PassageFilters {
  embedding: readonly number[];
  space: EmbeddingSpace;
  limit?: number;
}

/** Provider-neutral contract only. No implementation is installed until one space is pinned. */
export interface SemanticPassageSearchStore {
  readonly space: EmbeddingSpace;
  searchSemantic(query: SemanticPassageQuery): Promise<PassageSearchResult[]>;
}

export const UNPINNED_SEMANTIC_DEGRADATION: RetrievalDegradation = {
  code: "SEMANTIC_UNAVAILABLE",
  reason: "Semantic retrieval is unavailable until an embedding model and dimensions are pinned",
};

export function validateEmbeddingSpace(space: EmbeddingSpace, embedding: readonly number[]): void {
  if (
    !space.provider.trim() ||
    !space.model.trim() ||
    !space.version.trim() ||
    !Number.isInteger(space.dimensions) ||
    space.dimensions <= 0
  ) {
    throw new Error("Embedding space must pin provider, model, version, and positive dimensions");
  }
  if (embedding.length !== space.dimensions || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding does not match the pinned vector space");
  }
}

type Row = Record<string, unknown>;
const MAX_EXCERPT_CHARACTERS = 1_200;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function boundedLimit(value: number | undefined): number {
  return Math.min(Math.max(Math.floor(value ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
}

function mapPassage(row: Row, mode: RetrievalMode, expectedUserId: string): PassageSearchResult {
  if (String(row.user_id) !== expectedUserId) {
    throw new Error("Tenant passage invariant failed");
  }
  const excerpt = String(row.excerpt);
  const chunkMatch = Boolean(row.chunk_match);
  const metadataMatch = Boolean(row.metadata_match);
  const reasons =
    mode === "recent_fallback"
      ? [Boolean(row.is_read) ? "recent:high_priority" : "recent:unread"]
      : [
          ...(chunkMatch ? ["keyword:chunk_text"] : []),
          ...(metadataMatch ? ["keyword:item_metadata"] : []),
        ];
  return {
    itemId: String(row.item_id),
    chunkId: String(row.chunk_id),
    contentVersionId: String(row.content_version_id),
    title: String(row.title),
    url: String(row.url),
    sourceType: String(row.source_type),
    excerpt,
    excerptStart: 0,
    excerptEnd: excerpt.length,
    score: Number(Number(row.score).toFixed(6)),
    reasons,
    retrievalMode: mode,
    degradation: [UNPINNED_SEMANTIC_DEGRADATION],
  };
}

/** PostgreSQL-only latest-version passage retrieval with filters applied before ranking. */
export class PostgresPassageSearchStore implements PassageSearchStore {
  private readonly context: AuthContext;

  constructor(
    private readonly sql: Sql,
    context: AuthContext
  ) {
    this.context = parseAuthContext(context);
  }

  private filters(filters: PassageFilters) {
    const conditions = [
      this.sql`i.user_id=${this.context.userId}::uuid`,
      this.sql`i.processing_status='ready'`,
    ];
    if (filters.read !== undefined) conditions.push(this.sql`i.is_read=${filters.read}`);
    if (filters.archive === "only") conditions.push(this.sql`i.archived_at IS NOT NULL`);
    else if (filters.archive !== "include") conditions.push(this.sql`i.archived_at IS NULL`);
    if (filters.topics?.length)
      conditions.push(this.sql`i.topics ?| ${this.sql.array(filters.topics)}`);
    if (filters.sources?.length)
      conditions.push(this.sql`i.source_type = ANY(${this.sql.array(filters.sources)})`);
    if (filters.contentTypes?.length)
      conditions.push(this.sql`i.content_type = ANY(${this.sql.array(filters.contentTypes)})`);
    if (filters.priorities?.length)
      conditions.push(
        this
          .sql`COALESCE(i.manual_priority,i.priority) = ANY(${this.sql.array(filters.priorities)})`
      );
    if (filters.collectionIds?.length)
      conditions.push(this.sql`EXISTS (
        SELECT 1 FROM collection_items ci
        WHERE ci.user_id=${this.context.userId}::uuid
          AND ci.item_id=i.id AND ci.collection_id = ANY(${this.sql.array(filters.collectionIds)})
      )`);
    if (filters.dateFrom) conditions.push(this.sql`i.created_at >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(this.sql`i.created_at <= ${filters.dateTo}`);
    return conditions.reduce((left, right) => this.sql`${left} AND ${right}`);
  }

  async searchKeyword(query: PassageSearchQuery) {
    const text = query.query.trim();
    if (!text) return [];
    const where = this.filters(query);
    const rows = await this.sql<Row[]>`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${text}) AS value
      ), filtered_items AS (
        SELECT i.* FROM items i WHERE ${where}
      ), latest_versions AS (
        SELECT DISTINCT ON (v.item_id) v.id,v.item_id
        FROM item_content_versions v
        JOIN filtered_items i ON i.user_id=v.user_id AND i.id=v.item_id
        WHERE v.user_id=${this.context.userId}::uuid
        ORDER BY v.item_id,v.version DESC
      ), ranked AS (
        SELECT i.user_id,i.id AS item_id,c.id AS chunk_id,c.content_version_id,i.title,i.url,i.source_type,
               i.created_at,i.is_read,c.ordinal,
               left(c.content,${MAX_EXCERPT_CHARACTERS}) AS excerpt,
               c.search_vector @@ q.value AS chunk_match,
               i.search_vector @@ q.value AS metadata_match,
               ts_rank_cd(c.search_vector,q.value)
                 + 0.35 * ts_rank_cd(i.search_vector,q.value) AS score
        FROM filtered_items i
        JOIN latest_versions v ON v.item_id=i.id
        JOIN content_chunks c ON c.user_id=${this.context.userId}::uuid
          AND c.content_version_id=v.id
        CROSS JOIN search_query q
        WHERE c.search_vector @@ q.value OR i.search_vector @@ q.value
      )
      SELECT * FROM ranked
      ORDER BY score DESC,created_at DESC,item_id ASC,ordinal ASC,chunk_id ASC
      LIMIT ${boundedLimit(query.limit)}
    `;
    return rows.map((row) => mapPassage(row, "keyword", this.context.userId));
  }

  async listRecent(query: PassageFilters & { limit?: number }) {
    const where = this.filters(query);
    const rows = await this.sql<Row[]>`
      WITH filtered_items AS (
        SELECT i.* FROM items i
        WHERE ${where}
          AND (i.is_read=false OR COALESCE(i.manual_priority,i.priority)='high')
      ), latest_versions AS (
        SELECT DISTINCT ON (v.item_id) v.id,v.item_id
        FROM item_content_versions v
        JOIN filtered_items i ON i.user_id=v.user_id AND i.id=v.item_id
        WHERE v.user_id=${this.context.userId}::uuid
        ORDER BY v.item_id,v.version DESC
      )
      SELECT i.user_id,i.id AS item_id,c.id AS chunk_id,c.content_version_id,i.title,i.url,i.source_type,
             i.created_at,i.is_read,c.ordinal,left(c.content,${MAX_EXCERPT_CHARACTERS}) AS excerpt,
             false AS chunk_match,false AS metadata_match,
             CASE WHEN COALESCE(i.manual_priority,i.priority)='high' THEN 2 ELSE 1 END AS score
      FROM filtered_items i
      JOIN latest_versions v ON v.item_id=i.id
      JOIN LATERAL (
        SELECT * FROM content_chunks candidate
        WHERE candidate.user_id=${this.context.userId}::uuid
          AND candidate.content_version_id=v.id
        ORDER BY candidate.ordinal ASC
        LIMIT 1
      ) c ON true
      ORDER BY score DESC,i.created_at DESC,i.id ASC,c.ordinal ASC
      LIMIT ${boundedLimit(query.limit)}
    `;
    return rows.map((row) => mapPassage(row, "recent_fallback", this.context.userId));
  }
}

export async function searchPassages(
  store: PassageSearchStore,
  query: PassageSearchQuery
): Promise<PassageSearchResponse> {
  const normalized = query.query.trim();
  const results = await store.searchKeyword({ ...query, query: normalized });
  return {
    query: normalized,
    results,
    retrievalMode: "keyword",
    degradation: [UNPINNED_SEMANTIC_DEGRADATION],
  };
}
