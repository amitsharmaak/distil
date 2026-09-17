import { after } from "next/server";

import { aiLogger, sanitizeLogError } from "@/lib/logger";

/**
 * Keeps durable AI accounting attached to a Next request without extending its
 * response latency. Direct/background callers (tests and the local inline
 * capture worker) do not have a Next request scope, so they use a microtask in
 * the long-lived local process instead.
 */
export function scheduleAIAfterResponse(task: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      aiLogger.error(
        { event: "ai_accounting_failed", err: sanitizeLogError(error) },
        "AI accounting persistence failed"
      );
    }
  };

  try {
    after(guarded);
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside a request scope")) {
      queueMicrotask(() => void guarded());
      return;
    }
    throw error;
  }
}
