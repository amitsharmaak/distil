/**
 * @jest-environment node
 */

import type { ReactElement } from "react";

const loadPageData = jest.fn();
jest.mock("@/lib/server-render/page-data", () => ({
  loadPageData: (...args: unknown[]) => loadPageData(...args),
}));
jest.mock("@/lib/phase2/feature-flags", () => ({
  readPhase2FeatureFlags: () => ({ personalization: false, serverRender: true }),
}));
jest.mock("@/components/phase2/today-experience", () => ({
  TodayExperience: (props: unknown) => ({ type: "TodayExperience", props }),
}));

import TodayPage from "../page";

type Element = ReactElement<{ initial: unknown }>;

const feedItem = {
  id: "priority-1",
  title: "Important reading",
  summary: "A useful summary",
  sourceType: "manual",
  contentType: "article",
  topics: [],
  url: "https://example.test",
  priority: "high",
  isRead: false,
  createdAt: "2026-09-07T00:00:00.000Z",
  processingStatus: "ready",
  rank: { sort: "priority", score: 100, reasons: ["Manual priority: high"], components: {} },
};

function repositories(list: jest.Mock) {
  return {
    feed: { list },
    digestExperience: { getPreferences: jest.fn() },
  };
}

describe("server-rendered Today page", () => {
  afterEach(() => jest.clearAllMocks());

  it("runs Today's selection directly and renders the sections without a client fetch", async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({ items: [feedItem] })
      .mockResolvedValueOnce({ items: [{ ...feedItem, id: "stale-1", title: "Old but good" }] });
    loadPageData.mockImplementation(async (_route: string, operation: (r: unknown) => unknown) =>
      operation(repositories(list))
    );

    const element = (await TodayPage({ searchParams: Promise.resolve({}) })) as Element;

    expect(loadPageData).toHaveBeenCalledWith("/", expect.any(Function));
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sort: "priority",
        read: false,
        limit: 6,
        personalizationEnabled: false,
      })
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ resurface: "stale", limit: 3, sort: "recent", read: false })
    );
    expect(element.props.initial).toEqual({
      key: "sections",
      mode: "sections",
      topics: [],
      sections: {
        priority: [
          expect.objectContaining({
            id: "priority-1",
            title: "Important reading",
            href: "/feed/priority-1",
            reason: "Manual priority: high",
          }),
        ],
        revisiting: [
          expect.objectContaining({
            id: "stale-1",
            reason: "Unopened for two weeks · worth another look",
          }),
        ],
      },
    });
  });

  it("keeps the default selection for a sort alone and for Today-ignored read/archive parameters", async () => {
    const list = jest.fn().mockResolvedValue({ items: [] });
    loadPageData.mockImplementation(async (_route: string, operation: (r: unknown) => unknown) =>
      operation(repositories(list))
    );
    const element = (await TodayPage({
      searchParams: Promise.resolve({ sort: "sideways", read: "true", archive: "only" }),
    })) as Element;
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sort: "priority", read: false, limit: 6 })
    );
    expect(element.props.initial).toMatchObject({ mode: "sections", key: "sections" });
  });

  it("server-renders the unread results list for a search with filters", async () => {
    const list = jest.fn().mockResolvedValue({
      items: [{ ...feedItem, id: "hit", title: "Durable queues", topics: ["infra"] }],
      nextCursor: "more",
    });
    loadPageData.mockImplementation(async (_route: string, operation: (r: unknown) => unknown) =>
      operation(repositories(list))
    );

    const element = (await TodayPage({
      searchParams: Promise.resolve({
        q: " durable ",
        area: "work",
        contentType: "video",
        read: "true",
        archive: "include",
      }),
    })) as Element;

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "durable",
        areas: ["work"],
        contentTypes: ["video"],
        read: false,
        archive: "exclude",
        sort: "relevance",
        limit: 20,
      })
    );
    expect(element.props.initial).toEqual({
      key: "archive=exclude&sort=relevance&limit=20&q=durable&read=false&contentType=video&area=work",
      mode: "results",
      results: [expect.objectContaining({ id: "hit", href: "/feed/hit" })],
      hasMore: true,
      topics: ["infra"],
    });
  });

  it("orders a filter-only results list by priority", async () => {
    const list = jest.fn().mockResolvedValue({ items: [] });
    loadPageData.mockImplementation(async (_route: string, operation: (r: unknown) => unknown) =>
      operation(repositories(list))
    );
    const element = (await TodayPage({
      searchParams: Promise.resolve({ site: "x.com" }),
    })) as Element;
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ sites: ["x.com"], sort: "priority", read: false, limit: 20 })
    );
    expect(element.props.initial).toMatchObject({ mode: "results", results: [], hasMore: false });
  });

  it("renders the client-fetching component when no server data is available", async () => {
    loadPageData.mockResolvedValue(null);
    const element = (await TodayPage({ searchParams: Promise.resolve({}) })) as Element;
    expect(element.props.initial).toBeNull();
  });
});
