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

describe("server-rendered Today page", () => {
  afterEach(() => jest.clearAllMocks());

  it("runs Today's selection directly and renders the sections without a client fetch", async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({ items: [feedItem] })
      .mockResolvedValueOnce({ items: [{ ...feedItem, id: "stale-1", title: "Old but good" }] });
    loadPageData.mockImplementation(async (_route: string, operation: (r: unknown) => unknown) =>
      operation({ feed: { list }, digestExperience: { getPreferences: jest.fn() } })
    );

    const element = (await TodayPage()) as Element;

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
    });
  });

  it("renders the client-fetching component when no server data is available", async () => {
    loadPageData.mockResolvedValue(null);
    const element = (await TodayPage()) as Element;
    expect(element.props.initial).toBeNull();
  });
});
