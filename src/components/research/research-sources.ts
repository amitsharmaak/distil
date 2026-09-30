/**
 * Source normalisation for deep-research reports.
 *
 * `research_reports.sources` is a text column holding JSON. Reports written so far store a
 * `string[]` of URLs scraped from the findings; since phase R2 the engine stores cited-only,
 * numbered source objects `{ id, url, title, domain, grounded }` in the same column. The page
 * accepts both shapes and normalises them here, in one place.
 */

export interface ResearchSource {
  /** 1-based number; for legacy string sources, the position in the stored list. */
  id: number;
  url: string;
  /** Page title when known (R2 objects); legacy sources have none. */
  title: string | null;
  /** Host without a leading "www.". */
  domain: string;
  /** True when a search tool returned the source; false when recalled or scraped. */
  grounded: boolean;
}

export interface SplitSources {
  /** Sources the report body refers to, in order of first mention. */
  cited: ResearchSource[];
  /** Everything else the research touched. */
  other: ResearchSource[];
}

function parseUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

/** Host of a URL without "www.", or the input itself when it is not a valid http(s) URL. */
export function domainOf(url: string): string {
  const parsed = parseUrl(url);
  return parsed ? parsed.hostname.replace(/^www\./i, "").toLowerCase() : url;
}

/**
 * A short, readable path for display: at most two segments, decoded, ellipsised past ~40
 * characters. Empty for a site root.
 */
export function shortPath(url: string, maxLength = 40): string {
  const parsed = parseUrl(url);
  if (!parsed) return "";
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "";
  let decoded: string[];
  try {
    decoded = segments.map((segment) => decodeURIComponent(segment));
  } catch {
    decoded = segments;
  }
  let path = `/${decoded.slice(0, 2).join("/")}${decoded.length > 2 ? "/…" : ""}`;
  if (path.length > maxLength) path = `${path.slice(0, maxLength - 1)}…`;
  return path;
}

/** Comparison key: lowercase host without "www.", no hash, no trailing slash or punctuation. */
export function urlKey(url: string): string {
  const trimmed = url.trim().replace(/[.,;:!?'"]+$/, "");
  const parsed = parseUrl(trimmed);
  if (!parsed) return trimmed.toLowerCase();
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${host}${path}${parsed.search}`;
}

function sourceFromObject(value: Record<string, unknown>, index: number): ResearchSource | null {
  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (!parseUrl(url)) return null;
  const id =
    typeof value.id === "number" && Number.isFinite(value.id) && value.id > 0
      ? Math.floor(value.id)
      : index + 1;
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : null;
  const domain =
    typeof value.domain === "string" && value.domain.trim()
      ? value.domain.trim().replace(/^www\./i, "")
      : domainOf(url);
  return { id, url, title, domain, grounded: value.grounded === true };
}

/**
 * Normalises whatever the API returned for `sources` — a legacy `string[]`, an array of source
 * objects, a JSON string of either, or garbage — into `ResearchSource[]`. Invalid entries and
 * repeated URLs are dropped.
 */
export function normalizeSources(raw: unknown): ResearchSource[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];
  value.forEach((entry, index) => {
    let source: ResearchSource | null = null;
    if (typeof entry === "string") {
      const url = entry.trim();
      if (parseUrl(url)) {
        source = { id: index + 1, url, title: null, domain: domainOf(url), grounded: false };
      }
    } else if (entry && typeof entry === "object") {
      source = sourceFromObject(entry as Record<string, unknown>, index);
    }
    if (!source) return;
    const key = urlKey(source.url);
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  });
  return sources;
}

/**
 * True when the stored sources are R2's numbered source objects (cited-only, ids matching the
 * report's `[n]` markers) rather than a legacy URL list. Accepts the raw API value or its JSON.
 */
export function hasNumberedSources(raw: unknown): boolean {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))
  );
}

const MARKDOWN_LINK_RE = /\]\((https?:\/\/[^)\s]+)/g;
const BARE_URL_RE = /https?:\/\/[^\s)\]<>"]+/g;

/** http(s) URLs referenced in a markdown text, de-duplicated, in order of first appearance. */
export function urlsInMarkdown(markdown: string): string[] {
  const found: { url: string; at: number }[] = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    found.push({ url: match[1], at: match.index ?? 0 });
  }
  for (const match of markdown.matchAll(BARE_URL_RE)) {
    found.push({ url: match[0].replace(/[.,;:!?'"]+$/, ""), at: match.index ?? 0 });
  }
  found.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const { url } of found) {
    const key = urlKey(url);
    if (seen.has(key) || !parseUrl(url)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

/**
 * Splits sources into those the report cites and the rest. A source is cited when its URL appears
 * in the report, or — for numbered sources — when the report carries its `[n]` marker. URLs the
 * report links that are missing from the stored list are cited too (as untitled sources), so the
 * cited list always matches what the reader saw in the text.
 */
export function splitSources(sources: ResearchSource[], reportMarkdown: string): SplitSources {
  const byKey = new Map(sources.map((source) => [urlKey(source.url), source]));
  const cited: ResearchSource[] = [];
  const citedKeys = new Set<string>();
  let nextId = sources.reduce((max, source) => Math.max(max, source.id), 0) + 1;

  for (const url of urlsInMarkdown(reportMarkdown)) {
    const key = urlKey(url);
    if (citedKeys.has(key)) continue;
    citedKeys.add(key);
    cited.push(
      byKey.get(key) ?? {
        id: nextId++,
        url,
        title: null,
        domain: domainOf(url),
        grounded: false,
      }
    );
  }
  for (const source of sources) {
    const key = urlKey(source.url);
    if (citedKeys.has(key)) continue;
    if (new RegExp(String.raw`\[${source.id}\](?!\()`).test(reportMarkdown)) {
      citedKeys.add(key);
      cited.push(source);
    }
  }
  const other = sources.filter((source) => !citedKeys.has(urlKey(source.url)));
  return { cited, other };
}
