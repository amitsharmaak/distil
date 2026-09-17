/**
 * Per-request performance counters (phase P0 of the performance plan).
 *
 * A request runs inside an AsyncLocalStorage store that counts provider calls,
 * database statements and transactions and attributes them, together with wall
 * time, to named phases. The counters feed a `Server-Timing` response header
 * (durations and counts only; never identifiers, secrets or content) so the
 * cost of a request is visible in browser DevTools and in `tests/perf`.
 *
 * Every recorder is a no-op outside a store, so instrumented code paths behave
 * identically when nothing is measuring them.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface PhaseMetrics {
  /** Accumulated wall time in milliseconds. */
  duration: number;
  /** Number of times the phase ran. */
  count: number;
  providerCalls: number;
  queries: number;
  transactions: number;
}

export interface RequestMetrics {
  readonly startedAt: number;
  providerCalls: number;
  queries: number;
  transactions: number;
  readonly phases: Map<string, PhaseMetrics>;
  /** Innermost active phase, if any; counters attribute to it. */
  readonly activePhases: string[];
}

const storage = new AsyncLocalStorage<RequestMetrics>();

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function createRequestMetrics(): RequestMetrics {
  return {
    startedAt: now(),
    providerCalls: 0,
    queries: 0,
    transactions: 0,
    phases: new Map(),
    activePhases: [],
  };
}

/** Run `operation` with a fresh (or supplied) metrics store bound to its async context. */
export function runWithRequestMetrics<T>(
  operation: (metrics: RequestMetrics) => T,
  metrics: RequestMetrics = createRequestMetrics()
): T {
  return storage.run(metrics, () => operation(metrics));
}

export function currentRequestMetrics(): RequestMetrics | undefined {
  return storage.getStore();
}

function phase(metrics: RequestMetrics, name: string): PhaseMetrics {
  let entry = metrics.phases.get(name);
  if (!entry) {
    entry = { duration: 0, count: 0, providerCalls: 0, queries: 0, transactions: 0 };
    metrics.phases.set(name, entry);
  }
  return entry;
}

function activePhase(metrics: RequestMetrics): PhaseMetrics | undefined {
  const name = metrics.activePhases.at(-1);
  return name === undefined ? undefined : phase(metrics, name);
}

/** Count one round trip to the authentication provider. */
export function recordProviderCall(): void {
  const metrics = storage.getStore();
  if (!metrics) return;
  metrics.providerCalls += 1;
  const current = activePhase(metrics);
  if (current) current.providerCalls += 1;
}

const TRANSACTION_START = /^\s*begin\b/i;
const TRANSACTION_CONTROL = /^\s*(commit|rollback|savepoint|release)\b/i;

/**
 * Count one statement sent to PostgreSQL. Wired to the postgres.js `debug`
 * hook, so `BEGIN` marks a transaction and the other transaction-control
 * statements are not counted as queries.
 */
export function recordDatabaseStatement(statement: string): void {
  const metrics = storage.getStore();
  if (!metrics) return;
  const current = activePhase(metrics);
  if (TRANSACTION_START.test(statement)) {
    metrics.transactions += 1;
    if (current) current.transactions += 1;
    return;
  }
  if (TRANSACTION_CONTROL.test(statement)) return;
  metrics.queries += 1;
  if (current) current.queries += 1;
}

/** Time `operation` under `name`; repeated phases accumulate. */
export async function measurePhase<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const metrics = storage.getStore();
  if (!metrics) return operation();
  const startedAt = now();
  metrics.activePhases.push(name);
  try {
    return await operation();
  } finally {
    metrics.activePhases.pop();
    const entry = phase(metrics, name);
    entry.duration += now() - startedAt;
    entry.count += 1;
  }
}

function formatDuration(milliseconds: number): string {
  return (Math.round(milliseconds * 10) / 10).toFixed(1);
}

function describe(counts: {
  providerCalls: number;
  queries: number;
  transactions: number;
}): string | undefined {
  const parts: string[] = [];
  if (counts.providerCalls > 0) parts.push(`calls=${counts.providerCalls}`);
  if (counts.queries > 0) parts.push(`q=${counts.queries}`);
  if (counts.transactions > 0) parts.push(`tx=${counts.transactions}`);
  return parts.length ? parts.join(" ") : undefined;
}

function serverTimingEntry(
  name: string,
  duration: number,
  counts: { providerCalls: number; queries: number; transactions: number }
): string {
  const desc = describe(counts);
  return `${name};dur=${formatDuration(duration)}${desc ? `;desc="${desc}"` : ""}`;
}

/**
 * Render a `Server-Timing` header value: one entry per phase in first-seen
 * order, then a total entry named by `totalName`.
 */
export function serverTimingHeader(metrics: RequestMetrics, totalName = "total"): string {
  const entries = [...metrics.phases.entries()].map(([name, entry]) =>
    serverTimingEntry(name, entry.duration, entry)
  );
  entries.push(serverTimingEntry(totalName, now() - metrics.startedAt, metrics));
  return entries.join(", ");
}

const SERVER_TIMING = "server-timing";

/**
 * Request header through which the proxy hands its own timing to an API route:
 * a header set on the proxy's pass-through response would replace the route's
 * `Server-Timing`, so wrapped routes merge the proxy entries in front of theirs.
 */
export const PROXY_TIMING_HEADER = "x-distil-proxy-timing";

const SAFE_TIMING_VALUE = /^[A-Za-z0-9 ;=.,"_-]{1,512}$/;

function proxyTimingFrom(args: unknown[]): string | undefined {
  const request = args[0];
  if (!(request instanceof Request)) return undefined;
  const value = request.headers.get(PROXY_TIMING_HEADER);
  return value && SAFE_TIMING_VALUE.test(value) ? value : undefined;
}

function appendServerTiming<T extends Response>(response: T, value: string): T {
  const existing = response.headers.get(SERVER_TIMING);
  try {
    response.headers.set(SERVER_TIMING, existing ? `${existing}, ${value}` : value);
    return response;
  } catch {
    // Immutable headers (a fetch() result passed through): copy the response.
    const headers = new Headers(response.headers);
    headers.set(SERVER_TIMING, existing ? `${existing}, ${value}` : value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }) as T;
  }
}

/**
 * Wrap a route handler so it runs inside a metrics store and its response
 * carries `Server-Timing` (for example `auth;dur=…;desc="calls=1 q=1",
 * db;dur=…;desc="q=7 tx=2", total;dur=…`). Errors propagate unchanged.
 */
export function withRequestMetrics<Args extends unknown[], R extends Response>(
  handler: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R> {
  return (...args: Args) =>
    runWithRequestMetrics(async (metrics) => {
      const response = await handler(...args);
      const proxyTiming = proxyTimingFrom(args);
      const routeTiming = serverTimingHeader(metrics);
      return appendServerTiming(
        response,
        proxyTiming ? `${proxyTiming}, ${routeTiming}` : routeTiming
      );
    });
}
