import "server-only";

import type { PublisherDefinition } from "../types";

/**
 * Stub for logged-in feed discovery. The real implementation will use the
 * persisted Playwright session to navigate to `path`, scrape anchor hrefs
 * matching `linkSelector`, filter via `publisher.urlMatcher`, and enqueue.
 *
 * Deferred to a later phase (depends on session.ts / fetcher.ts).
 */
export async function runLoggedInFeedDiscovery(
  publisher: PublisherDefinition,
  strategy: { kind: "logged-in-feed"; path: string; linkSelector: string },
): Promise<number> {
  void publisher;
  void strategy;
  throw new Error(
    "runLoggedInFeedDiscovery: not implemented yet (logged-in feed discovery is a future phase)",
  );
}
