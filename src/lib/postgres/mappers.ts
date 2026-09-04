import type { CaptureRecord, CaptureTokenRecord } from "@/lib/repositories/ports";
import type { ContentItem, ContentType, Priority, SourceType } from "@/lib/types";

type Row = Record<string, unknown>;
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

export function mapItem(row: Row): ContentItem {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary),
    fullContent: row.full_content == null ? undefined : String(row.full_content),
    sourceType: row.source_type as SourceType,
    contentType: row.content_type as ContentType,
    topics: (row.topics ?? []) as string[],
    author: row.author == null ? undefined : String(row.author),
    publication: row.publication == null ? undefined : String(row.publication),
    url: String(row.url),
    priority: row.priority as Priority,
    isRead: Boolean(row.is_read),
    createdAt: iso(row.created_at),
    duration: row.duration == null ? undefined : String(row.duration),
    thumbnailUrl: row.thumbnail_url == null ? undefined : String(row.thumbnail_url),
    extractedLinks: row.extracted_links == null ? undefined : ContentItemLinks(row.extracted_links),
    contentExtractedAt:
      row.content_extracted_at == null ? undefined : iso(row.content_extracted_at),
    aiSummary: row.ai_summary_text == null ? undefined : String(row.ai_summary_text),
    processingStatus: (row.processing_status ?? "ready") as ContentItem["processingStatus"],
    rejectionReason: row.rejection_reason == null ? undefined : String(row.rejection_reason),
    contentClassification: row.content_classification ?? undefined,
    detectedMedia: row.detected_media == null ? undefined : (row.detected_media as unknown[]),
    informationDensity:
      row.information_density == null ? undefined : Number(row.information_density),
  };
}

function ContentItemLinks(value: unknown): NonNullable<ContentItem["extractedLinks"]> {
  return value as NonNullable<ContentItem["extractedLinks"]>;
}

export function mapCapture(row: Row): CaptureRecord {
  return {
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

export function mapCaptureToken(row: Row): CaptureTokenRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    tokenHash: String(row.token_hash),
    tokenPrefix: String(row.token_prefix),
    createdAt: iso(row.created_at),
    lastUsedAt: row.last_used_at == null ? undefined : iso(row.last_used_at),
    revokedAt: row.revoked_at == null ? undefined : iso(row.revoked_at),
  };
}
