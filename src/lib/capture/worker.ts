import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";
import type { ExtractedContent } from "@/lib/content-extractor";
import type { ProcessingResult, RawContent } from "@/lib/intelligence/types";
import { extractOGFromHtml, isTwitterUrl, type OGData } from "@/lib/og";
import { isGranolaUrl, parseGranolaPage, renderProseMirror } from "@/lib/granola";
import {
  extractYouTubeId,
  fetchYouTubeVideoDetails,
  formatDuration,
  isYouTubeUrl,
  parseYouTubeWatchPage,
  renderYouTubeContent,
  type InnertubeAttempt,
  type YouTubeVideoDetails,
} from "@/lib/youtube";
import { config } from "@/lib/config";
import { apiLogger } from "@/lib/logger";
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
const MIN_VIDEO_DESCRIPTION_FOR_SUMMARY = 200;

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
  /** Resolves post text for social URLs that Readability cannot parse (X/Twitter via fxtwitter). */
  fetchSocialMetadata?: (url: string) => Promise<OGData>;
  /** YouTube details when the watch page lacks them; defaults to innertube then oEmbed. */
  fetchVideoDetails?: (videoId: string) => Promise<YouTubeVideoDetails | null>;
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

      // Granola: the shared note ships as a ProseMirror document in the page payload.
      if (!extracted && isGranolaUrl(article.url)) {
        const note = parseGranolaPage(article.body);
        if (!note) {
          return {
            status: "rejected",
            reason: "Distil could not read this Granola note; is the share link public?",
          };
        }
        const rendered = renderProseMirror(note.doc);
        const excerpt = rendered.text.replace(/\s+/g, " ").trim();
        const item = await dependencies.items.insert({
          id: capture.id,
          title: capture.title ?? note.title,
          summary: capture.notes ?? `${excerpt.slice(0, 277)}${excerpt.length > 277 ? "..." : ""}`,
          fullContent: rendered.html,
          sourceType: capture.source === "browser-extension" ? "browser-extension" : "manual",
          contentType: "article",
          topics: capture.topics,
          author: note.owner ?? undefined,
          publication: "Granola",
          url: article.url,
          priority: capture.priority,
          isRead: false,
          createdAt: fetchedAt,
          extractedLinks: [],
          contentExtractedAt: fetchedAt,
          processingStatus: "ready",
        });
        await rawContent.attachItem(capture.id, item.id);
        await dependencies.enqueueEnrichment?.(item.id).catch(() => undefined);
        return { status: "ready", itemId: item.id };
      }

      // YouTube: the watch page embeds the video's metadata; captions come from
      // the innertube API. The item is a video with the transcript as its body.
      if (!extracted && isYouTubeUrl(article.url)) {
        const videoId = extractYouTubeId(article.url) as string;
        const fromPage = parseYouTubeWatchPage(article.body);
        const attempts: InnertubeAttempt[] = [];
        const video =
          fromPage ??
          (await (dependencies.fetchVideoDetails
            ? dependencies.fetchVideoDetails(videoId)
            : fetchYouTubeVideoDetails(videoId, { apiKey: config.youtubeApiKey, attempts })));
        if (!fromPage) {
          // Which source answered is only learnable per egress; keep it in the logs.
          apiLogger.info(
            {
              event: "youtube_details_fallback",
              code: videoId,
              status: attempts
                .map(
                  (entry) => `${entry.client}:${entry.outcome.replace(/[^A-Za-z0-9_.-]+/g, "_")}`
                )
                .join(".")
                .slice(0, 160),
              retryable: Boolean(video),
            },
            "YouTube watch page had no player response"
          );
        }
        if (!video) {
          return {
            status: "rejected",
            reason: "Distil could not read this video's details from YouTube",
          };
        }
        // Capture stores the description only; the transcript is loaded on demand
        // from the reader (POST /api/v1/items/:id/transcript) since most videos
        // never need one.
        const rendered = renderYouTubeContent(video, []);
        const description = video.description.replace(/\s+/g, " ").trim();
        const item = await dependencies.items.insert({
          id: capture.id,
          // The source's title beats the browser tab title ("… - YouTube").
          title: video.title || capture.title || article.url,
          summary:
            capture.notes ??
            (description
              ? `${description.slice(0, 277)}${description.length > 277 ? "..." : ""}`
              : video.title),
          fullContent: rendered.html || undefined,
          sourceType: capture.source === "browser-extension" ? "browser-extension" : "manual",
          contentType: "video",
          topics: capture.topics,
          author: video.author ?? undefined,
          publication: "YouTube",
          url: article.url,
          priority: capture.priority,
          isRead: false,
          createdAt: fetchedAt,
          thumbnailUrl: video.thumbnailUrl ?? undefined,
          duration: video.lengthSeconds ? formatDuration(video.lengthSeconds) : undefined,
          extractedLinks: [],
          contentExtractedAt: fetchedAt,
          processingStatus: "ready",
          detectedMedia: [{ type: "video", platform: "youtube", videoId: video.videoId }],
        });
        await rawContent.attachItem(capture.id, item.id);
        // A short summary from the description; a one-liner is not worth a call.
        if (description.length >= MIN_VIDEO_DESCRIPTION_FOR_SUMMARY) {
          await dependencies.enqueueEnrichment?.(item.id).catch(() => undefined);
        }
        return { status: "ready", itemId: item.id };
      }

      // X/Twitter serves a JavaScript shell with no readable body, so Readability
      // is skipped for it by design. Build the item from the post metadata instead
      // (fxtwitter, a fixed public host) rather than rejecting every saved tweet.
      if (!extracted && isTwitterUrl(article.url)) {
        const fetchSocialMetadata =
          dependencies.fetchSocialMetadata ?? (await import("@/lib/og")).fetchOG;
        const post = await fetchSocialMetadata(article.url);
        const postText = post.description?.trim() ?? "";
        // Native X video plays inline; a linked YouTube video lets the reader
        // load that video's transcript for a summary.
        const linkedYouTube = postText
          .match(/https?:\/\/\S+/g)
          ?.map((link) => extractYouTubeId(link))
          .find((id): id is string => Boolean(id));
        const postMedia = [
          ...(post.videoUrl
            ? [{ type: "video", platform: "twitter", embedUrl: post.videoUrl }]
            : []),
          ...(linkedYouTube
            ? [{ type: "video", platform: "youtube", videoId: linkedYouTube, linked: true }]
            : []),
        ];
        if (!postText) {
          return {
            status: "rejected",
            reason: "Distil could not read the text of this post",
          };
        }
        const item = await dependencies.items.insert({
          id: capture.id,
          title: capture.title ?? post.title ?? new URL(article.url).hostname,
          // Short posts render from `summary`; long-form articles get an excerpt.
          summary: post.isXArticle
            ? `${postText.slice(0, 277)}${postText.length > 277 ? "..." : ""}`
            : postText,
          fullContent: post.html || postText,
          sourceType: capture.source === "browser-extension" ? "browser-extension" : "manual",
          contentType: "article",
          topics: capture.topics,
          author: post.author ?? undefined,
          publication: post.siteName ?? "X",
          url: article.url,
          priority: capture.priority,
          isRead: false,
          createdAt: fetchedAt,
          thumbnailUrl: post.image ?? undefined,
          extractedLinks: post.links ?? [],
          contentExtractedAt: fetchedAt,
          processingStatus: "ready",
          ...(postMedia.length > 0 ? { detectedMedia: postMedia } : {}),
        });
        await rawContent.attachItem(capture.id, item.id);
        await dependencies.enqueueEnrichment?.(item.id).catch(() => undefined);
        return { status: "ready", itemId: item.id };
      }

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
