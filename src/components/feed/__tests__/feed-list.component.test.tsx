/**
 * @jest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FeedList } from "../feed-list";
import type { ContentItem, ContentType, Priority, SourceType } from "@/lib/types";

let mockSearch = "";
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/components/feed/content-card", () => ({
  ContentCard: ({
    item,
    compact,
    filter,
    onMarkRead,
  }: {
    item: ContentItem;
    compact: boolean;
    filter: string;
    onMarkRead: (id: string, read: boolean) => void;
  }) => (
    <article
      data-testid={`item-${item.id}`}
      data-compact={String(compact)}
      data-filter={filter}
      data-read={String(item.isRead)}
    >
      <span>{item.title}</span>
      <button type="button" onClick={() => onMarkRead(item.id, true)}>
        Mark {item.title} read
      </button>
    </article>
  ),
}));

jest.mock("@/components/feed/feed-filters", () => ({
  FeedFilters: ({
    viewMode,
    onViewModeChange,
    selectedSources,
    onSourcesChange,
    selectedTypes,
    onTypesChange,
    selectedPriorities,
    onPrioritiesChange,
    showRead,
    onShowReadChange,
    onArchiveChange,
    onSortChange,
    onTopicsChange,
    onCollectionsChange,
    onDateFromChange,
    onDateToChange,
  }: {
    viewMode: "card" | "compact";
    onViewModeChange: (mode: "card" | "compact") => void;
    selectedSources: SourceType[];
    onSourcesChange: (sources: SourceType[]) => void;
    selectedTypes: ContentType[];
    onTypesChange: (types: ContentType[]) => void;
    selectedPriorities: Priority[];
    onPrioritiesChange: (priorities: Priority[]) => void;
    showRead: boolean;
    onShowReadChange: (showRead: boolean) => void;
    onArchiveChange: (archive: "exclude" | "only" | "include") => void;
    onSortChange: (sort: "for_you" | "recent" | "priority") => void;
    onTopicsChange: (topics: string[]) => void;
    onCollectionsChange: (collections: string[]) => void;
    onDateFromChange: (date: string) => void;
    onDateToChange: (date: string) => void;
  }) => (
    <div data-testid="filters">
      <output>
        {viewMode}|{selectedSources.join(",")}|{selectedTypes.join(",")}|
        {selectedPriorities.join(",")}|{String(showRead)}
      </output>
      <button type="button" onClick={() => onViewModeChange("compact")}>
        Compact view
      </button>
      <button type="button" onClick={() => onSourcesChange(["gmail"])}>
        Gmail only
      </button>
      <button type="button" onClick={() => onSourcesChange([])}>
        All sources
      </button>
      <button type="button" onClick={() => onTypesChange(["video"])}>
        Videos only
      </button>
      <button type="button" onClick={() => onTypesChange([])}>
        All types
      </button>
      <button type="button" onClick={() => onPrioritiesChange(["high"])}>
        High only
      </button>
      <button type="button" onClick={() => onPrioritiesChange([])}>
        All priorities
      </button>
      <button type="button" onClick={() => onShowReadChange(!showRead)}>
        Toggle read
      </button>
      <button type="button" onClick={() => onArchiveChange("include")}>
        Include archive
      </button>
      <button type="button" onClick={() => onSortChange("recent")}>
        Sort recent
      </button>
      <button type="button" onClick={() => onTopicsChange(["Testing"])}>
        Testing topic
      </button>
      <button type="button" onClick={() => onCollectionsChange(["collection-1"])}>
        Collection one
      </button>
      <button type="button" onClick={() => onDateFromChange("2026-01-01")}>
        From date
      </button>
      <button type="button" onClick={() => onDateToChange("2026-01-03")}>
        To date
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

describe("FeedList without a server page (client fetch)", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    cleanup();
    mockSearch = "";
    fetchMock = jest.mocked(global.fetch);
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
      "/api/v1/feed?archive=exclude&sort=for_you&limit=100&read=false"
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Unread article read" }));
    expect(screen.getByTestId("item-item-1")).toHaveAttribute("data-read", "true");
    expect(screen.getByText("Read video")).toBeInTheDocument();
  });

  it("turns every filter change into a scroll-preserving router.replace of the URL", async () => {
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
    expect(mockReplace).toHaveBeenLastCalledWith("/feed?source=gmail", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Videos only" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feed?contentType=video", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "High only" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feed?priority=high", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Toggle read" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feed?read=true", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "All sources" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/feed", { scroll: false });
    // The server renders the next page; the island itself refetches nothing.
    expect(feedFetches()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Compact view" }));
    expect(screen.getByTestId("item-manual")).toHaveAttribute("data-compact", "true");
  });

  it("initializes filters from the URL and sends them to the API when it must fetch", async () => {
    mockSearch = "source=gmail&contentType=video&priority=high&read=true&sort=recent";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ id: "read", isRead: true })]));
    render(<FeedList initialPage={null} />);
    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=recent&limit=100&source=gmail&contentType=video&priority=high"
    );
    expect(screen.getByTestId("item-read")).toHaveAttribute("data-filter", "all");
  });

  it("forwards a search query and shows read search results", async () => {
    mockSearch = "q=durable+queues";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ isRead: true })]));

    render(<FeedList initialPage={null} />);

    expect(screen.getByText('Search results for "durable queues"')).toBeInTheDocument();
    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/items?includeProcessing=true&q=durable+queues");
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
      if (url === "/api/v1/collections") {
        return Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue({ collections: [] }),
        } as unknown as Response);
      }
      return Promise.resolve(
        itemsResponse([makeItem({ processingStatus: "processing", title: "Processing item" })])
      );
    });
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");
    const { unmount } = render(<FeedList initialPage={null} />);
    await settleInitialFetch();
    expect(screen.getByText("Processing item")).toBeInTheDocument();
    const initialFeedCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/v1/feed?")
    ).length;

    await act(async () => {
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/items/status?ids=item-1");
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/v1/feed?")).length
    ).toBe(initialFeedCalls);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("shows an error card instead of crashing when the API rejects the request", async () => {
    fetchMock.mockResolvedValue(errorResponse("Sign in to load your feed."));

    render(<FeedList initialPage={null} />);
    await settleInitialFetch();

    expect(screen.getByRole("alert")).toHaveTextContent("Feed is unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Sign in to load your feed.");
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("falls back to an empty list when a successful response carries no items", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response);

    render(<FeedList initialPage={null} />);
    await settleInitialFetch();

    expect(screen.getByText("No items match your filters.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("FeedList with a server-rendered page", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    cleanup();
    mockSearch = "";
    fetchMock = jest.mocked(global.fetch);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the server page immediately and issues no feed or collections request", async () => {
    render(
      <FeedList
        initialPage={{
          key: "archive=exclude&sort=for_you&limit=100&read=false",
          items: [makeItem({ id: "server-1", title: "Server item" })],
          nextCursor: "cursor-2",
          collections: [{ id: "c1", name: "Reading list" }],
        }}
      />
    );
    expect(screen.getByText("Server item")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    await settleInitialFetch();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("ignores a server page rendered for different filters and fetches instead", async () => {
    mockSearch = "sort=recent";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ id: "fresh", title: "Fresh item" })]));
    render(
      <FeedList
        initialPage={{
          key: "archive=exclude&sort=for_you&limit=100&read=false",
          items: [makeItem({ id: "stale", title: "Stale item" })],
          collections: [],
        }}
      />
    );
    expect(screen.queryByText("Stale item")).not.toBeInTheDocument();
    expect(await screen.findByText("Fresh item")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=recent&limit=100&read=false"
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
          collections: [],
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second page")).toBeInTheDocument();
    expect(screen.getByText("First page")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feed?archive=exclude&sort=for_you&limit=100&read=false&cursor=cursor-2"
    );
  });
});
