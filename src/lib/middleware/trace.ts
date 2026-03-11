/**
 * Request trace ID utility.
 * Generates a UUID per request and stores it in AsyncLocalStorage
 * so child loggers can include it automatically.
 * SERVER-SIDE ONLY.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

interface TraceContext {
  traceId: string;
  startTime: number;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

export function generateTraceId(): string {
  return crypto.randomUUID();
}

/**
 * Runs a callback within a trace context. All code within the callback
 * (including async operations) can call getTraceId() to retrieve the
 * current request's trace ID.
 */
export function withTrace<T>(fn: () => T): T {
  const ctx: TraceContext = {
    traceId: generateTraceId(),
    startTime: Date.now(),
  };
  return traceStorage.run(ctx, fn);
}
