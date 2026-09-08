import { randomUUID } from "node:crypto";

import type {
  CaptureDispatcher,
  CaptureReceipt,
  CreateCaptureRequest,
  CreateCaptureResponse,
} from "@/lib/contracts/capture";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import { createCaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";
import type { CaptureRecord, CaptureRepository } from "@/lib/repositories/ports";
import type { DnsResolver } from "./url-safety";
import { assertSafeUrl, normalizeCaptureUrl } from "./url-safety";

export class QueueUnavailableError extends Error {
  readonly receipt: CaptureReceipt;

  constructor(receipt: CaptureReceipt, options?: ErrorOptions) {
    super("The capture queue is temporarily unavailable", options);
    this.name = "QueueUnavailableError";
    this.receipt = receipt;
  }
}

export class CaptureNotFoundError extends Error {
  constructor() {
    super("Capture not found");
    this.name = "CaptureNotFoundError";
  }
}

export class CaptureNotRetryableError extends Error {
  constructor() {
    super("Capture cannot be retried");
    this.name = "CaptureNotRetryableError";
  }
}

export interface CaptureServiceDependencies {
  context: AuthContext;
  captures: CaptureRepository;
  dispatcher: CaptureDispatcher;
  resolve?: DnsResolver;
  id?: () => string;
  now?: () => Date;
}

export function toCaptureReceipt(record: CaptureRecord): CaptureReceipt {
  return {
    id: record.id,
    normalizedUrl: record.normalizedUrl,
    status: record.status,
    ...(record.itemId ? { itemId: record.itemId } : {}),
    retryable: record.retryable,
    attempts: record.attempts,
    ...(record.lastErrorCode
      ? {
          error: {
            code: record.lastErrorCode,
            message: record.lastErrorMessage ?? "Capture processing failed",
          },
        }
      : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class CaptureService {
  private readonly id: () => string;
  private readonly now: () => Date;
  private readonly context: AuthContext;

  constructor(private readonly dependencies: CaptureServiceDependencies) {
    this.context = parseAuthContext(dependencies.context);
    this.id = dependencies.id ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  async create(input: CreateCaptureRequest): Promise<CreateCaptureResponse> {
    await assertSafeUrl(input.url, this.dependencies.resolve);
    const normalizedUrl = normalizeCaptureUrl(input.url);
    const duplicate =
      await this.dependencies.captures.findActiveOrReadyByNormalizedUrl(normalizedUrl);
    if (duplicate) return { receipt: toCaptureReceipt(duplicate), duplicate: true };

    const id = this.id();
    const createdAt = this.now().toISOString();
    let capture: CaptureRecord;
    try {
      capture = await this.dependencies.captures.create({
        userId: this.context.userId,
        originActorKind: this.context.actorKind,
        originActorId: this.context.actorId,
        id,
        url: input.url.trim(),
        normalizedUrl,
        title: input.title,
        notes: input.notes,
        topics: input.topics ?? [],
        priority: input.priority ?? "medium",
        source: input.source,
        createdAt,
      });
    } catch (error) {
      // The database uniqueness constraint arbitrates concurrent submissions.
      const raced =
        await this.dependencies.captures.findActiveOrReadyByNormalizedUrl(normalizedUrl);
      if (raced) return { receipt: toCaptureReceipt(raced), duplicate: true };
      throw error;
    }

    try {
      await this.dependencies.dispatcher.dispatch(
        createCaptureQueueMessageV2({
          userId: this.context.userId,
          captureId: capture.id,
          traceId: this.context.requestId,
        }),
        { idempotencyKey: `${this.context.userId}:${capture.id}` }
      );
    } catch (cause) {
      const failed = await this.dependencies.captures.transition(capture.id, ["queued"], {
        status: "failed",
        retryable: true,
        errorCode: "QUEUE_UNAVAILABLE",
        errorMessage: "The capture queue is temporarily unavailable",
        updatedAt: this.now().toISOString(),
      });
      throw new QueueUnavailableError(toCaptureReceipt(failed ?? capture), { cause });
    }

    return { receipt: toCaptureReceipt(capture), duplicate: false };
  }

  async get(id: string): Promise<CaptureReceipt> {
    const capture = await this.dependencies.captures.findById(id);
    if (!capture) throw new CaptureNotFoundError();
    return toCaptureReceipt(capture);
  }

  async list(limit = 50): Promise<CaptureReceipt[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    return (await this.dependencies.captures.list(safeLimit)).map(toCaptureReceipt);
  }

  async retry(id: string): Promise<CaptureReceipt> {
    const existing = await this.dependencies.captures.findById(id);
    if (!existing) throw new CaptureNotFoundError();
    if (existing.status !== "failed" || !existing.retryable) throw new CaptureNotRetryableError();

    const queued = await this.dependencies.captures.transition(id, ["failed"], {
      status: "queued",
      retryable: true,
      updatedAt: this.now().toISOString(),
    });
    if (!queued) throw new CaptureNotRetryableError();

    try {
      await this.dependencies.dispatcher.dispatch(
        createCaptureQueueMessageV2({
          userId: this.context.userId,
          captureId: id,
          traceId: this.context.requestId,
        }),
        { idempotencyKey: `${this.context.userId}:${id}` }
      );
    } catch (cause) {
      const failed = await this.dependencies.captures.transition(id, ["queued"], {
        status: "failed",
        retryable: true,
        errorCode: "QUEUE_UNAVAILABLE",
        errorMessage: "The capture queue is temporarily unavailable",
        updatedAt: this.now().toISOString(),
      });
      throw new QueueUnavailableError(toCaptureReceipt(failed ?? queued), { cause });
    }
    return toCaptureReceipt(queued);
  }
}
