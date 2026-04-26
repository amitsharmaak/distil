import "server-only";

import { connectorLogger } from "../../logger";
import { buildRawContent, processContent } from "../../intelligence/pipeline";
import { runLoggedInFeedDiscovery } from "./discovery/logged-in-feed";
import { runRssDiscovery } from "./discovery/rss";
import { markFailed, markFetched, nextPending } from "./queue";
import { PUBLISHERS, getById } from "./registry";
import { ensureSession } from "./session";
import { PublisherAuthRequired, type PublisherDefinition } from "./types";

const DEFAULT_MIN_DELAY_MS = 2000;
const DEFAULT_BATCH_SIZE = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDiscovery(publisher: PublisherDefinition): Promise<number> {
  let discovered = 0;
  for (const strat of publisher.discovery) {
    if (strat.kind === "gmail-sender") {
      // Gmail connector triggers gmail-sender discovery inline; skip here.
      continue;
    }
    if (strat.kind === "rss") {
      try {
        discovered += await runRssDiscovery(publisher, strat);
      } catch (err) {
        connectorLogger.warn(
          { err, publisherId: publisher.id },
          "[publishers/worker] rss discovery failed",
        );
      }
      continue;
    }
    if (strat.kind === "logged-in-feed") {
      try {
        discovered += await runLoggedInFeedDiscovery(publisher, strat);
      } catch (err) {
        connectorLogger.warn(
          { err, publisherId: publisher.id },
          "[publishers/worker] logged-in-feed discovery skipped",
        );
      }
      continue;
    }
  }
  return discovered;
}

export async function syncPublisher(
  id: string,
): Promise<{ discovered: number; fetched: number; failed: number }> {
  const publisher = getById(id);
  if (!publisher) {
    throw new Error(`Publisher "${id}" not found in registry`);
  }

  connectorLogger.info(
    { publisherId: publisher.id },
    "[publishers/worker] sync start",
  );

  // Validate session up front; close immediately — fetcher reopens its own.
  const ctx = await ensureSession(publisher);
  await ctx.close();

  const discovered = await runDiscovery(publisher);

  const urls = nextPending(publisher.id, DEFAULT_BATCH_SIZE);
  const minDelay = publisher.minDelayMs ?? DEFAULT_MIN_DELAY_MS;

  let fetched = 0;
  let failed = 0;

  for (const url of urls) {
    await delay(minDelay);

    try {
      const raw = buildRawContent({
        sourceType: "publisher",
        rawBody: "",
        url,
        metadata: {
          pageTitle: publisher.name,
        },
      });

      const result = await processContent(raw);

      if (result.status === "rejected") {
        markFailed(publisher.id, url, result.rejectionReason ?? "rejected");
        failed++;
      } else {
        markFetched(publisher.id, url);
        fetched++;
      }
    } catch (err) {
      if (err instanceof PublisherAuthRequired) {
        connectorLogger.warn(
          { publisherId: publisher.id, url },
          "[publishers/worker] auth required mid-sync, aborting batch",
        );
        markFailed(publisher.id, url, "PublisherAuthRequired");
        failed++;
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      markFailed(publisher.id, url, message);
      failed++;
      connectorLogger.error(
        { err, publisherId: publisher.id, url },
        "[publishers/worker] processContent failed",
      );
    }
  }

  connectorLogger.info(
    { publisherId: publisher.id, discovered, fetched, failed },
    "[publishers/worker] sync complete",
  );

  return { discovered, fetched, failed };
}

export async function syncAllPublishers(): Promise<
  Record<
    string,
    { discovered: number; fetched: number; failed: number } | { error: string }
  >
> {
  const results: Record<
    string,
    { discovered: number; fetched: number; failed: number } | { error: string }
  > = {};

  for (const publisher of PUBLISHERS) {
    try {
      results[publisher.id] = await syncPublisher(publisher.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      connectorLogger.error(
        { err, publisherId: publisher.id },
        "[publishers/worker] syncPublisher threw",
      );
      results[publisher.id] = { error: message };
    }
  }

  return results;
}
