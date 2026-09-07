/**
 * Tracks legacy background ingestions so compatibility tests can wait for
 * fire-and-forget work to settle. Keep this outside the App Router route
 * module: Next.js only permits supported route-handler exports there.
 */
export const pendingIngestions = new Set<Promise<void>>();
