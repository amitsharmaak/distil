/**
 * @jest-environment jsdom
 */

import type { ReactNode } from "react";

import { FeedList } from "@/components/feed/feed-list";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";
import type { FeedItem } from "@/lib/feed/feed-query";
import { feedFilterKey, feedFilterState } from "@/lib/feed/feed-url";
import { todayFilterState, todayView } from "@/lib/feed/today-selection";

import { TodayExperience } from "../today-experience";
import {
  CLIENT_CLOCK,
  SERVER_CLOCK,
  serverRenderThenHydrate,
  type HydrationResult,
} from "../../../../tests/support/hydration";

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <ContentCacheProvider accountKey="hydration-test-account">
      <ShortcutsProvider>{children}</ShortcutsProvider>
    </ContentCacheProvider>
  );
}

const item: FeedItem = {
  id: "story-1",
  title: "A server-rendered story",
  summary: "A useful summary",
  sourceType: "manual",
  contentType: "article",
  topics: [],
  url: "https://example.test/story",
  priority: "high",
  isRead: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  processingStatus: "ready",
  rank: {
    sort: "priority",
    score: 100,
    reasons: ["Manual priority: high"],
    components: { itemPriority: "high" },
  },
};
/** When the server read the page: the value Today and Feed seed their cache with. */
const SERVER_READ_AT = Date.UTC(2026, 9, 2, 12, 45);

let result: HydrationResult | undefined;
afterEach(() => {
  result?.unmount();
  result = undefined;
});

/**
 * Today and Feed are server-rendered with data, so they render "Updated <time>" on the server.
 * The server formats in its own timezone and the browser in the reader's. A mismatch there
 * makes React throw the server HTML away and re-create the root, which also wipes the theme
 * class set on <html> before hydration.
 */
describe("server-rendered surfaces hydrate without a mismatch across timezones", () => {
  it("Today", async () => {
    const params = new URLSearchParams("");
    const initial = todayView(todayFilterState(params), { items: [item] });
    result = await serverRenderThenHydrate(
      <Providers>
        <TodayExperience initial={initial} initialDataUpdatedAt={SERVER_READ_AT} />
      </Providers>
    );

    expect(result.serverHtml).toContain("A server-rendered story");
    expect(result.recoverableErrors).toEqual([]);
    expect(result.serverHtml).not.toContain(SERVER_CLOCK);
    expect(result.recoverableErrors).toEqual([]);
    // After hydration the reader sees the time in their own timezone.
    expect(result.container).toHaveTextContent(`Updated ${CLIENT_CLOCK}`);
  });

  it("Feed", async () => {
    const state = feedFilterState(new URLSearchParams(""));
    result = await serverRenderThenHydrate(
      <Providers>
        <FeedList
          initialPage={{ key: feedFilterKey(state), items: [item], nextCursor: undefined }}
          initialDataUpdatedAt={SERVER_READ_AT}
        />
      </Providers>
    );

    expect(result.serverHtml).toContain("A server-rendered story");
    expect(result.recoverableErrors).toEqual([]);
    expect(result.serverHtml).not.toContain(SERVER_CLOCK);
    expect(result.recoverableErrors).toEqual([]);
    expect(result.container).toHaveTextContent(`Updated ${CLIENT_CLOCK}`);
  });
});
