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
} from "../database";
import type { ContentItem, SourceType } from "../types";
import {
  generateCaptureSummary,
  persistCaptureSummary,
  type CaptureSummaryResult,
} from "../ai/summarize";
import { embedItem } from "../ai/embeddings";
import { detectStrategy } from "../content-strategies";
import { aiLogger } from "../logger";
import { getTraceId } from "../middleware/trace";
import { classify } from "./classifier";
import { checkRelevance } from "./relevance";
import { extractContent } from "./extractor";
import { analyzeContent } from "./analyzer";
import { enrichContent } from "./enricher";
import {
  createExtractiveSummary,
  isUsableArticleText,
  normalizeArticleText,
} from "./content-quality";
import type {
  RawContent,
  RawContentMetadata,
  ContentClassification,
  ExtractedContentResult,
  ContentAnalysis,
  EnrichedContent,
  ProcessingResult,
} from "./types";

const UNREADABLE_CONTENT_REASON = "The page did not contain readable article content";

function safeFailureField(error: object, field: string): string | undefined {
  if (!(field in error)) return undefined;
  const value = String((error as Record<string, unknown>)[field]);
  return /^[a-zA-Z0-9._:-]{1,80}$/.test(value) ? value : undefined;
}

function summaryFailureContext(error: unknown): {
  category: string;
  provider?: string;
  model?: string;
  attempt?: number;
  latencyMs?: number;
} {
  if (!error || typeof error !== "object") return { category: "unknown" };
  const rawCategory = safeFailureField(error, "category") ?? "unknown";
  const category = [
    "quota",
    "timeout",
    "server",
    "authentication",
    "invalid_request",
    "invalid_output",
    "budget",
    "unknown",
  ].includes(rawCategory)
    ? rawCategory
    : "unknown";
  const attemptValue = "attempt" in error ? Number(error.attempt) : NaN;
  const latencyValue = "latencyMs" in error ? Number(error.latencyMs) : NaN;
  return {
    category,
    provider: safeFailureField(error, "provider"),
    model: safeFailureField(error, "model"),
    attempt:
      Number.isInteger(attemptValue) && attemptValue > 0 && attemptValue < 10
        ? attemptValue
        : undefined,
    latencyMs:
      Number.isFinite(latencyValue) && latencyValue >= 0 && latencyValue < 60_000
        ? latencyValue
        : undefined,
  };
}

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
  const title = raw.metadata.subject ?? raw.metadata.pageTitle ?? raw.url ?? "Untitled";
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
  let targetItemId = raw.id;
  try {
    // Step 1: Save RawContent to DB (before any AI processing)
    await insertRawContent({
      id: raw.id,
      sourceType: raw.sourceType,
      rawBody: raw.rawBody,
      metadata: raw.metadata as Record<string, unknown>,
      fetchedAt: raw.fetchedAt,
    });

    // Step 2: Deduplication check
    if (raw.url) {
      const existing = await getItemByNormalizedUrl(raw.url);
      if (existing) {
        targetItemId = existing.id;
        await updateRawContentItemId(raw.id, existing.id);
        if (existing.processingStatus === "ready") {
          return { rawContentId: raw.id, itemId: existing.id, status: "ready" };
        }
        await updateItemProcessingStatus(existing.id, "processing");
      }
    }

    // Step 3: Insert item in 'processing' state
    const createdAt = raw.metadata.timestamp ?? raw.fetchedAt ?? new Date().toISOString();
    const initialItem: ContentItem = {
      id: raw.id,
      title: raw.metadata.subject ?? raw.metadata.pageTitle ?? raw.url ?? "Untitled",
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

    const insertedItem = targetItemId === raw.id ? await insertItem(initialItem) : undefined;

    // If insertItem returned an existing item (race condition), link and return
    if (insertedItem && insertedItem.id !== raw.id) {
      targetItemId = insertedItem.id;
      await updateRawContentItemId(raw.id, insertedItem.id);
      if (insertedItem.processingStatus === "ready") {
        return { rawContentId: raw.id, itemId: insertedItem.id, status: "ready" };
      }
    }

    if (insertedItem) targetItemId = insertedItem.id;
    await updateRawContentItemId(raw.id, targetItemId);

    // Step 4: Stage 1 — Classify
    let classification: ContentClassification;
    try {
      classification = await classify(raw);
    } catch {
      classification = defaultClassification();
    }

    // Step 5: Stage 2 — Relevance Gate
    const gateResult = await checkRelevance(raw, classification, async (key) =>
      getUserSetting(key)
    );

    if (gateResult.accepted === false) {
      await updateItemProcessingStatus(targetItemId, "rejected", gateResult.reason);
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
    } catch (err) {
      // Surface publisher auth errors to the caller (worker / manual API) so the
      // user can be prompted to reconnect. All other errors degrade gracefully.
      const { PublisherAuthRequired } = await import("../connectors/publishers/types");
      if (err instanceof PublisherAuthRequired) throw err;
      extracted = minimalExtraction(raw);
    }

    const strategy = detectStrategy(raw.url ?? "");
    const shouldGenerateAISummary = strategy.generateAISummary || extracted.isXArticle;
    const normalizedText = normalizeArticleText(extracted.cleanTextContent ?? "");

    if (shouldGenerateAISummary && !isUsableArticleText(normalizedText)) {
      aiLogger.warn(
        {
          event: "content_rejected_unreadable",
          traceId: getTraceId(),
          captureId: raw.id,
          itemId: targetItemId,
        },
        "content_rejected_unreadable"
      );
      await updateItemProcessingStatus(targetItemId, "rejected", UNREADABLE_CONTENT_REASON);
      return {
        rawContentId: raw.id,
        status: "rejected",
        rejectionReason: UNREADABLE_CONTENT_REASON,
        classification,
        extracted,
      };
    }
    extracted = { ...extracted, cleanTextContent: normalizedText };

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

    let generatedCaptureSummary: CaptureSummaryResult | undefined;
    if (shouldGenerateAISummary) {
      try {
        generatedCaptureSummary = await generateCaptureSummary({
          ...initialItem,
          id: targetItemId,
          title: extracted.title,
          summary: "",
          fullContent: normalizedText,
          author: extracted.author,
          publication: extracted.publication,
          topics: enriched.topics,
          priority: enriched.priority,
          contentType: classification.contentType,
        });
        enriched = { ...enriched, summary: generatedCaptureSummary.output.overview };
      } catch (error) {
        const failure = summaryFailureContext(error);
        aiLogger.warn(
          {
            event: "summary_generation_failed",
            traceId: getTraceId(),
            captureId: raw.id,
            itemId: targetItemId,
            task: "summarize",
            ...failure,
          },
          "summary_generation_failed"
        );
        const fallback = createExtractiveSummary(normalizedText);
        if (!fallback) {
          aiLogger.warn(
            {
              event: "content_rejected_unreadable",
              traceId: getTraceId(),
              captureId: raw.id,
              itemId: targetItemId,
            },
            "content_rejected_unreadable"
          );
          await updateItemProcessingStatus(targetItemId, "rejected", UNREADABLE_CONTENT_REASON);
          return {
            rawContentId: raw.id,
            status: "rejected",
            rejectionReason: UNREADABLE_CONTENT_REASON,
            classification,
            extracted,
            analysis,
          };
        }
        enriched = { ...enriched, summary: fallback };
        aiLogger.warn(
          {
            event: "summary_extract_fallback_used",
            traceId: getTraceId(),
            captureId: raw.id,
            itemId: targetItemId,
            task: "summarize",
            ...failure,
          },
          "summary_extract_fallback_used"
        );
      }
    }

    // If the extractor found a tweet video URL, inject it into detectedMedia
    // so the UI can render it alongside the text.
    const detectedMedia = extracted.videoUrl
      ? [
          ...analysis.detectedMedia,
          { type: "video" as const, platform: "twitter", embedUrl: extracted.videoUrl },
        ]
      : analysis.detectedMedia;

    // Step 9: Update item in DB with full data
    await updateItem(targetItemId, {
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
      processingStatus: "processing",
      contentClassification: classification,
      detectedMedia,
      informationDensity: analysis.informationDensityScore,
    });

    // The feed overview is the durable capture contract. Cache the richer brief
    // only after that overview has been written, and never discard a valid AI
    // result merely because this optional cache write failed.
    if (generatedCaptureSummary) {
      await persistCaptureSummary(targetItemId, generatedCaptureSummary).catch(() => {
        aiLogger.warn(
          {
            event: "summary_cache_failed",
            traceId: getTraceId(),
            captureId: raw.id,
            itemId: targetItemId,
            task: "summarize",
            provider: generatedCaptureSummary.provider,
            model: generatedCaptureSummary.model,
          },
          "summary_cache_failed"
        );
      });
    }

    // Step 10: Update ai_priority_score
    await updateItemProcessingStatus(targetItemId, "ready");
    await updateItemPriorityScore(targetItemId, enriched.priorityScore, enriched.priority);

    // Step 10b: Finish embedding work before returning from the pipeline.
    await embedItem(targetItemId, extracted.title, enriched.summary).catch(() => {
      aiLogger.warn(
        {
          event: "embedding_failed",
          traceId: getTraceId(),
          captureId: raw.id,
          itemId: targetItemId,
        },
        "embedding_failed"
      );
    });

    // Step 11: Return ProcessingResult
    return {
      rawContentId: raw.id,
      itemId: targetItemId,
      status: "ready",
      classification,
      extracted,
      analysis,
      enriched,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateItemProcessingStatus(targetItemId, "rejected", message);
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
