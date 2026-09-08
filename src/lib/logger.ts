/**
 * Server-only structured logging boundary.
 *
 * Log records are deliberately allowlisted. Application code may attach opaque
 * correlation IDs and stable error codes, but raw request data, credentials,
 * user content, prompts, and Error messages never cross this boundary.
 */

import pino from "pino";

const REDACTED = "[REDACTED]";
const OMITTED_MESSAGE = "[log message omitted]";

const SAFE_FIELDS = new Set([
  "subsystem",
  "userId",
  "actorId",
  "actorKind",
  "requestId",
  "traceId",
  "sessionId",
  "captureId",
  "itemId",
  "collectionId",
  "jobId",
  "exportId",
  "deletionId",
  "tokenId",
  "workerId",
  "operation",
  "event",
  "action",
  "toolName",
  "jobType",
  "provider",
  "model",
  "environment",
  "status",
  "statusCode",
  "code",
  "errorCode",
  "attempt",
  "maxAttempts",
  "durationMs",
  "latencyMs",
  "count",
  "limit",
  "remaining",
  "retryable",
  "err",
  "error",
]);

/**
 * Pino redaction is a defence-in-depth backstop for known sensitive paths.
 * The formatter below is stricter: it drops every non-allowlisted field.
 */
export const LOG_REDACTION_PATHS = [
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "password",
  "secret",
  "magicLink",
  "url",
  "query",
  "prompt",
  "content",
  "input",
  "output",
  "params",
  "parameters",
  "result",
  "reasoning",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "err.message",
  "error.message",
  "*.authorization",
  "*.cookie",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.password",
  "*.secret",
  "*.url",
  "*.query",
  "*.prompt",
  "*.content",
  "*.input",
  "*.output",
  "*.params",
  "*.parameters",
  "*.result",
  "*.reasoning",
] as const;

function safeIdentifier(value: unknown): string | number | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  // IDs and codes are useful, but free text could contain a URL, token, prompt,
  // or provider response. Keep this deliberately narrower than user input.
  return /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : undefined;
}

function stableErrorCode(value: unknown): string {
  const candidate = safeIdentifier(value);
  return typeof candidate === "string" ? candidate : "INTERNAL_ERROR";
}

/** Serializes errors without message, stack, causes, or arbitrary properties. */
export function sanitizeLogError(error: unknown): { type: string; code: string } {
  if (error && typeof error === "object" && !(error instanceof Error)) {
    const candidate = error as { type?: unknown; code?: unknown };
    const type =
      typeof candidate.type === "string" && /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(candidate.type)
        ? candidate.type
        : "Error";
    return { type, code: stableErrorCode(candidate.code) };
  }
  if (!(error instanceof Error)) return { type: "Error", code: "INTERNAL_ERROR" };
  const type = /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(error.name) ? error.name : "Error";
  const coded = error as Error & { code?: unknown; errorCode?: unknown };
  return { type, code: stableErrorCode(coded.code ?? coded.errorCode) };
}

/** Drops every structured field other than explicitly approved operational metadata. */
export function sanitizeLogObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (value instanceof Error) return { err: sanitizeLogError(value) };

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (!SAFE_FIELDS.has(key)) continue;
    if (key === "err" || key === "error") {
      sanitized[key] = sanitizeLogError(nested);
      continue;
    }
    const safe = safeIdentifier(nested);
    if (safe !== undefined) sanitized[key] = safe;
  }
  return sanitized;
}

function sanitizeLogArguments(args: unknown[]): unknown[] {
  const first = args[0];
  if (first instanceof Error) return [{ err: sanitizeLogError(first) }, OMITTED_MESSAGE];
  if (first && typeof first === "object") return [sanitizeLogObject(first), OMITTED_MESSAGE];
  // Pino's string-only call form is not safe for dynamic data. Keep a stable
  // marker and require useful metadata to travel in the allowlisted object.
  return [OMITTED_MESSAGE];
}

export interface DistilLoggerOptions {
  development?: boolean;
  destination?: pino.DestinationStream;
}

const logLevel = process.env.LOG_LEVEL ?? "info";

export function createLogger(options: DistilLoggerOptions = {}): pino.Logger {
  const development = options.development ?? process.env.NODE_ENV !== "production";
  const loggerOptions: pino.LoggerOptions = {
    level: logLevel,
    redact: { paths: [...LOG_REDACTION_PATHS], censor: REDACTED },
    serializers: { err: sanitizeLogError, error: sanitizeLogError },
    formatters: {
      bindings: sanitizeLogObject,
      log: sanitizeLogObject,
    },
    hooks: {
      logMethod(args, method) {
        method.apply(this, sanitizeLogArguments(args as unknown[]) as Parameters<typeof method>);
      },
    },
  };

  if (options.destination) return pino(loggerOptions, options.destination);

  if (development) {
    // Pino applies hooks, serializers, formatters, and redaction before this
    // transport. Pretty development output therefore has the same boundary.
    try {
      require.resolve("pino-pretty");
      return pino({
        ...loggerOptions,
        transport: { target: "pino-pretty", options: { colorize: true } },
      });
    } catch {
      // pino-pretty is optional; JSON output remains redacted.
    }
  }

  return pino(loggerOptions);
}

const globalForLogger = globalThis as typeof globalThis & {
  __distilLogger?: pino.Logger;
};

const logger: pino.Logger = globalForLogger.__distilLogger ?? createLogger();

if (process.env.NODE_ENV !== "production") {
  globalForLogger.__distilLogger = logger;
}

export const aiLogger = logger.child({ subsystem: "ai" });
export const apiLogger = logger.child({ subsystem: "api" });
export const dbLogger = logger.child({ subsystem: "db" });
export const connectorLogger = logger.child({ subsystem: "connector" });

export default logger;
