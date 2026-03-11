/**
 * Structured JSON logger — singleton pino instance.
 *
 * Uses the globalThis pattern (same as db.ts) to survive Next.js hot reloads
 * in development without creating duplicate logger instances.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 *
 * Usage:
 *   import { aiLogger } from "@/lib/logger";
 *   aiLogger.info({ itemId }, "Summary generated");
 *   aiLogger.error({ err }, "Summarization failed");
 */

import pino from "pino";

const globalForLogger = globalThis as typeof globalThis & {
  __distilLogger?: pino.Logger;
};

const logLevel = process.env.LOG_LEVEL ?? "info";

function createLogger(): pino.Logger {
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    // In development, use pino-pretty transport if available for readable output.
    // If pino-pretty is not installed, fall back to default JSON output.
    try {
      require.resolve("pino-pretty");
      return pino({
        level: logLevel,
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      });
    } catch {
      // pino-pretty not available — use default JSON output
    }
  }

  return pino({ level: logLevel });
}

const logger: pino.Logger = globalForLogger.__distilLogger ?? createLogger();

// Persist to globalThis in non-production so hot reloads reuse the instance.
if (process.env.NODE_ENV !== "production") {
  globalForLogger.__distilLogger = logger;
}

// ── Child loggers per subsystem ──────────────────────────────────────────────

export const aiLogger = logger.child({ subsystem: "ai" });
export const apiLogger = logger.child({ subsystem: "api" });
export const dbLogger = logger.child({ subsystem: "db" });
export const connectorLogger = logger.child({ subsystem: "connector" });

export default logger;
