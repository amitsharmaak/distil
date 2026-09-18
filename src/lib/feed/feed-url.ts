import type { FeedArchiveFilter, FeedSort } from "@/lib/feed/feed-query";
import type { ContentType, Priority, SourceType } from "@/lib/types";

/** `URLSearchParams` (island, API route) or Next's `searchParams` record (page). */
export type FeedSearchInput = URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * URL helpers shared by the server page and the client island. This module
 * is deliberately free of zod and every other server-only dependency: the
 * island imports it, so anything added here ships in the client bundle.
 */
export function toSearchParams(input: FeedSearchInput): URLSearchParams {
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
