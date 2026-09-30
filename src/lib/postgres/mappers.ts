import type { CaptureRecord, CaptureTokenRecord } from "@/lib/repositories/ports";
import { userIdSchema } from "@/lib/contracts/tenant-context";
import {
  LIFE_AREAS,
  type ContentItem,
  type ContentItemSummary,
  type ContentType,
  type LifeArea,
  type Priority,
  type SourceType,
} from "@/lib/types";

type Row = Record<string, unknown>;
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

/**
 * Maps the summary column projection of an items row. It deliberately never
 * reads `full_content`, `extracted_links`, `detected_media`,
 * `content_classification` or `thumbnail_url`, so list surfaces cannot leak
 * article bodies even when a row happens to carry them.
 */
export function mapItemSummary(row: Row): ContentItemSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary),
    sourceType: row.source_type as SourceType,
    contentType: row.content_type as ContentType,
    topics: (row.topics ?? []) as string[],
    author: row.author == null ? undefined : String(row.author),
    publication: row.publication == null ? undefined : String(row.publication),
    url: String(row.url),
    priority: row.priority as Priority,
    isRead: Boolean(row.is_read),
    archivedAt: row.archived_at == null ? undefined : iso(row.archived_at),
    readAt: row.read_at == null ? undefined : iso(row.read_at),
    lastOpenedAt: row.last_opened_at == null ? undefined : iso(row.last_opened_at),
    readingProgress: row.reading_progress == null ? undefined : Number(row.reading_progress),
    manualPriority: row.manual_priority == null ? undefined : (row.manual_priority as Priority),
    createdAt: iso(row.created_at),
    duration: row.duration == null ? undefined : String(row.duration),
    contentExtractedAt:
      row.content_extracted_at == null ? undefined : iso(row.content_extracted_at),
    aiSummary: row.ai_summary_text == null ? undefined : String(row.ai_summary_text),
    processingStatus: (row.processing_status ?? "ready") as ContentItem["processingStatus"],
    rejectionReason: row.rejection_reason == null ? undefined : String(row.rejection_reason),
    informationDensity:
      row.information_density == null ? undefined : Number(row.information_density),
    ...areaFields(row),
  };
}

function lifeArea(value: unknown): LifeArea | undefined {
  return typeof value === "string" && (LIFE_AREAS as readonly string[]).includes(value)
    ? (value as LifeArea)
    : undefined;
}

/** The AI's area, Amit's correction, and the effective area (the correction wins). */
function areaFields(row: Row): Pick<ContentItem, "area" | "aiArea" | "manualArea"> {
  const aiArea = lifeArea(row.area);
  const manualArea = lifeArea(row.manual_area);
  const area = manualArea ?? aiArea;
  return {
    ...(area ? { area } : {}),
    ...(aiArea ? { aiArea } : {}),
    ...(manualArea ? { manualArea } : {}),
  };
}

/** Maps a full items row: the summary projection plus the bulky detail columns. */
export function mapItem(row: Row): ContentItem {
  return {
    ...mapItemSummary(row),
    fullContent: row.full_content == null ? undefined : String(row.full_content),
    thumbnailUrl: row.thumbnail_url == null ? undefined : String(row.thumbnail_url),
    extractedLinks: row.extracted_links == null ? undefined : ContentItemLinks(row.extracted_links),
    contentClassification: row.content_classification ?? undefined,
    detectedMedia: row.detected_media == null ? undefined : (row.detected_media as unknown[]),
  };
}

function ContentItemLinks(value: unknown): NonNullable<ContentItem["extractedLinks"]> {
  return value as NonNullable<ContentItem["extractedLinks"]>;
}

export function mapCapture(row: Row): CaptureRecord {
  return {
    userId: userIdSchema.parse(row.user_id),
    originActorKind: String(row.origin_actor_kind) as CaptureRecord["originActorKind"],
    originActorId: String(row.origin_actor_id),
    id: String(row.id),
    url: String(row.url),
    normalizedUrl: String(row.normalized_url),
    title: row.title == null ? undefined : String(row.title),
    notes: row.notes == null ? undefined : String(row.notes),
    topics: (row.topics ?? []) as string[],
    priority: row.priority as Priority,
    source: row.source as CaptureRecord["source"],
    status: row.status as CaptureRecord["status"],
    itemId: row.item_id == null ? undefined : String(row.item_id),
    retryable: Boolean(row.retryable),
    attempts: Number(row.attempts),
    lastErrorCode: row.last_error_code == null ? undefined : String(row.last_error_code),
    lastErrorMessage: row.last_error_message == null ? undefined : String(row.last_error_message),
    error:
      row.last_error_code == null
        ? undefined
        : { code: String(row.last_error_code), message: String(row.last_error_message ?? "") },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** A capture token as listed to its owner: everything except the hash. */
export function mapCaptureTokenSummary(row: Row): Omit<CaptureTokenRecord, "tokenHash"> {
  return {
    userId: userIdSchema.parse(row.user_id),
    id: String(row.id),
    name: String(row.name),
    tokenPrefix: String(row.token_prefix),
    kind: row.kind === "browser" ? "browser" : "manual",
    ...(row.label == null ? {} : { label: String(row.label) }),
    createdAt: iso(row.created_at),
    lastUsedAt: row.last_used_at == null ? undefined : iso(row.last_used_at),
    revokedAt: row.revoked_at == null ? undefined : iso(row.revoked_at),
  };
}

export function mapCaptureToken(row: Row): CaptureTokenRecord {
  return { ...mapCaptureTokenSummary(row), tokenHash: String(row.token_hash) };
}
