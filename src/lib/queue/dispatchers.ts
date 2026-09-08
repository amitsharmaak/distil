import type { CaptureDispatcher } from "@/lib/contracts/capture";
import type { CaptureQueueMessageV2, TenantJobEnvelopeV1 } from "@/lib/contracts/tenant-jobs";

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
