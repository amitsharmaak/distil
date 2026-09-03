import type { CaptureQueueMessageFixture } from "../factories";

export interface CaptureDispatchOptions {
  idempotencyKey: string;
}

export interface CaptureDispatchAttempt {
  message: CaptureQueueMessageFixture;
  options: CaptureDispatchOptions;
}

/** A deterministic dispatcher with programmable failures and idempotent accepts. */
export class FakeCaptureDispatcher {
  readonly attempts: CaptureDispatchAttempt[] = [];
  readonly deliveries: CaptureDispatchAttempt[] = [];
  private readonly failures: Error[] = [];
  private readonly acceptedKeys = new Set<string>();

  failNext(...errors: Error[]): this {
    this.failures.push(...errors);
    return this;
  }

  async dispatch(
    message: CaptureQueueMessageFixture,
    options: CaptureDispatchOptions
  ): Promise<void> {
    const attempt = {
      message: { ...message },
      options: { ...options },
    };
    this.attempts.push(attempt);

    const failure = this.failures.shift();
    if (failure) {
      throw failure;
    }

    if (this.acceptedKeys.has(options.idempotencyKey)) {
      return;
    }

    this.acceptedKeys.add(options.idempotencyKey);
    this.deliveries.push(attempt);
  }

  reset(): void {
    this.attempts.length = 0;
    this.deliveries.length = 0;
    this.failures.length = 0;
    this.acceptedKeys.clear();
  }
}
