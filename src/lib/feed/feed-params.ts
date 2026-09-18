import { z } from "zod";

import type { FeedArchiveFilter, FeedPage, FeedQuery, FeedSort } from "@/lib/feed/feed-query";
import type { RepositorySet } from "@/lib/repositories/ports";
import type { ContentType, Priority, SourceType } from "@/lib/types";

/**
 * The one feed query contract. `GET /api/v1/feed` and the server-rendered
 * `/feed` page parse the same search parameters through this schema, so a
 * URL the page renders on the server is exactly the URL the client island
 * re-requests when it pages or polls.
 */
export const feedQuerySchema = z.object({
  read: z.enum(["true", "false"]).optional(),
  archive: z.enum(["exclude", "only", "include"]).optional(),
  topic: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
  source: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  contentType: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  priority: z
    .array(z.enum(["high", "medium", "low"]))
    .max(3)
    .optional(),
  collection: z.array(z.string().trim().min(1).max(160)).max(25).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sort: z.enum(["recent", "priority", "for_you"]).default("for_you"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(1024).optional(),
  resurface: z.enum(["stale"]).optional(),
});

export type FeedQueryParams = z.infer<typeof feedQuerySchema>;

/** `URLSearchParams` (API route) or Next's `searchParams` record (page). */
export type FeedSearchInput = URLSearchParams | Record<string, string | string[] | undefined>;

function toSearchParams(input: FeedSearchInput): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) params.append(name, entry);
  }
  return params;
}

/** Repeated keys and comma lists both mean "any of these". */
export function multiValue(input: FeedSearchInput, name: string): string[] {
  return toSearchParams(input)
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export type ParsedFeedQuery =
  | { ok: true; data: FeedQueryParams }
  | { ok: false; message: string; issues?: z.ZodIssue[] };

export function parseFeedQuery(input: FeedSearchInput): ParsedFeedQuery {
  const params = toSearchParams(input);
  const optional = (name: string) => params.get(name) ?? undefined;
  const list = (name: string) => {
    const values = multiValue(params, name);
    return values.length ? values : undefined;
  };
  const parsed = feedQuerySchema.safeParse({
    read: optional("read"),
    archive: optional("archive"),
    topic: list("topic"),
    source: list("source"),
    contentType: list("contentType"),
    priority: list("priority"),
    collection: list("collection"),
    dateFrom: optional("dateFrom"),
    dateTo: optional("dateTo"),
    sort: optional("sort"),
    limit: optional("limit"),
    cursor: optional("cursor"),
    resurface: optional("resurface"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid feed query", issues: parsed.error.issues };
  }
  if (parsed.data.dateFrom && parsed.data.dateTo && parsed.data.dateFrom > parsed.data.dateTo) {
    return { ok: false, message: "dateFrom must not be after dateTo" };
  }
  return { ok: true, data: parsed.data };
}

/** The `feed.list()` arguments for a parsed query; personalization is server-gated. */
export function feedListQuery(
  data: FeedQueryParams,
  personalizationEnabled: boolean
): Omit<FeedQuery, "now"> {
  return {
    read: data.read === undefined ? undefined : data.read === "true",
    archive: data.archive,
    topics: data.topic,
    sources: data.source,
    contentTypes: data.contentType,
    priorities: data.priority,
    collectionIds: data.collection,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    sort: data.sort,
    limit: data.limit,
    cursor: data.cursor,
    personalizationEnabled,
  };
}

export type FeedPageWithResurfacing = FeedPage & { resurfacedItems?: FeedPage["items"] };

/**
 * Runs one feed read exactly as the API route does: the preferences lookup
 * (when personalization is on), the page, and the optional stale-resurfacing
 * strip, all on the repository set the caller has already bound to one tenant
 * transaction.
 */
export async function loadFeedPage(
  repositories: Pick<RepositorySet, "feed" | "digestExperience">,
  data: FeedQueryParams,
  options: { personalization: boolean }
): Promise<FeedPageWithResurfacing> {
  const preferences = options.personalization
    ? await repositories.digestExperience.getPreferences()
    : undefined;
  const page = await repositories.feed.list(
    feedListQuery(data, Boolean(options.personalization && preferences?.personalizationEnabled))
  );
  if (data.resurface !== "stale") return page;
  const resurfaced = await repositories.feed.list({
    read: false,
    archive: "exclude",
    sort: "recent",
    limit: 3,
    resurface: "stale",
    personalizationEnabled: false,
  });
  return { ...page, resurfacedItems: resurfaced.items };
}

/**
 * The client island's view of the URL: every filter the feed page exposes,
 * derived from the same search parameters the server rendered for.
 */
export interface FeedFilterState {
  searchQuery: string;
  sources: SourceType[];
  contentTypes: ContentType[];
  priorities: Priority[];
  topics: string[];
  collections: string[];
  archive: FeedArchiveFilter;
  sort: FeedSort;
  /** Calendar dates (`YYYY-MM-DD`) for the date inputs. */
  dateFrom: string;
  dateTo: string;
  showRead: boolean;
  cursor?: string;
}

export function feedFilterState(input: FeedSearchInput): FeedFilterState {
  const params = toSearchParams(input);
  const read = params.get("read");
  return {
    searchQuery: params.get("q") ?? "",
    sources: multiValue(params, "source") as SourceType[],
    contentTypes: multiValue(params, "contentType") as ContentType[],
    priorities: multiValue(params, "priority") as Priority[],
    topics: multiValue(params, "topic"),
    collections: multiValue(params, "collection"),
    archive: (params.get("archive") as FeedArchiveFilter) || "exclude",
    sort: (params.get("sort") as FeedSort) || "for_you",
    dateFrom: (params.get("dateFrom") ?? "").slice(0, 10),
    dateTo: (params.get("dateTo") ?? "").slice(0, 10),
    showRead: read ? read === "true" : params.get("showRead") === "true",
    cursor: params.get("cursor") ?? undefined,
  };
}

/** The `/api/v1/feed` query string the island uses for a filter state (page size 100). */
export function feedRequestSearch(state: FeedFilterState, cursor?: string): URLSearchParams {
  const query = new URLSearchParams();
  query.set("archive", state.archive);
  query.set("sort", state.sort);
  query.set("limit", "100");
  if (!state.showRead) query.set("read", "false");
  state.topics.forEach((topic) => query.append("topic", topic));
  state.sources.forEach((source) => query.append("source", source));
  state.contentTypes.forEach((type) => query.append("contentType", type));
  state.priorities.forEach((priority) => query.append("priority", priority));
  state.collections.forEach((collection) => query.append("collection", collection));
  if (state.dateFrom) query.set("dateFrom", dateQueryValue(state.dateFrom));
  if (state.dateTo) query.set("dateTo", dateQueryValue(state.dateTo, true));
  if (cursor) query.set("cursor", cursor);
  return query;
}

/** Stable identity of a filter state, used to match server data to the URL. */
export function feedFilterKey(state: FeedFilterState): string {
  if (state.searchQuery) return `q=${state.searchQuery}`;
  return feedRequestSearch(state, state.cursor).toString();
}

export function dateQueryValue(value: string, end = false): string {
  return value ? `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : "";
}
