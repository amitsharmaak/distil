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
 * Fixes URLs that contain an embedded duplicate (e.g. a redirect URL
 * concatenated onto the original). This happens when Slack unfurls
 * certain links (LinkedIn, etc.) or when clipboard copy adds a
 * locale-suffixed redirect to the original URL.
 *
 * Example: "https://example.com/pagehttps://example.com/page?_l=en_US"
 *        → "https://example.com/page"
 */
export function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();

  // Find the second occurrence of "http://" or "https://" inside the string.
  // The first occurrence starts at index 0; any subsequent one means the URL
  // has an embedded duplicate or a completely different URL glued on.
  const secondHttp = trimmed.indexOf("http", trimmed.indexOf("://") + 3);
  if (secondHttp > 0) {
    const prefix = trimmed.slice(secondHttp);
    if (prefix.startsWith("http://") || prefix.startsWith("https://")) {
      return trimmed.slice(0, secondHttp);
    }
  }

  return trimmed;
}

/**
 * Normalizes a URL for deduplication. Two URLs that point to the same
 * content should produce the same normalized string.
 *
 * Steps: sanitize embedded duplicates, decode HTML entities, lowercase
 * host, strip trailing slash, remove fragments, remove tracking query
 * params, sort remaining params.
 */
export function normalizeUrl(raw: string): string {
  // Decode HTML entities (e.g. &amp; → &) that Slack/email clients add.
  let cleaned = sanitizeUrl(raw).replace(/&amp;/g, "&");

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
