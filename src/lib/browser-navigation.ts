/**
 * Full-page navigation for client components.
 *
 * Use this instead of the App Router's client-side navigation when the
 * destination must be re-evaluated by the server with fresh cookies, for
 * example right after sign-in. The App Router caches prefetched responses,
 * including proxy redirects issued while the visitor was anonymous, so a
 * client-side replace() can resolve from that stale cache and never reach
 * the server.
 */
export function navigateFullPage(path: string): void {
  window.location.assign(path);
}
