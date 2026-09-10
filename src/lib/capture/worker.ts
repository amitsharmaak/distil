import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";
import type { ExtractedContent } from "@/lib/content-extractor";
import type { ProcessingResult, RawContent } from "@/lib/intelligence/types";
import { extractOGFromHtml } from "@/lib/og";
import type {
  CaptureRecord,
  CaptureRepository,
  ItemRepository,
  RawContentRepository,
} from "@/lib/repositories/ports";
import { captureQueueMessageSchema } from "./schema";
import { CaptureProcessingError, CaptureRetryScheduledError, processingError } from "./errors";
import { fetchArticle, type SafeFetchOptions } from "./fetch";
import { normalizeCaptureUrl } from "./url-safety";

export const MAX_CAPTURE_ATTEMPTS = 5;
export const CAPTURE_PROCESSING_STALE_MS = 6 * 60 * 1000;
const MIN_READABLE_TEXT_CHARACTERS = 80;

export interface CaptureProcessorResult {
  status: "ready" | "rejected";
  itemId?: string;
  reason?: string;
}

export type CaptureProcessor = (capture: CaptureRecord) => Promise<CaptureProcessorResult>;

export interface CaptureWorkerDependencies {
  context: AuthContext;
  captures: CaptureRepository;
  processor: CaptureProcessor;
  audit?: (event: { action: string; traceId: string }) => Promise<void>;
  now?: () => Date;
  staleAfterMs?: number;
  maxAttempts?: number;
}

export class CaptureWorker {
  private readonly now: () => Date;

  constructor(private readonly dependencies: CaptureWorkerDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async handle(untrustedMessage: unknown): Promise<CaptureRecord | undefined> {
    const message: CaptureQueueMessageV2 = captureQueueMessageSchema.parse(untrustedMessage);
    if (message.userId !== this.dependencies.context.userId) {
      await this.auditMismatch(message.traceId);
      return undefined;
    }
    let capture = await this.dependencies.captures.findById(message.captureId);
    if (!capture || capture.userId !== message.userId) {
      await this.auditMismatch(message.traceId);
      return undefined;
    }
    if (
      capture.status === "ready" ||
      capture.status === "rejected" ||
      capture.status === "failed"
    ) {
      return capture;
    }

    if (capture.status === "processing") {
      const age = this.now().getTime() - new Date(capture.updatedAt).getTime();
      if (age < (this.dependencies.staleAfterMs ?? CAPTURE_PROCESSING_STALE_MS)) {
        throw new CaptureRetryScheduledError(capture.id);
      }
      const recovered = await this.dependencies.captures.transition(capture.id, ["processing"], {
        status: "queued",
        retryable: true,
        errorCode: "WORKER_INTERRUPTED",
        errorMessage: "A previous worker stopped before completing",
        updatedAt: this.now().toISOString(),
      });
      if (!recovered) return this.dependencies.captures.findById(capture.id);
      capture = recovered;
    }

    const attempts = capture.attempts + 1;
    const processing = await this.dependencies.captures.transition(capture.id, ["queued"], {
      status: "processing",
      attempts,
      retryable: false,
      updatedAt: this.now().toISOString(),
    });
    if (!processing) return this.dependencies.captures.findById(capture.id);

    try {
      const result = await this.dependencies.processor(processing);
      if (result.status === "rejected") {
        return this.dependencies.captures.transition(processing.id, ["processing"], {
          status: "rejected",
          retryable: false,
          errorCode: "CONTENT_REJECTED",
          errorMessage: result.reason ?? "The source was not accepted as readable content",
          updatedAt: this.now().toISOString(),
        });
      }
      return this.dependencies.captures.transition(processing.id, ["processing"], {
        status: "ready",
        itemId: result.itemId,
        retryable: false,
        updatedAt: this.now().toISOString(),
      });
    } catch (unknownError) {
      const error = processingError(unknownError);
      if (error.kind === "rejected") {
        return this.dependencies.captures.transition(processing.id, ["processing"], {
          status: "rejected",
          retryable: false,
          errorCode: error.code,
          errorMessage: error.message,
          updatedAt: this.now().toISOString(),
        });
      }
      const retryable =
        error.kind === "transient" &&
        attempts < (this.dependencies.maxAttempts ?? MAX_CAPTURE_ATTEMPTS);
      const failed = await this.dependencies.captures.transition(processing.id, ["processing"], {
        status: retryable ? "queued" : "failed",
        retryable,
        errorCode: error.code,
        errorMessage: error.message,
        updatedAt: this.now().toISOString(),
      });
      if (retryable) throw new CaptureRetryScheduledError(processing.id, { cause: error });
      return failed;
    }
  }

  private async auditMismatch(traceId: string): Promise<void> {
    await this.dependencies.audit?.({
      action: "capture_queue_owner_mismatch_or_missing",
      traceId,
    });
  }
}

export interface DefaultCaptureProcessorDependencies {
  context: AuthContext;
  items: ItemRepository;
  rawContent?: RawContentRepository;
  fetchOptions?: SafeFetchOptions;
  extractContent?: (html: string, url: string) => ExtractedContent | null;
  pipeline?: (raw: RawContent) => Promise<ProcessingResult>;
  enqueueEnrichment?: (itemId: string) => Promise<void>;
  now?: () => Date;
}

export function createDefaultCaptureProcessor(
  dependencies: DefaultCaptureProcessorDependencies
): CaptureProcessor {
  return async (capture) => {
    const article = await fetchArticle(capture.url, dependencies.fetchOptions);
    const fetchedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const raw: RawContent = {
      id: capture.id,
      sourceType: capture.source === "browser-extension" ? "browser-extension" : "manual",
      rawBody: article.body,
      rawTextContent: article.body,
      url: article.url,
      metadata: {
        pageTitle: capture.title,
        userNotes: capture.notes,
        priority: capture.priority,
        topics: capture.topics,
      },
      fetchedAt,
    };

    if (dependencies.pipeline) {
      const result = await dependencies.pipeline(raw);
      if (result.status === "rejected") {
        return { status: "rejected", reason: result.rejectionReason };
      }
      if (result.itemId) return { status: "ready", itemId: result.itemId };
    } else {
      const rawContent = dependencies.rawContent;
      if (!rawContent) {
        throw new Error("rawContent repository is required for durable capture ingestion");
      }
      await rawContent.insert({
        userId: dependencies.context.userId,
        id: capture.id,
        sourceType: raw.sourceType,
        rawBody: article.body,
        metadata: raw.metadata as Record<string, unknown>,
        fetchedAt,
      });
      const existing = await dependencies.items.findByNormalizedUrl(
        normalizeCaptureUrl(article.url)
      );

      if (existing) {
        await rawContent.attachItem(capture.id, existing.id);
        return { status: "ready", itemId: existing.id };
      }

      const extractContent =
        dependencies.extractContent ??
        (await import("@/lib/content-extractor")).extractContentFromHtml;
      const extracted = extractContent(article.body, article.url);
      const readableText = extracted?.textContent.replace(/\s+/g, " ").trim() ?? "";
      if (!extracted?.content || readableText.length < MIN_READABLE_TEXT_CHARACTERS) {
        return {
          status: "rejected",
          reason: "Distil could not identify enough readable article content on this page",
        };
      }

      const og = extractOGFromHtml(article.body);
      const item = await dependencies.items.insert({
        id: capture.id,
        title: capture.title ?? og.title ?? extracted.title ?? new URL(article.url).hostname,
        summary:
          capture.notes ??
          og.description ??
          `${readableText.slice(0, 277)}${readableText.length > 277 ? "..." : ""}`,
        fullContent: extracted.content,
        sourceType: capture.source === "browser-extension" ? "browser-extension" : "manual",
        contentType: "article",
        topics: capture.topics,
        author: extracted.byline ?? og.author ?? undefined,
        publication: og.siteName ?? undefined,
        url: article.url,
        priority: capture.priority,
        isRead: false,
        createdAt: fetchedAt,
        thumbnailUrl: og.image ?? undefined,
        extractedLinks: extracted.extractedLinks,
        contentExtractedAt: fetchedAt,
        processingStatus: "ready",
      });
      await rawContent.attachItem(capture.id, item.id);
      // Capture durability is independent of AI availability or quota. Enrichment
      // is best-effort asynchronous work and never rolls the accepted item back.
      await dependencies.enqueueEnrichment?.(item.id).catch(() => undefined);
      return { status: "ready", itemId: item.id };
    }

    const item = await dependencies.items.findByNormalizedUrl(normalizeCaptureUrl(article.url));
    if (!item) {
      throw new CaptureProcessingError(
        "PROCESSING_FAILED",
        "Processing completed without a durable item",
        "transient"
      );
    }
    return { status: "ready", itemId: item.id };
  };
}
