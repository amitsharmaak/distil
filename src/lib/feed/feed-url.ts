import type { FeedArchiveFilter, FeedSort } from "@/lib/feed/feed-query";
import {
  LIFE_AREAS,
  type ContentType,
  type LifeArea,
  type Priority,
  type SourceType,
} from "@/lib/types";

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

/** Minimum search length the feed API accepts (`q` is 2–200 characters). */
export const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_LENGTH = 200;

/** The `q` value typed text becomes: trimmed, or "" while it is too short to send. */
export function normalizeSearchQuery(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= MIN_SEARCH_LENGTH ? trimmed.slice(0, MAX_SEARCH_LENGTH) : "";
}

/**
 * The client island's view of the URL: every filter the feed page exposes,
 * derived from the same search parameters the server rendered for.
 */
export interface FeedFilterState {
  /** Trimmed `q`, or "" when it is shorter than the API's two-character minimum. */
  searchQuery: string;
  sources: SourceType[];
  contentTypes: ContentType[];
  priorities: Priority[];
  topics: string[];
  /** URL hosts (`site`), e.g. `x.com`. */
  sites: string[];
  /** Effective life areas (`area`); empty means every area. */
  areas: LifeArea[];
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
  const searchQuery = normalizeSearchQuery(params.get("q") ?? "");
  const requestedSort = params.get("sort") as FeedSort | null;
  // A search is ordered by relevance unless a sort was chosen; relevance needs a search.
  const sort: FeedSort =
    requestedSort === "relevance" && !searchQuery
      ? "for_you"
      : requestedSort || (searchQuery ? "relevance" : "for_you");
  return {
    searchQuery,
    sources: multiValue(params, "source") as SourceType[],
    contentTypes: multiValue(params, "contentType") as ContentType[],
    priorities: multiValue(params, "priority") as Priority[],
    topics: multiValue(params, "topic"),
    sites: multiValue(params, "site").map((site) => site.toLowerCase()),
    areas: multiValue(params, "area").filter((area): area is LifeArea =>
      (LIFE_AREAS as readonly string[]).includes(area)
    ),
    archive: (params.get("archive") as FeedArchiveFilter) || "exclude",
    sort,
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
  if (state.searchQuery) query.set("q", state.searchQuery);
  if (!state.showRead) query.set("read", "false");
  state.topics.forEach((topic) => query.append("topic", topic));
  state.sources.forEach((source) => query.append("source", source));
  state.contentTypes.forEach((type) => query.append("contentType", type));
  state.priorities.forEach((priority) => query.append("priority", priority));
  state.sites.forEach((site) => query.append("site", site));
  state.areas.forEach((area) => query.append("area", area));
  if (state.dateFrom) query.set("dateFrom", dateQueryValue(state.dateFrom));
  if (state.dateTo) query.set("dateTo", dateQueryValue(state.dateTo, true));
  if (cursor) query.set("cursor", cursor);
  return query;
}

/** Stable identity of a filter state, used to match server data to the URL. */
export function feedFilterKey(state: FeedFilterState): string {
  return feedRequestSearch(state, state.cursor).toString();
}

export function dateQueryValue(value: string, end = false): string {
  return value ? `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : "";
}
