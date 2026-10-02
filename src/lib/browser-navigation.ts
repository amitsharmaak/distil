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
export function navigateFullPage(path: string, location: Pick<Location, "assign">): void {
  location.assign(path);
}

/**
 * Leave the current document for `path`, replacing this history entry.
 *
 * Use this when the account behind the tab has changed (sign-out, or a server
 * render for a different account). The App Router keeps visited route output
 * in a browser-memory cache for `experimental.staleTimes`, and
 * `router.refresh()` is only documented to clear the current route, so a
 * client-side navigation could leave the previous account's pages reachable
 * through Back. A document load discards that cache.
 */
export function replaceFullPage(path: string, location: Pick<Location, "replace">): void {
  location.replace(path);
}
