/**
 * Background sync scheduler.
 *
 * Automatically syncs connected sources (Gmail, Slack) on a configurable
 * interval. Designed to be started once from instrumentation.ts on server
 * startup.
 *
 * Behaviour:
 * - On startup: immediately checks if any source is overdue and syncs it.
 *   This handles the "app was down / offline" catch-up case.
 * - Every CHECK_INTERVAL_MS: re-checks and syncs any source whose interval
 *   has elapsed since the last *successful* sync.
 * - Timestamps are only written on success, so network failures / API errors
 *   automatically retry on the next check cycle.
 * - Set SYNC_INTERVAL_HOURS=0 to disable automatic syncing entirely.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { config } from "./config";
import { getUserSetting, setUserSetting, getOAuthToken } from "./db";
import { connectorLogger } from "./logger";

// How often to check whether a sync is due (independent of the sync interval).
// Keeping this at 15 minutes means the app catches up within 15 min of coming
// back online, even if the configured sync interval is much longer.
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// DB keys used to persist last-successful-sync timestamps.
const GMAIL_LAST_SYNC_KEY = "gmail_last_scheduled_sync";
const SLACK_LAST_SYNC_KEY = "slack_last_scheduled_sync";
const PUBLISHERS_LAST_SYNC_KEY = "publishers_last_scheduled_sync";

// Singleton guard — prevents duplicate schedulers across Next.js hot reloads.
const globalForScheduler = globalThis as typeof globalThis & {
  __distilSchedulerStarted?: boolean;
};

/**
 * Starts the background sync scheduler. Safe to call multiple times — only
 * the first call has any effect (subsequent calls are no-ops).
 */
export function startSyncScheduler(): void {
  if (globalForScheduler.__distilSchedulerStarted) return;
  globalForScheduler.__distilSchedulerStarted = true;

  const intervalHours = config.syncIntervalHours;
  if (intervalHours <= 0) {
    connectorLogger.info("Auto-sync disabled (SYNC_INTERVAL_HOURS=0)");
    return;
  }

  connectorLogger.info(
    { intervalHours },
    "Starting background sync scheduler",
  );

  // Catch-up check immediately on startup.
  runDueSync().catch((err) =>
    connectorLogger.error({ err }, "Startup sync check failed"),
  );

  // Periodic check — fires every 15 min regardless of sync interval.
  const timer = setInterval(() => {
    runDueSync().catch((err) =>
      connectorLogger.error({ err }, "Scheduled sync check failed"),
    );
  }, CHECK_INTERVAL_MS);

  // Don't keep the process alive just for the scheduler.
  timer.unref();
}

// ── Core sync logic ────────────────────────────────────────────────────────────

/**
 * Checks each connected source and syncs those whose interval has elapsed
 * since the last successful sync.
 */
async function runDueSync(): Promise<void> {
  const intervalMs = config.syncIntervalHours * 60 * 60 * 1000;
  const now = Date.now();

  await maybeSync({
    name: "Gmail",
    settingKey: GMAIL_LAST_SYNC_KEY,
    isConnected: () => !!getOAuthToken("gmail"),
    sync: async () => {
      // Dynamic import keeps the heavy googleapis SDK out of the cold-start path.
      const { syncNewsletters } = await import("./connectors/gmail");
      return syncNewsletters();
    },
    intervalMs,
    now,
  });

  await maybeSync({
    name: "Slack",
    settingKey: SLACK_LAST_SYNC_KEY,
    isConnected: () => !!config.slackBotToken,
    sync: async () => {
      const { syncSlackMessages } = await import("./connectors/slack");
      return syncSlackMessages();
    },
    intervalMs,
    now,
  });

  await maybeSync({
    name: "Publishers",
    settingKey: PUBLISHERS_LAST_SYNC_KEY,
    // Only sync publishers that have an active authenticated session — avoids
    // launching Chromium on startup for publishers the user hasn't connected yet.
    isConnected: async () => {
      const { PUBLISHERS } = await import("./connectors/publishers/registry");
      const { getStatus } = await import("./connectors/publishers/session");
      const statuses = await Promise.all(PUBLISHERS.map((p) => getStatus(p)));
      return statuses.some((s) => s.state === "connected");
    },
    sync: async () => {
      const { syncAllPublishers } = await import(
        "./connectors/publishers/worker"
      );
      const results = await syncAllPublishers();
      const count = Object.values(results).reduce(
        (sum, r) => sum + ("fetched" in r ? r.fetched : 0),
        0,
      );
      return { count };
    },
    intervalMs,
    now,
  });
}

interface SyncTask {
  name: string;
  settingKey: string;
  isConnected: () => boolean | Promise<boolean>;
  sync: () => Promise<{ count: number }>;
  intervalMs: number;
  now: number;
}

async function maybeSync(task: SyncTask): Promise<void> {
  if (!(await task.isConnected())) return;

  const raw = getUserSetting(task.settingKey);
  const lastSync = raw ? parseInt(raw, 10) : 0;
  const elapsed = task.now - lastSync;

  if (elapsed < task.intervalMs) {
    connectorLogger.debug(
      {
        source: task.name,
        nextSyncIn: Math.round((task.intervalMs - elapsed) / 60_000),
      },
      "Skipping sync — not due yet",
    );
    return;
  }

  connectorLogger.info(
    { source: task.name, lastSync: lastSync ? new Date(lastSync).toISOString() : "never" },
    "Auto-sync starting",
  );

  try {
    const result = await task.sync();
    // Only update the timestamp on success so failures are retried next cycle.
    setUserSetting(task.settingKey, String(task.now));
    connectorLogger.info(
      { source: task.name, count: result.count },
      "Auto-sync completed",
    );
  } catch (err) {
    connectorLogger.error(
      { source: task.name, err },
      "Auto-sync failed — will retry next cycle",
    );
  }
}
