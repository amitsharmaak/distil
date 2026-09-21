import type { CaptureDispatcher } from "@/lib/contracts/capture";
import type {
  CaptureQueueMessageV2,
  ResearchRunMessageV1,
  TenantJobEnvelopeV1,
} from "@/lib/contracts/tenant-jobs";
import { CaptureRetryScheduledError } from "@/lib/capture/errors";

export const CAPTURE_QUEUE_TOPIC = "capture-requests";
export const ACCOUNT_LIFECYCLE_QUEUE_TOPIC = "account-lifecycle";

export interface QueuedCaptureMessage {
  message: CaptureQueueMessageV2;
  idempotencyKey: string;
}

export class FakeCaptureDispatcher implements CaptureDispatcher {
  readonly messages: QueuedCaptureMessage[] = [];
  failure?: Error;

  async dispatch(
    message: CaptureQueueMessageV2,
    options: { idempotencyKey: string }
  ): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.messages.some((queued) => queued.idempotencyKey === options.idempotencyKey)) return;
    this.messages.push({
      message: structuredClone(message),
      idempotencyKey: options.idempotencyKey,
    });
  }
}

export class LocalCaptureDispatcher extends FakeCaptureDispatcher {
  async drain(handler: (message: CaptureQueueMessageV2) => Promise<void>): Promise<void> {
    while (this.messages.length > 0) {
      const next = this.messages.shift()!;
      await handler(next.message);
    }
  }
}

/**
 * Local-development dispatcher. Runs the capture worker in the same process
 * right after the capture request is accepted, so `next dev` needs no Vercel
 * Queue credentials. Processing is detached from the request so the receipt
 * returns `queued` first, exactly as it does behind the hosted queue.
 */
export class InlineCaptureDispatcher implements CaptureDispatcher {
  constructor(
    private readonly consume: (message: CaptureQueueMessageV2) => Promise<void>,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly retryDelayMs = 2_000
  ) {}

  async dispatch(
    message: CaptureQueueMessageV2,
    _options: { idempotencyKey: string }
  ): Promise<void> {
    const copy = structuredClone(message);
    setTimeout(() => this.run(copy), 0);
  }

  // The hosted queue redelivers a message when the worker throws
  // CaptureRetryScheduledError; without this the local receipt would stay
  // `queued` forever after a transient failure. The worker bounds attempts.
  private run(message: CaptureQueueMessageV2): void {
    this.consume(message).catch((error: unknown) => {
      if (error instanceof CaptureRetryScheduledError) {
        setTimeout(() => this.run(message), this.retryDelayMs);
        return;
      }
      this.onError(error);
    });
  }
}

export interface VercelQueueSender {
  <T>(
    topic: string,
    message: T,
    options: { idempotencyKey: string; region?: string }
  ): Promise<unknown>;
}

export class VercelCaptureDispatcher implements CaptureDispatcher {
  constructor(
    private readonly sender: VercelQueueSender,
    private readonly region = "sin1"
  ) {}

  async dispatch(
    message: CaptureQueueMessageV2,
    options: { idempotencyKey: string }
  ): Promise<void> {
    await this.sender(CAPTURE_QUEUE_TOPIC, message, {
      idempotencyKey: options.idempotencyKey,
      region: this.region,
    });
  }
}

export async function createVercelCaptureDispatcher(): Promise<VercelCaptureDispatcher> {
  const { send } = await import("@vercel/queue");
  return new VercelCaptureDispatcher(send);
}

export interface TenantJobDispatcher {
  dispatch(
    message: TenantJobEnvelopeV1,
    options: { idempotencyKey: string; delaySeconds?: number }
  ): Promise<void>;
}

export interface VercelTenantJobSender {
  <T>(
    topic: string,
    message: T,
    options: { idempotencyKey: string; region?: string; delaySeconds?: number }
  ): Promise<unknown>;
}

/** Test-only in-memory dispatcher for the minimal tenant job envelope. */
export class FakeTenantJobDispatcher implements TenantJobDispatcher {
  readonly messages: Array<{
    message: TenantJobEnvelopeV1;
    idempotencyKey: string;
    delaySeconds?: number;
  }> = [];
  failure?: Error;

  async dispatch(
    message: TenantJobEnvelopeV1,
    options: { idempotencyKey: string; delaySeconds?: number }
  ): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.messages.some((queued) => queued.idempotencyKey === options.idempotencyKey)) return;
    this.messages.push({
      message: structuredClone(message),
      idempotencyKey: options.idempotencyKey,
      ...(options.delaySeconds === undefined ? {} : { delaySeconds: options.delaySeconds }),
    });
  }
}

/** Production dispatcher for tenant-scoped lifecycle work. */
export class VercelTenantJobDispatcher implements TenantJobDispatcher {
  constructor(
    private readonly sender: VercelTenantJobSender,
    private readonly region = "sin1"
  ) {}

  async dispatch(
    message: TenantJobEnvelopeV1,
    options: { idempotencyKey: string; delaySeconds?: number }
  ): Promise<void> {
    await this.sender(ACCOUNT_LIFECYCLE_QUEUE_TOPIC, message, {
      idempotencyKey: options.idempotencyKey,
      region: this.region,
      ...(options.delaySeconds === undefined ? {} : { delaySeconds: options.delaySeconds }),
    });
  }
}

export async function createVercelTenantJobDispatcher(): Promise<VercelTenantJobDispatcher> {
  const { send } = await import("@vercel/queue");
  return new VercelTenantJobDispatcher(send);
}

export const RESEARCH_QUEUE_TOPIC = "research-runs";

export interface ResearchDispatcher {
  dispatch(message: ResearchRunMessageV1, options: { idempotencyKey: string }): Promise<void>;
}

/** Test-only in-memory dispatcher for research stage messages. */
export class FakeResearchDispatcher implements ResearchDispatcher {
  readonly messages: Array<{ message: ResearchRunMessageV1; idempotencyKey: string }> = [];
  failure?: Error;

  async dispatch(
    message: ResearchRunMessageV1,
    options: { idempotencyKey: string }
  ): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.messages.some((queued) => queued.idempotencyKey === options.idempotencyKey)) return;
    this.messages.push({
      message: structuredClone(message),
      idempotencyKey: options.idempotencyKey,
    });
  }
}

/**
 * Local-development dispatcher for research stages: runs the consumer in the
 * same process, detached from the request, so `next dev` needs no queue
 * credentials. A thrown stage is redelivered after a delay, as the hosted
 * queue would do; redeliveries are bounded here because the stage runner
 * persists its own attempt count only when the database is reachable.
 */
export class InlineResearchDispatcher implements ResearchDispatcher {
  constructor(
    private readonly consume: (message: ResearchRunMessageV1) => Promise<void>,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly retryDelayMs = 2_000,
    private readonly maxDeliveries = 4
  ) {}

  async dispatch(message: ResearchRunMessageV1): Promise<void> {
    const copy = structuredClone(message);
    setTimeout(() => this.run(copy, 1), 0);
  }

  private run(message: ResearchRunMessageV1, delivery: number): void {
    this.consume(message).catch((error: unknown) => {
      if (delivery < this.maxDeliveries) {
        setTimeout(() => this.run(message, delivery + 1), this.retryDelayMs);
        return;
      }
      this.onError(error);
    });
  }
}

export class VercelResearchDispatcher implements ResearchDispatcher {
  constructor(
    private readonly sender: VercelQueueSender,
    private readonly region = "sin1"
  ) {}

  async dispatch(
    message: ResearchRunMessageV1,
    options: { idempotencyKey: string }
  ): Promise<void> {
    await this.sender(RESEARCH_QUEUE_TOPIC, message, {
      idempotencyKey: options.idempotencyKey,
      region: this.region,
    });
  }
}

export async function createVercelResearchDispatcher(): Promise<VercelResearchDispatcher> {
  const { send } = await import("@vercel/queue");
  return new VercelResearchDispatcher(send);
}
