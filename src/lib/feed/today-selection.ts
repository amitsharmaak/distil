import type { FeedItem } from "@/lib/feed/feed-query";
import type { KnowledgeItem } from "@/components/phase2/types";
import {
  feedFilterState,
  feedRequestSearch,
  toSearchParams,
  type FeedFilterState,
  type FeedSearchInput,
} from "@/lib/feed/feed-url";
import { hasActiveFilters } from "@/lib/feed/quick-filters";

/**
 * Today's selection is one feed read: the six highest-priority unread items,
 * plus the stale-resurfacing strip. Server (page) and client (fallback) ask
 * for exactly this; the mapping to the presentation shape lives here so both
 * render identically. Client-safe: no zod or other server-only imports.
 */
export const TODAY_FEED_QUERY = {
  sort: "priority",
  read: "false",
  limit: "6",
  resurface: "stale",
} as const;

export const REVISIT_REASON = "Unopened for two weeks · worth another look";

function sourceName(item: FeedItem): string {
  return item.publication || item.author || item.sourceType;
}

export function toKnowledgeItem(item: FeedItem): KnowledgeItem {
  return {
    id: item.id,
    title: item.title || "Untitled",
    // Raw Markdown/HTML; the card renders it as a digest (lead + key points).
    summary: item.aiSummary || item.summary || "",
    source: sourceName(item),
    href: `/feed/${item.id}`,
    isRead: item.isRead,
    reason: item.rank.reasons[0] || "Saved for your reading queue",
  };
}

export interface TodaySections {
  priority: KnowledgeItem[];
  revisiting: KnowledgeItem[];
}

export function todaySections(page: {
  items?: FeedItem[];
  resurfacedItems?: FeedItem[];
}): TodaySections {
  return {
    priority: (page.items ?? []).map(toKnowledgeItem),
    revisiting: (page.resurfacedItems ?? []).map((item) => ({
      ...toKnowledgeItem(item),
      reason: REVISIT_REASON,
    })),
  };
}

/*
 * Filtered Today (inline search F5). A search, an area or any other filter in
 * the URL replaces the two sections with one results list drawn from the
 * unread queue (active, unread items only), plus a link that runs the same
 * search across everything on the Feed. With none of them, Today is the
 * fixed selection above.
 */

/** How many unread matches Today shows before pointing to the Feed. */
export const TODAY_RESULTS_LIMIT = 20;

/**
 * The URL's filters as Today applies them: always unread and not archived
 * (Today's scope is the unread queue, so `read`/`showRead`/`archive` are
 * ignored), never paged, and ordered by priority like the default view unless
 * a sort was chosen or a search is ordering by relevance.
 */
export function todayFilterState(input: FeedSearchInput): FeedFilterState {
  const state = feedFilterState(input);
  const sortChosen = Boolean(toSearchParams(input).get("sort"));
  return {
    ...state,
    showRead: false,
    archive: "exclude",
    cursor: undefined,
    sort: sortChosen || state.searchQuery ? state.sort : "priority",
  };
}

/** True when Today shows the results list instead of its sections; sort alone does not count. */
export function isTodayFiltered(state: FeedFilterState): boolean {
  return hasActiveFilters(state);
}

/** The feed query for Today's results list. */
export function todayResultsSearch(state: FeedFilterState): URLSearchParams {
  const query = feedRequestSearch(state);
  query.set("limit", String(TODAY_RESULTS_LIMIT));
  return query;
}

/** Identity of what Today shows for a URL, used to match server data to it. */
export function todayViewKey(state: FeedFilterState): string {
  return isTodayFiltered(state) ? todayResultsSearch(state).toString() : "sections";
}

/**
 * "Search everything →": the same parameters on the Feed, minus the ones
 * Today ignores, plus `read=true` so read items are searched as well. Archived
 * items stay out, as on the Feed by default.
 */
export function todaySearchEverythingHref(input: FeedSearchInput): string {
  const params = new URLSearchParams(toSearchParams(input));
  for (const name of ["read", "showRead", "archive", "cursor"]) params.delete(name);
  params.set("read", "true");
  return `/feed?${params.toString()}`;
}

/** Topics of the items on screen, for the Filters sheet's Topic group. */
export function topicOptions(items: Array<{ topics?: string[] }>): string[] {
  return Array.from(new Set(items.flatMap((item) => item.topics ?? []))).sort();
}

export type TodayView =
  | { key: string; mode: "sections"; sections: TodaySections; topics: string[] }
  | {
      key: string;
      mode: "results";
      results: KnowledgeItem[];
      /** More unread matches exist than the list shows. */
      hasMore: boolean;
      topics: string[];
    };

/** Maps one feed read to what Today shows for `state`. */
export function todayView(
  state: FeedFilterState,
  page: { items?: FeedItem[]; resurfacedItems?: FeedItem[]; nextCursor?: string }
): TodayView {
  const key = todayViewKey(state);
  if (!isTodayFiltered(state)) {
    return {
      key,
      mode: "sections",
      sections: todaySections(page),
      topics: topicOptions([...(page.items ?? []), ...(page.resurfacedItems ?? [])]),
    };
  }
  const items = (page.items ?? []).filter((item) => item.processingStatus !== "rejected");
  return {
    key,
    mode: "results",
    results: items.map(toKnowledgeItem),
    hasMore: Boolean(page.nextCursor),
    topics: topicOptions(items),
  };
}
