/**
 * Sources and citations for deep research.
 *
 * Search stages collect sources per finding (from Google Search grounding, or
 * a short list the model recalls on the plain fallback). Synthesis sees one
 * numbered, de-duplicated list and cites with `[n]`; afterwards only the cited
 * sources are kept, renumbered 1..k in order of first citation.
 *
 * SERVER-SIDE ONLY.
 */

import type { GroundingSource } from "./providers";

/** A source attached to one finding in the durable run state. */
export interface FindingSource {
  url: string;
  /** Page title, or the publisher's domain when grounding gave nothing better. */
  title: string;
}

/**
 * A cited source as stored in `research_reports.sources` (JSON array). `id`
 * matches the `[n]` markers in the report text. `grounded` is false when the
 * source was recalled by the model rather than returned by web search.
 */
export interface ResearchSource {
  id: number;
  url: string;
  title: string;
  domain: string;
  grounded: boolean;
}

/** Host of the Google grounding redirect links; the only host ever fetched. */
export const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const GROUNDING_REDIRECT_PATH = "/grounding-api-redirect/";
/** Budget for resolving all of one stage's redirects (they run in parallel). */
export const GROUNDING_RESOLVE_TIMEOUT_MS = 3_000;
/** At most this many redirects are resolved per stage; the rest keep the redirect link. */
export const MAX_GROUNDING_RESOLUTIONS = 8;
/** Recalled sources accepted per ungrounded answer (the prompt asks for at most three). */
export const MAX_RECALLED_SOURCES = 3;
/** URLs scraped from a legacy (version 1) finding. */
export const MAX_SCRAPED_SOURCES = 8;
/** Upper bound on the numbered list handed to synthesis. */
export const MAX_SYNTHESIS_SOURCES = 40;

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

const DOMAIN_LIKE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

export function isGroundingRedirect(value: string): boolean {
  const url = parseHttpUrl(value);
  return (
    url !== null &&
    url.protocol === "https:" &&
    url.hostname === GROUNDING_REDIRECT_HOST &&
    url.pathname.startsWith(GROUNDING_REDIRECT_PATH)
  );
}

/**
 * Display domain: the host without `www.`. For an unresolved grounding
 * redirect the grounding title (which is usually the publisher's domain) is
 * used instead of Google's redirect host.
 */
export function sourceDomain(value: string, title = ""): string {
  if (isGroundingRedirect(value) && DOMAIN_LIKE.test(title.trim())) {
    return title
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
  }
  const url = parseHttpUrl(value);
  return url ? url.hostname.toLowerCase().replace(/^www\./, "") : "";
}

/** Key used to de-duplicate sources: host lower-cased, no hash, no trailing slash. */
function sourceKey(value: string): string {
  const url = parseHttpUrl(value);
  if (!url) return value;
  url.hash = "";
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "";
  return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
}

function withTitle(source: FindingSource): FindingSource {
  const title = source.title.trim() || sourceDomain(source.url) || "Source";
  return { url: source.url, title };
}

export interface ResolveGroundingOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResolutions?: number;
}

/**
 * Reads the `Location` of one grounding redirect without following it. Only
 * an absolute http(s) target on another host is accepted; anything else
 * (timeout, non-redirect status, relative or malformed location) is `null`.
 */
async function readRedirectTarget(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal });
    await response.body?.cancel().catch(() => undefined);
    if (response.status < 300 || response.status >= 400) return null;
    const location = response.headers.get("location");
    if (!location) return null;
    const target = parseHttpUrl(location);
    if (!target || target.hostname === GROUNDING_REDIRECT_HOST) return null;
    return target.toString();
  } catch {
    return null;
  }
}

/**
 * Replaces Google grounding redirect links with their final URLs. Only links
 * on {@link GROUNDING_REDIRECT_HOST} are requested, with `redirect: "manual"`
 * so no other host is ever contacted; at most `maxResolutions` are tried
 * within one shared timeout. A redirect that cannot be resolved is kept. The
 * grounding title (usually the domain) is kept, falling back to the domain.
 */
export async function resolveGroundingRedirects(
  sources: GroundingSource[],
  options: ResolveGroundingOptions = {}
): Promise<FindingSource[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxResolutions = options.maxResolutions ?? MAX_GROUNDING_RESOLUTIONS;
  const signal = AbortSignal.timeout(options.timeoutMs ?? GROUNDING_RESOLVE_TIMEOUT_MS);
  let remaining = maxResolutions;
  const resolved = await Promise.all(
    sources.map(async (source): Promise<FindingSource> => {
      const title = source.title.trim();
      if (!isGroundingRedirect(source.url) || remaining <= 0) {
        return { url: source.url, title: title || sourceDomain(source.url, title) || "Source" };
      }
      remaining -= 1;
      const target = await readRedirectTarget(fetchImpl, source.url, signal);
      if (!target) {
        return { url: source.url, title: title || "Source" };
      }
      return { url: target, title: title || sourceDomain(target) || "Source" };
    })
  );
  return dedupeSources(resolved);
}

function dedupeSources(sources: FindingSource[]): FindingSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = sourceKey(source.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toRecalledSources(value: unknown): FindingSource[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === "object" && value !== null) {
    const nested = (value as { sources?: unknown }).sources;
    if (Array.isArray(nested)) list = nested;
  }
  const sources: FindingSource[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const { url, title } = entry as { url?: unknown; title?: unknown };
    if (typeof url !== "string" || !parseHttpUrl(url.trim())) continue;
    sources.push(withTitle({ url: url.trim(), title: typeof title === "string" ? title : "" }));
  }
  return dedupeSources(sources).slice(0, MAX_RECALLED_SOURCES);
}

const TRAILING_FENCE = /```[ \t]*(sources|json)?[ \t]*\r?\n((?:(?!```)[\s\S])*)```\s*$/i;
const UNCLOSED_SOURCES_FENCE = /```[ \t]*sources[^\n]*\n[\s\S]*$/i;
const TRAILING_BARE_ARRAY = /\n[ \t]*(\[\s*\{[\s\S]*\}\s*\])\s*$/;
const TRAILING_SOURCES_LABEL =
  /\n[ \t]*(?:#{1,6}[ \t]*)?\**[ \t]*sources[ \t]*\**:?[ \t]*\**[ \t]*$/i;

/**
 * Splits an ungrounded answer into notes and the trailing JSON block of
 * recalled sources the prompt asks for. A malformed or missing block yields
 * no sources; the block (and a dangling "Sources:" label) is always removed
 * from the notes.
 */
export function extractRecalledSources(text: string): { notes: string; sources: FindingSource[] } {
  let notes = text.trimEnd();
  let payload: string | null = null;
  const fenced = notes.match(TRAILING_FENCE);
  const fenceLooksLikeSources =
    fenced && (fenced[1] !== undefined || /^\s*[[{]/.test(fenced[2] ?? ""));
  if (fenced && fenceLooksLikeSources && fenced.index !== undefined) {
    payload = fenced[2] ?? "";
    notes = notes.slice(0, fenced.index);
  } else {
    const unclosed = notes.match(UNCLOSED_SOURCES_FENCE);
    if (unclosed && unclosed.index !== undefined) {
      notes = notes.slice(0, unclosed.index);
    } else {
      const bare = notes.match(TRAILING_BARE_ARRAY);
      if (bare && bare.index !== undefined) {
        payload = bare[1] ?? "";
        notes = notes.slice(0, bare.index);
      }
    }
  }
  notes = notes.trimEnd().replace(TRAILING_SOURCES_LABEL, "").trimEnd();
  if (payload === null) return { notes, sources: [] };
  try {
    return { notes, sources: toRecalledSources(JSON.parse(payload)) };
  } catch {
    return { notes, sources: [] };
  }
}

/** URLs found in legacy free-text findings, titled by their domain. */
export function scrapeUrlSources(text: string): FindingSource[] {
  const matches = text.match(/https?:\/\/[^\s)>\]"'`]+/g) ?? [];
  const sources = matches
    .map((raw) => raw.replace(/[.,;:!?]+$/, ""))
    .filter((url) => parseHttpUrl(url) !== null)
    .map((url) => withTitle({ url, title: "" }));
  return dedupeSources(sources).slice(0, MAX_SCRAPED_SOURCES);
}

/** The findings shape the catalog needs (a subset of `ResearchFinding`). */
export interface CatalogFinding {
  sources: FindingSource[];
  grounded: boolean;
}

export interface SourceCatalog {
  /** Numbered 1..n in order of first appearance across the findings. */
  sources: ResearchSource[];
  /** For each finding (same order as the input), the catalog ids it contributed. */
  idsByFinding: number[][];
}

/**
 * One numbered, de-duplicated source list across all findings. A source seen
 * both grounded and recalled counts as grounded. Capped at
 * {@link MAX_SYNTHESIS_SOURCES}.
 */
export function buildSourceCatalog(findings: CatalogFinding[]): SourceCatalog {
  const sources: ResearchSource[] = [];
  const byKey = new Map<string, ResearchSource>();
  const idsByFinding = findings.map((finding) => {
    const ids: number[] = [];
    for (const source of finding.sources) {
      const key = sourceKey(source.url);
      let entry = byKey.get(key);
      if (!entry) {
        if (sources.length >= MAX_SYNTHESIS_SOURCES) continue;
        entry = {
          id: sources.length + 1,
          url: source.url,
          title: source.title.trim() || sourceDomain(source.url) || "Source",
          domain: sourceDomain(source.url, source.title),
          grounded: finding.grounded,
        };
        byKey.set(key, entry);
        sources.push(entry);
      } else if (finding.grounded) {
        entry.grounded = true;
      }
      if (!ids.includes(entry.id)) ids.push(entry.id);
    }
    return ids;
  });
  return { sources, idsByFinding };
}

/** `[1] Title — domain` lines for the synthesis prompt. */
export function formatSourceList(sources: ResearchSource[]): string {
  return sources
    .map((source) => {
      const suffix = source.domain && source.domain !== source.title ? ` — ${source.domain}` : "";
      return `[${source.id}] ${source.title}${suffix}`;
    })
    .join("\n");
}

/**
 * Citation markers: `[3]`, `[1, 4]`, `[2-4]`, not followed by `(` or `:`
 * (a markdown link or a link reference definition).
 */
const CITATION_MARKER = /( ?)\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\](?![(:])/g;
const MAX_RANGE = 10;

function markerIds(body: string): number[] {
  const ids: number[] = [];
  for (const part of body.split(",")) {
    const range = part.split(/[–-]/).map((value) => Number.parseInt(value.trim(), 10));
    if (range.length === 2 && range[0]! <= range[1]! && range[1]! - range[0]! <= MAX_RANGE) {
      for (let id = range[0]!; id <= range[1]!; id++) ids.push(id);
    } else if (range.length === 1 && Number.isFinite(range[0])) {
      ids.push(range[0]!);
    }
  }
  return ids;
}

/**
 * Keeps only the catalog sources the report cites, renumbered 1..k in order
 * of first citation, and rewrites every marker to the new ids as adjacent
 * `[n]` markers. Ids that are not in the catalog are dropped; a marker left
 * with no valid id is removed.
 */
export function finalizeCitations(
  report: string,
  catalog: ResearchSource[]
): { report: string; sources: ResearchSource[] } {
  const byId = new Map(catalog.map((source) => [source.id, source]));
  const renumber = new Map<number, number>();
  const cited: ResearchSource[] = [];
  for (const match of report.matchAll(CITATION_MARKER)) {
    for (const id of markerIds(match[2] ?? "")) {
      const source = byId.get(id);
      if (!source || renumber.has(id)) continue;
      renumber.set(id, cited.length + 1);
      cited.push({ ...source, id: cited.length + 1 });
    }
  }
  const rewritten = report.replace(CITATION_MARKER, (_match, space: string, body: string) => {
    const ids = [
      ...new Set(
        markerIds(body)
          .map((id) => renumber.get(id))
          .filter((id): id is number => id !== undefined)
      ),
    ];
    return ids.length === 0 ? "" : `${space}${ids.map((id) => `[${id}]`).join("")}`;
  });
  return { report: rewritten, sources: cited };
}
