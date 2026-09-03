import "server-only";

import { connectorLogger } from "@/lib/logger";

import { enqueue } from "../queue";
import { PUBLISHERS } from "../registry";

const URL_REGEX = /https?:\/\/[^\s"'<>)]+/g;

function extractEmailAddress(from: string): string {
  const angleMatch = from.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

function extractUrls(...sources: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const src of sources) {
    if (!src) continue;
    const matches = src.match(URL_REGEX);
    if (!matches) continue;
    for (const m of matches) {
      // Strip trailing punctuation that is commonly captured but not part of the URL.
      const cleaned = m.replace(/[.,;:!?)\]]+$/g, "");
      seen.add(cleaned);
    }
  }
  return Array.from(seen);
}

/**
 * Iterates registered publishers and, for each whose discovery list contains a
 * `gmail-sender` strategy that matches `message.from`, extracts URLs from the
 * message body/html and enqueues those that match `publisher.urlMatcher`.
 *
 * Synchronous (no awaiting) — `enqueue` is sync-safe and we don't want to slow
 * down the Gmail sync loop. Errors are swallowed by the caller.
 */
export function runGmailSenderDiscovery(message: {
  from: string;
  body?: string;
  html?: string;
  subject?: string;
}): void {
  const fromAddress = extractEmailAddress(message.from);
  if (!fromAddress) return;

  for (const publisher of PUBLISHERS) {
    const matchingStrategies = publisher.discovery.filter(
      (s): s is { kind: "gmail-sender"; senders: string[] } =>
        s.kind === "gmail-sender",
    );
    if (matchingStrategies.length === 0) continue;

    const senderMatches = matchingStrategies.some((s) =>
      s.senders.some((sender) =>
        fromAddress.includes(sender.trim().toLowerCase()),
      ),
    );
    if (!senderMatches) continue;

    const urls = extractUrls(message.body, message.html, message.subject);
    if (urls.length === 0) continue;

    let enqueued = 0;
    for (const url of urls) {
      if (!publisher.urlMatcher(url)) continue;
      try {
        enqueue(publisher.id, url);
        enqueued++;
      } catch (err) {
        connectorLogger.warn(
          { err, publisherId: publisher.id, url },
          "[publishers/discovery/gmail-sender] enqueue failed",
        );
      }
    }

    if (enqueued > 0) {
      connectorLogger.info(
        {
          publisherId: publisher.id,
          enqueued,
          from: fromAddress,
        },
        "[publishers/discovery/gmail-sender] discovered URLs from Gmail message",
      );
    }
  }
}
