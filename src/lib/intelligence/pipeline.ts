/**
 * Unified Intelligence Layer — Pipeline Orchestrator
 *
 * Single entry point for all content ingestion. Connectors call processContent()
 * to run raw content through the full pipeline: classify → relevance → extract
 * → analyze → enrich → persist.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { randomUUID } from "crypto";

import {
  getItemByNormalizedUrl,
  getUserSetting,
  insertItem,
  insertRawContent,
  updateItem,
  updateItemProcessingStatus,
  updateItemPriorityScore,
  updateRawContentItemId,
} from "../db";
import type { ContentItem, SourceType } from "../types";
import { generateSummary } from "../ai/summarize";
import { embedItem } from "../ai/embeddings";
import { detectStrategy } from "../content-strategies";
import { classify } from "./classifier";
import { checkRelevance } from "./relevance";
import { extractContent } from "./extractor";
import { analyzeContent } from "./analyzer";
import { enrichContent } from "./enricher";
import type {
  RawContent,
  RawContentMetadata,
  ContentClassification,
  ExtractedContentResult,
  ContentAnalysis,
  EnrichedContent,
  ProcessingResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Default fallbacks for stage failures
// ─────────────────────────────────────────────────────────────────────────────

function defaultClassification(): ContentClassification {
  return {
    contentType: "article",
    detectedMediaTypes: ["text"],
    language: "en",
    confidence: 0,
    isContentPage: true,
    classifiedAt: new Date().toISOString(),
  };
}

function minimalExtraction(raw: RawContent): ExtractedContentResult {
  const title =
    raw.metadata.subject ?? raw.metadata.pageTitle ?? raw.url ?? "Untitled";
  return {
    cleanContent: "",
    cleanTextContent: "",
    title,
    allLinks: [],
  };
}

function emptyAnalysis(): ContentAnalysis {
  return {
    detectedMedia: [],
    relevantLinks: [],
    entities: [],
    wordCount: 0,
    estimatedReadTimeMinutes: 0,
    informationDensityScore: 0.5,
  };
}

function minimalEnrichment(extracted: ExtractedContentResult): EnrichedContent {
  return {
    summary: extracted.title || "",
    topics: [],
    priorityScore: 50,
    priority: "medium",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes raw content through the full intelligence pipeline.
 * Never throws — all errors result in a rejected status.
 */
export async function processContent(raw: RawContent): Promise<ProcessingResult> {
  try {
    // Step 1: Save RawContent to DB (before any AI processing)
    insertRawContent({
      id: raw.id,
      sourceType: raw.sourceType,
      rawBody: raw.rawBody,
      metadata: raw.metadata as Record<string, unknown>,
      fetchedAt: raw.fetchedAt,
    });

    // Step 2: Deduplication check
    if (raw.url) {
      const existing = getItemByNormalizedUrl(raw.url);
      if (existing) {
        return {
          rawContentId: raw.id,
          status: "ready",
        };
      }
    }

    // Step 3: Insert item in 'processing' state
    const createdAt =
      raw.metadata.timestamp ?? raw.fetchedAt ?? new Date().toISOString();
    const initialItem: ContentItem = {
      id: raw.id,
      title:
        raw.metadata.subject ?? raw.metadata.pageTitle ?? raw.url ?? "Untitled",
      url: raw.url ?? "",
      sourceType: raw.sourceType,
      contentType: "article",
      summary: "",
      topics: [],
      priority: "medium",
      isRead: false,
      createdAt,
      processingStatus: "processing",
    };

    const insertedItem = insertItem(initialItem);

    // If insertItem returned an existing item (race condition), link and return
    if (insertedItem.id !== raw.id) {
      updateRawContentItemId(raw.id, insertedItem.id);
      return {
        rawContentId: raw.id,
        status: "ready",
      };
    }

    updateRawContentItemId(raw.id, insertedItem.id);

    // Step 4: Stage 1 — Classify
    let classification: ContentClassification;
    try {
      classification = await classify(raw);
    } catch {
      classification = defaultClassification();
    }

    // Step 5: Stage 2 — Relevance Gate
    const gateResult = await checkRelevance(raw, classification, getUserSetting);

    if (gateResult.accepted === false) {
      updateItemProcessingStatus(raw.id, "rejected", gateResult.reason);
      return {
        rawContentId: raw.id,
        status: "rejected",
        rejectionReason: gateResult.reason,
        classification,
      };
    }

    // Step 6: Stage 3 — Extract
    let extracted: ExtractedContentResult;
    try {
      extracted = await extractContent(raw, classification);
    } catch {
      extracted = minimalExtraction(raw);
    }

    // Step 7: Stage 4 — Analyze
    let analysis: ContentAnalysis;
    try {
      analysis = await analyzeContent(raw, extracted, classification);
    } catch {
      analysis = emptyAnalysis();
    }

    // Step 8: Stage 5 — Enrich
    let enriched: EnrichedContent;
    try {
      enriched = await enrichContent(raw, extracted, analysis, classification);
    } catch {
      enriched = minimalEnrichment(extracted);
    }

    // Step 9: Update item in DB with full data
    updateItem(raw.id, {
      title: extracted.title,
      summary: enriched.summary,
      fullContent: extracted.cleanContent,
      author: extracted.author,
      publication: extracted.publication,
      thumbnailUrl: extracted.thumbnailUrl,
      topics: enriched.topics,
      priority: enriched.priority,
      contentType: classification.contentType,
      extractedLinks: analysis.relevantLinks,
      processingStatus: "ready",
      contentClassification: classification,
      detectedMedia: analysis.detectedMedia,
      informationDensity: analysis.informationDensityScore,
    });

    // Step 10: Update ai_priority_score
    updateItemProcessingStatus(raw.id, "ready");
    updateItemPriorityScore(raw.id, enriched.priorityScore, enriched.priority);

    // Step 10b: Fire-and-forget deep AI summary — skipped for content types
    // that don't use AI summarization (e.g. tweets).
    const strategy = detectStrategy(raw.url ?? "");
    if (strategy.generateAISummary) {
      generateSummary(raw.id, { length: "brief" }).catch(() => {});
    }

    // Step 10c: Fire-and-forget embedding for semantic search.
    embedItem(raw.id, extracted.title, enriched.summary).catch(() => {});

    // Step 11: Return ProcessingResult
    return {
      rawContentId: raw.id,
      status: "ready",
      classification,
      extracted,
      analysis,
      enriched,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    updateItemProcessingStatus(raw.id, "rejected", message);
    return {
      rawContentId: raw.id,
      status: "rejected",
      rejectionReason: message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a RawContent object for connectors. Generates id and fetchedAt.
 */
export function buildRawContent(params: {
  sourceType: SourceType;
  rawBody: string;
  rawTextContent?: string;
  url?: string;
  urls?: string[];
  metadata: RawContentMetadata;
}): RawContent {
  return {
    id: randomUUID(),
    sourceType: params.sourceType,
    rawBody: params.rawBody,
    rawTextContent: params.rawTextContent,
    url: params.url,
    urls: params.urls,
    metadata: params.metadata,
    fetchedAt: new Date().toISOString(),
  };
}
