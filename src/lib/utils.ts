import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns true if the URL points to a Twitter/X post.
 * Used to apply tweet-specific rendering and skip AI summarization.
 */
export function isTwitterUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return host === "twitter.com" || host === "x.com";
  } catch {
    return false;
  }
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

/**
 * Normalizes a URL for deduplication. Two URLs that point to the same
 * content should produce the same normalized string.
 *
 * Steps: decode HTML entities, lowercase host, strip trailing slash,
 * remove fragments, remove tracking query params, sort remaining params.
 */
export function normalizeUrl(raw: string): string {
  // Decode HTML entities (e.g. &amp; → &) that Slack/email clients add.
  let cleaned = raw.replace(/&amp;/g, "&");

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return cleaned;
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  // Strip www. prefix for consistency.
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.slice(4);
  }

  // Remove tracking query parameters and sort the rest.
  const params = new URLSearchParams();
  const entries = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    params.set(key, value);
  }
  parsed.search = params.toString() ? `?${params.toString()}` : "";

  let result = parsed.toString();

  // Strip trailing slash (except for root path).
  if (result.endsWith("/") && parsed.pathname !== "/") {
    result = result.slice(0, -1);
  }

  return result;
}
