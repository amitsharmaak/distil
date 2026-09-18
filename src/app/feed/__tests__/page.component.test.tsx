/**
 * @jest-environment node
 */

import type { ReactElement } from "react";

const loadPageData = jest.fn();
jest.mock("@/lib/server-render/page-data", () => ({
  loadPageData: (...args: unknown[]) => loadPageData(...args),
}));
jest.mock("@/lib/phase2/feature-flags", () => ({
  readPhase2FeatureFlags: () => ({ personalization: true, serverRender: true }),
}));
jest.mock("@/components/feed/feed-list", () => ({
  FeedList: (props: unknown) => ({ type: "FeedList", props }),
}));

import FeedPage from "../page";

type IslandElement = ReactElement<{ initialPage: unknown }>;

function fakeRepositories(items: Array<{ id: string; title: string }>) {
  return {
    feed: {
      list: jest.fn().mockResolvedValue({ items, nextCursor: "cursor-2" }),
    },
    digestExperience: {
      getPreferences: jest.fn().mockResolvedValue({ personalizationEnabled: true }),
    },
    collections: {
      list: jest.fn().mockResolvedValue([
        { id: "c1", name: "Reading list", createdAt: "", updatedAt: "" },
        { id: "c2", name: "Later", createdAt: "", updatedAt: "" },
      ]),
    },
  };
}

describe("server-rendered /feed page", () => {
  afterEach(() => jest.clearAllMocks());

  it("runs the feed and collection reads on one tenant repository set and hands them to the island", async () => {
    const repositories = fakeRepositories([{ id: "item-1", title: "First" }]);
    loadPageData.mockImplementation(async (_route: string, operation: (r: unknown) => unknown) =>
      operation(repositories)
    );

    const element = (await FeedPage({
      searchParams: Promise.resolve({ source: "gmail", priority: ["high", "low"] }),
    })) as IslandElement;

    expect(loadPageData).toHaveBeenCalledWith("/feed", expect.any(Function));
    expect(repositories.digestExperience.getPreferences).toHaveBeenCalledTimes(1);
    expect(repositories.feed.list).toHaveBeenCalledWith(
      expect.objectContaining({
        read: false,
        sources: ["gmail"],
        priorities: ["high", "low"],
        sort: "for_you",
        limit: 100,
        personalizationEnabled: true,
      })
    );
    expect(element.props.initialPage).toEqual({
      key: "archive=exclude&sort=for_you&limit=100&read=false&source=gmail&priority=high&priority=low",
      items: [{ id: "item-1", title: "First" }],
      nextCursor: "cursor-2",
      collections: [
        { id: "c1", name: "Reading list" },
        { id: "c2", name: "Later" },
      ],
    });
  });

  it("renders the island without data for search results and when no server data is available", async () => {
    loadPageData.mockResolvedValue(null);

    const search = (await FeedPage({
      searchParams: Promise.resolve({ q: "durable queues" }),
    })) as IslandElement;
    expect(search.props.initialPage).toBeNull();
    expect(loadPageData).not.toHaveBeenCalled();

    const fallback = (await FeedPage({ searchParams: Promise.resolve({}) })) as IslandElement;
    expect(fallback.props.initialPage).toBeNull();
    expect(loadPageData).toHaveBeenCalledTimes(1);
  });

  it("does not query for an invalid URL; the island reports the API's validation error", async () => {
    const invalid = (await FeedPage({
      searchParams: Promise.resolve({ sort: "sideways" }),
    })) as IslandElement;
    expect(invalid.props.initialPage).toBeNull();
    expect(loadPageData).not.toHaveBeenCalled();
  });
});
