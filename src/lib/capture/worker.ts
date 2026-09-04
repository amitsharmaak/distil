import type { CaptureQueueMessage } from "@/lib/contracts/capture";
import type { ProcessingResult, RawContent } from "@/lib/intelligence/types";
import type { CaptureRecord, CaptureRepository, ItemRepository } from "@/lib/repositories/ports";
import { captureQueueMessageSchema } from "./schema";
import { CaptureProcessingError, CaptureRetryScheduledError, processingError } from "./errors";
import { fetchArticle, type SafeFetchOptions } from "./fetch";
import { normalizeCaptureUrl } from "./url-safety";

export const MAX_CAPTURE_ATTEMPTS = 5;
export const CAPTURE_PROCESSING_STALE_MS = 6 * 60 * 1000;

export interface CaptureProcessorResult {
  status: "ready" | "rejected";
  itemId?: string;
  reason?: string;
}

export type CaptureProcessor = (capture: CaptureRecord) => Promise<CaptureProcessorResult>;

export interface CaptureWorkerDependencies {
  captures: CaptureRepository;
  processor: CaptureProcessor;
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
    const message: CaptureQueueMessage = captureQueueMessageSchema.parse(untrustedMessage);
    let capture = await this.dependencies.captures.findById(message.captureId);
    if (!capture) return undefined;
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
}

export interface DefaultCaptureProcessorDependencies {
  items: ItemRepository;
  fetchOptions?: SafeFetchOptions;
  pipeline?: (raw: RawContent) => Promise<ProcessingResult>;
  now?: () => Date;
}

export function createDefaultCaptureProcessor(
  dependencies: DefaultCaptureProcessorDependencies
): CaptureProcessor {
  return async (capture) => {
    const article = await fetchArticle(capture.url, dependencies.fetchOptions);
    const fetchedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const pipeline =
      dependencies.pipeline ?? (await import("@/lib/intelligence/pipeline")).processContent;
    const result = await pipeline({
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
    });
    if (result.status === "rejected") {
      return { status: "rejected", reason: result.rejectionReason };
    }
    if (result.itemId) return { status: "ready", itemId: result.itemId };
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
