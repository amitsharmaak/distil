/**
 * Exponential backoff retry for transient AI API failures.
 * SERVER-SIDE ONLY.
 */

import { aiLogger } from "@/lib/logger";

interface RetryOptions {
  maxAttempts: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  shouldRetry: (error) => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Retry on rate limits, timeouts, and server errors
      return (
        msg.includes("rate limit") ||
        msg.includes("429") ||
        msg.includes("timeout") ||
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("econnreset") ||
        msg.includes("econnrefused") ||
        msg.includes("network")
      );
    }
    return false;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff.
 * Delays: baseDelay * 2^attempt (1s, 2s, 4s by default).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxAttempts - 1) break;
      if (opts.shouldRetry && !opts.shouldRetry(error)) break;

      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt),
        opts.maxDelay,
      );
      const jitter = delay * 0.1 * Math.random();

      aiLogger.warn(
        { attempt: attempt + 1, maxAttempts: opts.maxAttempts, delayMs: delay },
        "Retrying AI call after transient failure",
      );

      await sleep(delay + jitter);
    }
  }

  throw lastError;
}
