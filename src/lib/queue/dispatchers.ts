import type { CaptureDispatcher, CaptureQueueMessage } from "@/lib/contracts/capture";

export const CAPTURE_QUEUE_TOPIC = "capture-requests";

export interface QueuedCaptureMessage {
  message: CaptureQueueMessage;
  idempotencyKey: string;
}

export class FakeCaptureDispatcher implements CaptureDispatcher {
  readonly messages: QueuedCaptureMessage[] = [];
  failure?: Error;

  async dispatch(message: CaptureQueueMessage, options: { idempotencyKey: string }): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.messages.some((queued) => queued.idempotencyKey === options.idempotencyKey)) return;
    this.messages.push({
      message: structuredClone(message),
      idempotencyKey: options.idempotencyKey,
    });
  }
}

export class LocalCaptureDispatcher extends FakeCaptureDispatcher {
  async drain(handler: (message: CaptureQueueMessage) => Promise<void>): Promise<void> {
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

  async dispatch(message: CaptureQueueMessage, options: { idempotencyKey: string }): Promise<void> {
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
