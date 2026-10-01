/**
 * @jest-environment jsdom
 */

import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import {
  ShortcutsProvider,
  useRegisteredShortcuts,
} from "@/components/shortcuts/shortcuts-provider";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";
import { FeedList } from "../feed-list";
import type { ContentItem } from "@/lib/types";

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <ContentCacheProvider accountKey="feed-test-account">
      <ShortcutsProvider>{children}</ShortcutsProvider>
    </ContentCacheProvider>
  );
}

const render = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: TestProviders, ...options });
const press = (key: string) => fireEvent.keyDown(window, { key });

let mockSearch = "";
const mockReplace = jest.fn();
const mockHistoryReplace = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/feed",
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/components/feed/content-card", () => ({
  ContentCard: ({
    item,
    compact,
    filter,
    onMarkRead,
    areaOpen,
    onAreaOpenChange,
  }: {
    item: ContentItem;
    compact: boolean;
    filter: string;
    onMarkRead: (id: string, read: boolean) => void;
    areaOpen: boolean;
    onAreaOpenChange: (open: boolean) => void;
  }) => (
    <article
      data-row
      data-item-id={item.id}
      data-area-open={String(areaOpen)}
      data-testid={`item-${item.id}`}
      data-compact={String(compact)}
      data-filter={filter}
      data-read={String(item.isRead)}
    >
      <a href={`/feed/${item.id}`} onClick={(event) => event.preventDefault()}>
        {item.title}
      </a>
      <button type="button" onClick={() => onAreaOpenChange(!areaOpen)}>
        Area {item.title}
      </button>
      <button type="button" onClick={() => onMarkRead(item.id, true)}>
        Mark {item.title} read
      </button>
    </article>
  ),
}));

jest.mock("@/components/feed/feed-filters", () => ({
  FeedFilterSheet: ({
    filters,
    onChange,
    activeCount,
    viewMode,
    onViewModeChange,
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filters: { sources: string[]; contentTypes: string[]; priorities: string[]; showRead: boolean };
    onChange: (updates: Record<string, string | string[] | undefined>) => void;
    activeCount: number;
    viewMode: "card" | "compact";
    onViewModeChange: (mode: "card" | "compact") => void;
  }) => (
    <div data-testid="filters">
      <output data-testid="sheet-open">{String(open)}</output>
      <button type="button" onClick={() => onOpenChange(false)}>
        Close sheet
      </button>
      <output data-testid="sheet-state">
        {viewMode}|{filters.sources.join(",")}|{filters.contentTypes.join(",")}|
        {filters.priorities.join(",")}|{activeCount}
      </output>
      <button type="button" onClick={() => onViewModeChange("compact")}>
        Compact view
      </button>
      <button type="button" onClick={() => onChange({ source: ["gmail"] })}>
        Gmail only
      </button>
      <button type="button" onClick={() => onChange({ source: [] })}>
        All sources
      </button>
      <button type="button" onClick={() => onChange({ contentType: ["video"] })}>
        Videos only
      </button>
      <button type="button" onClick={() => onChange({ priority: ["high"] })}>
        High only
      </button>
      <button
        type="button"
        aria-pressed={!filters.showRead}
        onClick={() => onChange({ read: filters.showRead ? "false" : "true" })}
      >
        Unread only
      </button>
    </div>
  ),
}));

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    title: "Unread article",
    summary: "Summary",
    sourceType: "manual",
    contentType: "article",
    topics: ["Testing"],
    url: "https://example.test/article",
    priority: "high",
    isRead: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    processingStatus: "ready",
    ...overrides,
  };
}

function itemsResponse(items: ContentItem[]): Response {
  return { ok: true, json: jest.fn().mockResolvedValue({ items }) } as unknown as Response;
}

function errorResponse(message: string): Response {
  return {
    ok: false,
    status: 401,
    json: jest.fn().mockResolvedValue({ error: { message } }),
  } as unknown as Response;
}

async function settleInitialFetch() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function feedRequestCalls(fetchMock: jest.MockedFunction<typeof fetch>) {
  return fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/v1/feed?"));
}

describe("FeedList without a server page (client fetch)", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    cleanup();
    mockSearch = "";
    Object.defineProperty(window.history, "replaceState", {
      configurable: true,
      value: mockHistoryReplace,
    });
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("trusts server filtering, keeps the rejected guard, and marks an item read optimistically", async () => {
    fetchMock.mockResolvedValue(
      itemsResponse([
        makeItem(),
        makeItem({ id: "item-2", title: "Read video", isRead: true, contentType: "video" }),
        makeItem({ id: "item-3", title: "Rejected", processingStatus: "rejected" }),
      ])
    );

    render(<FeedList initialPage={null} />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(screen.getByText("Read video")).toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=for_you&limit=100&read=false",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Unread article read" }));
    await waitFor(() =>
      expect(screen.getByTestId("item-item-1")).toHaveAttribute("data-read", "true")
    );
    expect(screen.getByText("Read video")).toBeInTheDocument();
  });

  it("updates same-page filters through native history and fetches each cached view", async () => {
    fetchMock.mockResolvedValue(
      itemsResponse([
        makeItem({ id: "manual", title: "Manual high article" }),
        makeItem({ id: "read", title: "Read item", isRead: true }),
      ])
    );
    render(<FeedList initialPage={null} />);
    expect(await screen.findByText("Manual high article")).toBeInTheDocument();
    const feedFetches = () =>
      fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/v1/feed?")).length;
    expect(feedFetches()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Gmail only" }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(null, "", "/feed?source=gmail");
    fireEvent.click(screen.getByRole("button", { name: "Videos only" }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      null,
      "",
      "/feed?source=gmail&contentType=video"
    );
    fireEvent.click(screen.getByRole("button", { name: "High only" }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      null,
      "",
      "/feed?source=gmail&contentType=video&priority=high"
    );
    // The Unread quick filter lives in the Filters sheet and is on by default.
    const unread = screen.getByRole("button", { name: "Unread only" });
    expect(unread).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(unread);
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      null,
      "",
      "/feed?source=gmail&contentType=video&priority=high&read=true"
    );
    fireEvent.click(screen.getByRole("button", { name: "All sources" }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      null,
      "",
      "/feed?contentType=video&priority=high&read=true"
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(feedFetches()).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("button", { name: "Compact view" }));
    expect(screen.getByTestId("item-manual")).toHaveAttribute("data-compact", "true");
  });

  it("initializes filters from the URL and sends them to the API when it must fetch", async () => {
    mockSearch = "source=gmail&contentType=video&priority=high&read=true&sort=recent";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ id: "read", isRead: true })]));
    render(<FeedList initialPage={null} />);
    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=recent&limit=100&source=gmail&contentType=video&priority=high",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(screen.getByTestId("item-read")).toHaveAttribute("data-filter", "all");
  });

  it("sends a search through the feed API with every filter, ordered by relevance", async () => {
    mockSearch = "q=durable+queues&area=work&site=x.com";
    fetchMock.mockResolvedValue(itemsResponse([makeItem()]));

    render(<FeedList initialPage={null} />);

    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue(
      "durable queues"
    );
    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=relevance&limit=100&q=durable+queues&read=false&site=x.com&area=work",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/items"))).toBe(
      false
    );
  });

  it("narrows loaded items at once while typing, then commits the search to the URL", async () => {
    fetchMock.mockResolvedValue(
      itemsResponse([
        makeItem({ id: "a", title: "Durable queues in practice" }),
        makeItem({ id: "b", title: "Gardening notes" }),
      ])
    );
    render(<FeedList initialPage={null} />);
    expect(await screen.findByText("Gardening notes")).toBeInTheDocument();
    jest.useFakeTimers();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "durable" } });
    expect(screen.getByText("Durable queues in practice")).toBeInTheDocument();
    expect(screen.queryByText("Gardening notes")).not.toBeInTheDocument();
    expect(mockHistoryReplace).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(mockHistoryReplace).toHaveBeenCalledTimes(1);
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(null, "", "/feed?q=durable");
  });

  it("initializes the read filter from the URL", async () => {
    mockSearch = "showRead=true";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ isRead: true })]));

    render(<FeedList initialPage={null} />);

    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(screen.getByTestId("item-item-1")).toHaveAttribute("data-filter", "all");
  });

  it.each([{ search: "" }, { search: "q=missing" }])(
    "settles a failed $search request into an error card rather than a misleading empty state",
    async ({ search }) => {
      mockSearch = search;
      fetchMock.mockRejectedValue(new Error("offline"));

      render(<FeedList initialPage={null} />);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Feed is unavailable");
      expect(alert).toHaveTextContent("offline");
      expect(screen.queryByText("No items match your filters.")).not.toBeInTheDocument();
    }
  );

  it("polls while an item is processing and stops its timer on unmount", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith("/api/v1/items/status")) {
        return Promise.resolve(
          itemsResponse([makeItem({ processingStatus: "ready", title: "Processing item" })])
        );
      }
      return Promise.resolve(
        itemsResponse([makeItem({ processingStatus: "processing", title: "Processing item" })])
      );
    });
    const { unmount } = render(
      <FeedList
        initialPage={{
          key: "archive=exclude&sort=for_you&limit=100&read=false",
          items: [makeItem({ processingStatus: "processing", title: "Processing item" })],
        }}
      />
    );
    expect(screen.getByText("Processing item")).toBeInTheDocument();
    const initialFeedCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/v1/feed?")
    ).length;

    await act(async () => {
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/items/status?ids=item-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/v1/feed?")).length
    ).toBe(initialFeedCalls + 1);
    const statusCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/v1/items/status")
    ).length;
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/v1/items/status"))
    ).toHaveLength(statusCalls);
  });

  it("expires the account cache when the API rejects the request as unauthorized", async () => {
    fetchMock.mockResolvedValue(errorResponse("Sign in to load your feed."));

    render(<FeedList initialPage={null} />);
    await settleInitialFetch();

    expect(screen.getByText("Your session changed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute(
      "href",
      "/sign-in"
    );
  });

  it("falls back to an empty list when a successful response carries no items", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response);

    render(<FeedList initialPage={null} />);
    expect(await screen.findByText("No items match your filters.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("drops a relevance sort when the search is cleared", async () => {
    mockSearch = "q=rust&sort=relevance&contentType=video";
    fetchMock.mockResolvedValue(itemsResponse([makeItem()]));
    render(<FeedList initialPage={null} />);
    await settleInitialFetch();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(null, "", "/feed?contentType=video");
  });
});

describe("FeedList with a server-rendered page", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    cleanup();
    mockSearch = "";
    Object.defineProperty(window.history, "replaceState", {
      configurable: true,
      value: mockHistoryReplace,
    });
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the server page immediately and issues no feed request", async () => {
    render(
      <FeedList
        initialPage={{
          key: "archive=exclude&sort=for_you&limit=100&read=false",
          items: [makeItem({ id: "server-1", title: "Server item" })],
          nextCursor: "cursor-2",
        }}
      />
    );
    expect(screen.getByText("Server item")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: ["Collec", "tions"].join("") })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    await settleInitialFetch();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });

  it("keeps a fresh fetched page in the account cache across a remount", async () => {
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ title: "Cached item" })]));
    const shell = (show: boolean) => (
      <ContentCacheProvider accountKey="persistent-feed-account">
        <ShortcutsProvider>{show ? <FeedList initialPage={null} /> : null}</ShortcutsProvider>
      </ContentCacheProvider>
    );
    const view = rtlRender(shell(true));

    expect(await screen.findByText("Cached item")).toBeInTheDocument();
    expect(feedRequestCalls(fetchMock)).toHaveLength(1);

    view.rerender(shell(false));
    view.rerender(shell(true));

    expect(screen.getByText("Cached item")).toBeInTheDocument();
    expect(feedRequestCalls(fetchMock)).toHaveLength(1);
  });

  it("retains and deduplicates later pages through refresh and remount", async () => {
    fetchMock
      .mockResolvedValueOnce(
        itemsResponse([
          makeItem({ id: "page-1", title: "First page" }),
          makeItem({ id: "page-2", title: "Second page" }),
        ])
      )
      .mockResolvedValueOnce(itemsResponse([makeItem({ id: "page-1", title: "First refreshed" })]));
    const initialPage = {
      key: "archive=exclude&sort=for_you&limit=100&read=false",
      items: [makeItem({ id: "page-1", title: "First page" })],
      nextCursor: "cursor-2",
    };
    const shell = (show: boolean) => (
      <ContentCacheProvider accountKey="paginated-feed-account">
        <ShortcutsProvider>
          {show ? <FeedList initialPage={initialPage} initialDataUpdatedAt={Date.now()} /> : null}
        </ShortcutsProvider>
      </ContentCacheProvider>
    );
    const view = rtlRender(shell(true));

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second page")).toBeInTheDocument();
    expect(screen.getAllByText("First page")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("First refreshed")).toBeInTheDocument();
    expect(screen.getByText("Second page")).toBeInTheDocument();

    view.rerender(shell(false));
    view.rerender(shell(true));
    expect(screen.getByText("First refreshed")).toBeInTheDocument();
    expect(screen.getByText("Second page")).toBeInTheDocument();
    expect(feedRequestCalls(fetchMock)).toHaveLength(2);
  });

  it("keeps stale server data visible when its background refresh fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(
      <FeedList
        initialPage={{
          key: "archive=exclude&sort=for_you&limit=100&read=false",
          items: [makeItem({ title: "Still readable" })],
        }}
        initialDataUpdatedAt={Date.now() - 120_001}
      />
    );

    expect(screen.getByText("Still readable")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not refresh Feed. Showing the last loaded items."
    );
    expect(screen.getByText("Still readable")).toBeInTheDocument();
  });

  it("selects filters optimistically and dims the current list until the URL commits", async () => {
    const initialPage = {
      key: "archive=exclude&sort=for_you&limit=100&read=false",
      items: [makeItem({ id: "server-1", title: "Server item" })],
    };
    fetchMock.mockResolvedValue(
      itemsResponse([makeItem({ id: "gmail", title: "Gmail item", sourceType: "gmail" })])
    );
    render(<FeedList initialPage={initialPage} />);
    const list = screen.getByTestId("item-server-1").parentElement;

    expect(screen.getByTestId("sheet-state")).toHaveTextContent("card||||0");
    expect(list).toHaveAttribute("aria-busy", "false");

    fireEvent.click(screen.getByRole("button", { name: "Gmail only" }));

    expect(mockHistoryReplace).toHaveBeenLastCalledWith(null, "", "/feed?source=gmail");
    expect(screen.getByTestId("sheet-state")).toHaveTextContent("card|gmail|||1");
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list).toHaveClass("opacity-60");

    expect(await screen.findByText("Gmail item")).toBeInTheDocument();
    expect(screen.getByTestId("item-gmail").parentElement).toHaveAttribute("aria-busy", "false");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=for_you&limit=100&read=false&source=gmail",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("releases an acknowledged filter target when browser history returns to the prior URL", async () => {
    const initialPage = {
      key: "archive=exclude&sort=for_you&limit=100&read=false",
      items: [makeItem({ id: "original", title: "Original page" })],
    };
    fetchMock.mockResolvedValue(
      itemsResponse([makeItem({ id: "gmail", title: "Gmail page", sourceType: "gmail" })])
    );
    const view = render(<FeedList initialPage={initialPage} initialDataUpdatedAt={Date.now()} />);

    fireEvent.click(screen.getByRole("button", { name: "Gmail only" }));
    expect(await screen.findByText("Gmail page")).toBeInTheDocument();

    mockSearch = "source=gmail";
    view.rerender(<FeedList initialPage={initialPage} initialDataUpdatedAt={Date.now()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mockSearch = "";
    view.rerender(<FeedList initialPage={initialPage} initialDataUpdatedAt={Date.now()} />);

    expect(screen.getByText("Original page")).toBeInTheDocument();
    expect(screen.queryByText("Gmail page")).not.toBeInTheDocument();
    expect(screen.getByTestId("sheet-state")).toHaveTextContent("card||||0");
    expect(feedRequestCalls(fetchMock)).toHaveLength(1);
  });

  it("ignores a server page rendered for different filters and fetches instead", async () => {
    mockSearch = "sort=recent";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ id: "fresh", title: "Fresh item" })]));
    render(
      <FeedList
        initialPage={{
          key: "archive=exclude&sort=for_you&limit=100&read=false",
          items: [makeItem({ id: "stale", title: "Stale item" })],
        }}
      />
    );
    expect(screen.queryByText("Stale item")).not.toBeInTheDocument();
    expect(await screen.findByText("Fresh item")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=recent&limit=100&read=false",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("loads the next page from the API and appends it to the server-rendered items", async () => {
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ id: "page-2", title: "Second page" })]));
    render(
      <FeedList
        initialPage={{
          key: "archive=exclude&sort=for_you&limit=100&read=false",
          items: [makeItem({ id: "page-1", title: "First page" })],
          nextCursor: "cursor-2",
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second page")).toBeInTheDocument();
    expect(screen.getByText("First page")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=for_you&limit=100&read=false&cursor=cursor-2",
      expect.objectContaining({ signal: expect.anything() })
    );
  });
});

describe("FeedList keyboard shortcuts", () => {
  const key = "archive=exclude&sort=for_you&limit=100&read=false";
  const page = (nextCursor?: string) => ({
    key,
    items: [
      makeItem({ id: "a", title: "Alpha" }),
      makeItem({ id: "b", title: "Bravo" }),
      makeItem({ id: "c", title: "Charlie" }),
    ],
    nextCursor,
  });

  beforeEach(() => {
    cleanup();
    mockSearch = "";
    Object.defineProperty(window.history, "replaceState", {
      configurable: true,
      value: mockHistoryReplace,
    });
    window.localStorage.clear();
    jest.mocked(global.fetch).mockReset();
  });
  afterEach(() => jest.clearAllMocks());

  it("j and k move focus through the row links; o opens the focused one", () => {
    render(<FeedList initialPage={page()} />);
    const link = (name: string) => screen.getByRole("link", { name });
    press("j");
    expect(link("Alpha")).toHaveFocus();
    press("j");
    expect(link("Bravo")).toHaveFocus();
    press("k");
    expect(link("Alpha")).toHaveFocus();
    const opened = jest.fn();
    link("Alpha").addEventListener("click", opened);
    press("o");
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("r marks the focused row read", async () => {
    jest
      .mocked(global.fetch)
      .mockImplementation((input) =>
        String(input).includes("/state")
          ? Promise.resolve({ ok: true, status: 200 } as Response)
          : Promise.resolve(
              itemsResponse(
                page().items.map((entry) => (entry.id === "b" ? { ...entry, isRead: true } : entry))
              )
            )
      );
    render(<FeedList initialPage={page()} />);
    press("j");
    press("j");
    press("r");
    await waitFor(() => expect(screen.getByTestId("item-b")).toHaveAttribute("data-read", "true"));
    expect(screen.getByTestId("item-a")).toHaveAttribute("data-read", "false");
  });

  it("r persists the read state with a PATCH", async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockImplementation((input) =>
      String(input).includes("/state")
        ? Promise.resolve({ ok: true, status: 200 } as Response)
        : Promise.resolve(itemsResponse(page().items))
    );
    render(<FeedList initialPage={page()} />);
    press("j");
    press("r");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/items/a/state",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isRead: true }) })
      )
    );
  });

  it("r reverts the row when the PATCH fails", async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<FeedList initialPage={page()} />);
    press("j");
    press("r");
    await waitFor(() => expect(screen.getByTestId("item-a")).toHaveAttribute("data-read", "false"));
  });

  it("does not act on r while a row's area menu is open", () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockClear();
    render(<FeedList initialPage={page()} />);
    press("j");
    fireEvent.click(screen.getByRole("button", { name: "Area Alpha" }));
    expect(screen.getByTestId("item-a")).toHaveAttribute("data-area-open", "true");
    press("r");
    expect(screen.getByTestId("item-a")).toHaveAttribute("data-read", "false");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/items/a", expect.anything());
  });

  it("a opens the area popover of the focused row only", () => {
    render(<FeedList initialPage={page()} />);
    press("j");
    press("a");
    expect(screen.getByTestId("item-a")).toHaveAttribute("data-area-open", "true");
    expect(screen.getByTestId("item-b")).toHaveAttribute("data-area-open", "false");
  });

  it("j on the last row clicks Load more", async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ id: "d", title: "Delta" })]));
    render(<FeedList initialPage={page("cursor-2")} />);
    press("j");
    press("j");
    press("j");
    press("j");
    expect(await screen.findByText("Delta")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("cursor=cursor-2"),
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it("f opens the Filters sheet", () => {
    render(<FeedList initialPage={page()} />);
    expect(screen.getByTestId("sheet-open")).toHaveTextContent("false");
    press("f");
    expect(screen.getByTestId("sheet-open")).toHaveTextContent("true");
  });

  it("u toggles read items through the URL and c toggles the layout", () => {
    render(<FeedList initialPage={page()} />);
    press("u");
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(null, "", "/feed?read=true");
    expect(screen.getByTestId("item-a")).toHaveAttribute("data-compact", "false");
    press("c");
    expect(screen.getByTestId("item-a")).toHaveAttribute("data-compact", "true");
    press("c");
    expect(screen.getByTestId("item-a")).toHaveAttribute("data-compact", "false");
  });

  it("lists the Lists group in the registry", () => {
    function Ids() {
      return (
        <output data-testid="ids">
          {useRegisteredShortcuts()
            .filter((def) => def.group === "Lists")
            .map((def) => def.id)
            .sort()
            .join(",")}
        </output>
      );
    }
    render(
      <>
        <Ids />
        <FeedList initialPage={page()} />
      </>
    );
    expect(screen.getByTestId("ids")).toHaveTextContent(
      "list.area,list.filters,list.markRead,list.next,list.open,list.prev,list.toggleLayout,list.toggleUnread"
    );
  });
});
