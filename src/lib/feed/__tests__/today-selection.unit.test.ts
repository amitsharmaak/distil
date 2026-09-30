import type { FeedItem } from "@/lib/feed/feed-query";
import { filtersUrl } from "@/lib/feed/quick-filters";
import {
  TODAY_RESULTS_LIMIT,
  isTodayFiltered,
  todayFilterState,
  todayResultsSearch,
  todaySearchEverythingHref,
  todayView,
  todayViewKey,
  topicOptions,
} from "@/lib/feed/today-selection";

const state = (search: string) => todayFilterState(new URLSearchParams(search));

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "a",
    title: "A",
    summary: "",
    sourceType: "manual",
    contentType: "article",
    topics: [],
    url: "https://example.test",
    priority: "high",
    isRead: false,
    createdAt: "2026-09-07T00:00:00.000Z",
    processingStatus: "ready",
    rank: { sort: "priority", score: 1, reasons: [], components: {} },
    ...overrides,
  } as FeedItem;
}

describe("todayFilterState", () => {
  it("always scopes to unread, active items and ignores cursors", () => {
    const filters = state("read=true&showRead=true&archive=only&cursor=abc");
    expect(filters).toMatchObject({ showRead: false, archive: "exclude", cursor: undefined });
  });

  it("orders by priority unless a sort is chosen or a search orders by relevance", () => {
    expect(state("area=work").sort).toBe("priority");
    expect(state("area=work&sort=recent").sort).toBe("recent");
    expect(state("q=queues").sort).toBe("relevance");
    expect(state("q=queues&sort=for_you").sort).toBe("for_you");
  });
});

describe("isTodayFiltered", () => {
  it.each([
    ["", false],
    ["sort=recent", false],
    ["read=true&archive=include", false],
    ["q=a", false],
    ["q=queues", true],
    ["area=work", true],
    ["site=x.com", true],
    ["contentType=video", true],
    ["priority=high", true],
    ["topic=AI", true],
    ["collection=c1", true],
    ["source=gmail", true],
    ["dateFrom=2026-09-01T00:00:00.000Z", true],
  ])("%s → %s", (search, expected) => {
    expect(isTodayFiltered(state(search))).toBe(expected);
  });
});

describe("todayResultsSearch and todayViewKey", () => {
  it("asks the feed for unread, active matches, capped at the Today limit", () => {
    const query = todayResultsSearch(state("q=queues&area=work&read=true"));
    expect(query.toString()).toBe(
      `archive=exclude&sort=relevance&limit=${TODAY_RESULTS_LIMIT}&q=queues&read=false&area=work`
    );
  });

  it("keys the default view independently of Today-ignored parameters", () => {
    expect(todayViewKey(state(""))).toBe("sections");
    expect(todayViewKey(state("sort=recent&read=true"))).toBe("sections");
    expect(todayViewKey(state("area=work"))).toBe(
      todayResultsSearch(state("area=work")).toString()
    );
  });
});

describe("todaySearchEverythingHref", () => {
  it("keeps every parameter, drops Today-ignored ones and includes read items", () => {
    expect(
      todaySearchEverythingHref(
        new URLSearchParams("q=queues&area=work&site=x.com&read=false&archive=only&cursor=c")
      )
    ).toBe("/feed?q=queues&area=work&site=x.com&read=true");
  });

  it("accepts the server's searchParams record", () => {
    expect(todaySearchEverythingHref({ q: "queues", priority: ["high", "low"] })).toBe(
      "/feed?q=queues&priority=high&priority=low&read=true"
    );
  });
});

describe("todayView", () => {
  it("maps the default read to the two sections", () => {
    const view = todayView(state(""), {
      items: [item({ topics: ["b", "a"] })],
      resurfacedItems: [item({ id: "old", topics: ["a", "c"] })],
    });
    expect(view.mode).toBe("sections");
    expect(view.topics).toEqual(["a", "b", "c"]);
  });

  it("maps a filtered read to one results list without rejected items", () => {
    const view = todayView(state("q=queues"), {
      items: [item(), item({ id: "bad", processingStatus: "rejected" })],
      nextCursor: "more",
    });
    expect(view).toMatchObject({ mode: "results", hasMore: true });
    expect(view.mode === "results" && view.results.map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("topicOptions", () => {
  it("returns sorted unique topics", () => {
    expect(topicOptions([{ topics: ["b"] }, { topics: ["a", "b"] }, {}])).toEqual(["a", "b"]);
  });
});

describe("filtersUrl", () => {
  it("applies updates on the given page and drops cursors and orphaned relevance sort", () => {
    const current = new URLSearchParams("q=queues&sort=relevance&cursor=c&area=work");
    expect(filtersUrl("/", current, { q: undefined })).toBe("/?area=work");
    expect(filtersUrl("/", current, { area: undefined, q: undefined })).toBe("/");
    expect(filtersUrl("/feed", current, { site: ["x.com"] })).toBe(
      "/feed?q=queues&sort=relevance&area=work&site=x.com"
    );
  });
});
