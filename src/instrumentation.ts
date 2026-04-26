/**
 * Next.js instrumentation hook — called once when the server boots.
 *
 * Used here to start the background sync scheduler. The NEXT_RUNTIME guard
 * ensures the scheduler only runs in the Node.js environment (not on the
 * Edge Runtime, which doesn't support SQLite or Node.js timers).
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSyncScheduler } = await import("./lib/sync-scheduler");
    startSyncScheduler();
  }
}
