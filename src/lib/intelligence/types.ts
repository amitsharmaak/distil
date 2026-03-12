/**
 * Unified Intelligence Layer — Type Definitions
 *
 * Universal type definitions for the intelligence pipeline. All stages consume
 * and produce these types. Import SourceType, ContentType, Priority, and
 * ExtractedLink from the core types module.
 */

import type {
  ContentType,
  ExtractedLink,
  Priority,
  SourceType,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Stage 0: Connector Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata attached to raw content from connectors. Fields vary by source type
 * (e.g. Gmail has subject/sender, Slack has channelName/authorName).
 */
export interface RawContentMetadata {
  /** Email subject line */
  subject?: string;
  /** Email sender address */
  sender?: string;
  /** Extracted domain from sender */
  senderDomain?: string;
  /** Original creation time (ISO) */
  timestamp?: string;
  /** Slack channel name */
  channelName?: string;
  /** Message author display name */
  authorName?: string;
  /** Email headers */
  headers?: Record<string, string>;
  /** Gmail labels */
  labels?: string[];
  /** Browser tab title */
  pageTitle?: string;
  /** User-provided notes (from browser extension) */
  userNotes?: string;
  /** User-provided priority (from manual/browser-extension save) */
  priority?: Priority;
  /** User-provided content type */
  contentType?: ContentType;
  /** User-provided topic tags */
  topics?: string[];
}

/**
 * Universal input format produced by all connectors (Gmail, Slack, browser
 * extension, manual). This is the canonical shape fed into Stage 1 (classifier).
 */
export interface RawContent {
  /** Generated UUID */
  id: string;
  /** Source of the content (from existing types) */
  sourceType: SourceType;
  /** Full raw content (email HTML, page HTML, Slack message text) */
  rawBody: string;
  /** Plain text version if available */
  rawTextContent?: string;
  /** Primary URL */
  url?: string;
  /** All URLs found in the content */
  urls?: string[];
  /** Source-specific metadata */
  metadata: RawContentMetadata;
  /** ISO timestamp when content was fetched */
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Union type for email classification categories. Used by Stage 1 (classifier)
 * and Stage 2 (relevance gate) for Gmail content.
 */
export type EmailCategory =
  | "newsletter"
  | "digest"
  | "transactional"
  | "personal"
  | "promotional"
  | "notification"
  | "automated"
  | "announcement"
  | "unknown";

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Classifier Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Media types that can be detected on a page. Used for content classification.
 */
export type MediaType =
  | "text"
  | "images"
  | "embedded-video"
  | "embedded-audio"
  | "interactive"
  | "pdf";

/**
 * Output of Stage 1 (classifier). Determines content type, language, and
 * whether the page is real content vs. login, error, paywall, etc.
 */
export interface ContentClassification {
  /** Email category — only populated when sourceType is gmail */
  emailCategory?: EmailCategory;
  /** Content type: article | video | podcast (reuse existing) */
  contentType: ContentType;
  /** What media is present on the page */
  detectedMediaTypes: MediaType[];
  /** ISO 639-1 language code (e.g. "en") */
  language: string;
  /** 0–1 classification confidence score */
  confidence: number;
  /** Is this a real content page (vs login, error, paywall, etc.) */
  isContentPage: boolean;
  /** ISO timestamp when classification was performed */
  classifiedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Relevance Gate Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Output of Stage 2 (relevance gate). Determines whether content passes the
 * relevance filter (e.g. email category allowlist) and proceeds to extraction.
 */
export interface RelevanceResult {
  /** Whether the content was accepted for further processing */
  accepted: boolean;
  /** Why it was rejected (populated when accepted=false) */
  reason?: string;
  /** Which category matched (for emails) */
  matchedCategory?: EmailCategory;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Extractor Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A link extracted from content with surrounding context. Used by the extractor
 * before filtering to high/medium relevance links in the analyzer.
 */
export interface RawExtractedLink {
  /** The link URL */
  url: string;
  /** The link text (anchor text) */
  anchorText?: string;
  /** ~100 chars around the link in the content */
  surroundingContext?: string;
}

/**
 * Output of Stage 3 (extractor). Distilled core content, title, author,
 * publication, thumbnail, and all links with context.
 */
export interface ExtractedContentResult {
  /** Distilled core content (HTML or text) */
  cleanContent: string;
  /** Plain text version */
  cleanTextContent: string;
  /** Best title found */
  title: string;
  /** Author attribution */
  author?: string;
  /** Source publication/site */
  publication?: string;
  /** Best image URL */
  thumbnailUrl?: string;
  /** All links found in content with context */
  allLinks: RawExtractedLink[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: Analyzer Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A detected media item (video, audio, image) with platform and metadata.
 */
export interface DetectedMedia {
  type: "video" | "audio" | "image";
  /** Platform (e.g. "youtube", "vimeo", "spotify") */
  platform?: string;
  /** Human-readable duration (e.g. "12:34") */
  duration?: string;
  /** The embed/src URL */
  embedUrl?: string;
  /** Thumbnail image URL */
  thumbnailUrl?: string;
}

/**
 * A named entity extracted from content (person, company, technology, etc.).
 */
export interface ContentEntity {
  name: string;
  type: "person" | "company" | "technology" | "topic" | "place";
}

/**
 * Output of Stage 4 (analyzer). Detected media, filtered relevant links,
 * entities, word count, read time, and information density score.
 */
export interface ContentAnalysis {
  /** Detected media items (videos, audio, images) */
  detectedMedia: DetectedMedia[];
  /** Links filtered to high/medium relevance only (reuse existing ExtractedLink) */
  relevantLinks: ExtractedLink[];
  /** Extracted entities (people, companies, topics, etc.) */
  entities: ContentEntity[];
  /** Word count of the content */
  wordCount: number;
  /** Estimated read time in minutes */
  estimatedReadTimeMinutes: number;
  /** 0–1 information density score */
  informationDensityScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5: Enricher Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Output of Stage 5 (enricher). AI-generated summary, topics, and priority
 * scoring. This feeds into the final ContentItem creation.
 */
export interface EnrichedContent {
  /** AI-generated summary text */
  summary: string;
  /** AI-generated topic tags */
  topics: string[];
  /** 0–100 numeric priority score */
  priorityScore: number;
  /** Priority level (reuse existing Priority type) */
  priority: Priority;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Final Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status of content as it moves through the pipeline.
 */
export type ProcessingStatus = "processing" | "ready" | "rejected";

/**
 * Final output of the intelligence pipeline. Contains all stage outputs and
 * the overall status. When status is "rejected", rejectionReason is populated.
 */
export interface ProcessingResult {
  /** ID of the RawContent that was processed */
  rawContentId: string;
  /** Current pipeline status */
  status: ProcessingStatus;
  /** Populated when status="rejected" */
  rejectionReason?: string;
  /** Stage 1 output */
  classification?: ContentClassification;
  /** Stage 3 output (skipped if rejected at Stage 2) */
  extracted?: ExtractedContentResult;
  /** Stage 4 output */
  analysis?: ContentAnalysis;
  /** Stage 5 output */
  enriched?: EnrichedContent;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User settings for email category preferences. Controls which email categories
 * pass the relevance gate in Stage 2.
 */
export interface EmailIntelligenceSettings {
  /** Which categories pass the relevance gate. Default: ["newsletter", "digest", "announcement"] */
  allowedCategories: EmailCategory[];
}
