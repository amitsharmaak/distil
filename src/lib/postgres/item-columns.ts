/**
 * Explicit column projections for the `items` table. Every items query goes
 * through one of these lists so nothing selects `*`: the generated
 * `search_vector` is never fetched, and list surfaces never pull article
 * bodies or the other bulky detail payloads.
 *
 * The lists are static identifiers owned by this module; they are spliced into
 * queries as raw SQL text and must never contain caller input.
 */

/** Columns every item projection carries; the summary shape maps exactly these. */
export const ITEM_SUMMARY_COLUMNS = [
  "id",
  "title",
  "summary",
  "source_type",
  "content_type",
  "topics",
  "author",
  "publication",
  "url",
  "normalized_url",
  "priority",
  "is_read",
  "archived_at",
  "read_at",
  "last_opened_at",
  "reading_progress",
  "manual_priority",
  "created_at",
  "duration",
  "ai_priority_score",
  "content_extracted_at",
  "processing_status",
  "rejection_reason",
  "information_density",
] as const;

/** Bulky detail columns only the full item projection fetches. */
export const ITEM_DETAIL_COLUMNS = [
  "full_content",
  "thumbnail_url",
  "extracted_links",
  "content_classification",
  "detected_media",
] as const;

/** Every items column except the generated `search_vector`. */
export const ITEM_COLUMNS = [...ITEM_SUMMARY_COLUMNS, ...ITEM_DETAIL_COLUMNS] as const;

function qualify(columns: readonly string[], alias: string): string {
  return columns.map((column) => `${alias}.${column}`).join(",");
}

/** `i.id,i.title,...` for the summary projection; `alias` is a fixed table alias. */
export function itemSummaryColumnsSql(alias = "i"): string {
  return qualify(ITEM_SUMMARY_COLUMNS, alias);
}

/** `i.id,i.title,...,i.detected_media` for the full projection. */
export function itemColumnsSql(alias = "i"): string {
  return qualify(ITEM_COLUMNS, alias);
}
