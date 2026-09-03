import "server-only";

import { connectorLogger } from "@/lib/logger";

import { enqueue } from "../queue";
import type { PublisherDefinition } from "../types";

const LINK_REGEX = /<link\b[^>]*>([\s\S]*?)<\/link>/gi;
const HREF_REGEX = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/gi;

/**
 * Minimal RSS discovery: fetches the feed URL, regex-extracts <link> entries
 * (both `<link>url</link>` text-content style and `<link href="..."/>` Atom
 * style), filters via `publisher.urlMatcher`, and enqueues each. Returns the
 * number of URLs enqueued.
 *
 * No XML parser dependency by design — RSS/Atom feeds are heterogeneous and
 * a tolerant regex pass is sufficient for URL discovery.
 */
export async function runRssDiscovery(
  publisher: PublisherDefinition,
  strategy: { kind: "rss"; url: string },
): Promise<number> {
  let xml: string;
  try {
    const res = await fetch(strategy.url);
    if (!res.ok) {
      connectorLogger.warn(
        { publisherId: publisher.id, url: strategy.url, status: res.status },
        "[publishers/discovery/rss] fetch failed",
      );
      return 0;
    }
    xml = await res.text();
  } catch (err) {
    connectorLogger.warn(
      { err, publisherId: publisher.id, url: strategy.url },
      "[publishers/discovery/rss] fetch threw",
    );
    return 0;
  }

  const found = new Set<string>();

  // Atom-style: <link href="..." />
  for (const match of xml.matchAll(HREF_REGEX)) {
    if (match[1]) found.add(match[1].trim());
  }

  // RSS-style: <link>...</link>
  for (const match of xml.matchAll(LINK_REGEX)) {
    const inner = match[1]?.trim();
    if (!inner) continue;
    // Skip if the inner content is empty or looks like nested XML.
    const cleaned = inner.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    if (cleaned && /^https?:\/\//i.test(cleaned)) {
      found.add(cleaned);
    }
  }

  let enqueued = 0;
  for (const url of found) {
    if (!publisher.urlMatcher(url)) continue;
    try {
      enqueue(publisher.id, url);
      enqueued++;
    } catch (err) {
      connectorLogger.warn(
        { err, publisherId: publisher.id, url },
        "[publishers/discovery/rss] enqueue failed",
      );
    }
  }

  return enqueued;
}
