/**
 * @jest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FeedPage from "../page";
import type { ContentItem, ContentType, Priority, SourceType } from "@/lib/types";

let mockSearch = "";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

jest.mock("@/lib/config", () => ({
  config: { apiBaseUrl: "https://distil.test" },
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
    onMarkRead: (id: string) => void;
  }) => (
    <article data-testid={`item-${item.id}`} data-compact={String(compact)} data-filter={filter}>
      <span>{item.title}</span>
      <button type="button" onClick={() => onMarkRead(item.id)}>
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
  return { json: jest.fn().mockResolvedValue({ items }) } as unknown as Response;
}

async function settleInitialFetch() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("FeedPage", () => {
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

  it("settles loading, hides read and rejected items, and marks an item read optimistically", async () => {
    fetchMock.mockResolvedValue(
      itemsResponse([
        makeItem(),
        makeItem({ id: "item-2", title: "Read video", isRead: true, contentType: "video" }),
        makeItem({ id: "item-3", title: "Rejected", processingStatus: "rejected" }),
      ])
    );

    render(<FeedPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(screen.queryByText("Read video")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/v1/feed?archive=exclude&sort=for_you&limit=100&read=false"
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Unread article read" }));
    expect(screen.queryByText("Unread article")).not.toBeInTheDocument();
    expect(screen.getByText("No items match your filters.")).toBeInTheDocument();
  });

  it("applies source, type, priority, read, and compact-view controls", async () => {
    fetchMock.mockResolvedValue(
      itemsResponse([
        makeItem({ id: "manual", title: "Manual high article" }),
        makeItem({
          id: "gmail-video",
          title: "Gmail high video",
          sourceType: "gmail",
          contentType: "video",
        }),
        makeItem({
          id: "gmail-low",
          title: "Gmail low video",
          sourceType: "gmail",
          contentType: "video",
          priority: "low",
        }),
        makeItem({ id: "read", title: "Read item", isRead: true }),
      ])
    );
    render(<FeedPage />);
    expect(await screen.findByText("Gmail high video")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gmail only" }));
    expect(screen.queryByText("Manual high article")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Videos only" }));
    fireEvent.click(screen.getByRole("button", { name: "High only" }));
    expect(screen.getByText("Gmail high video")).toBeInTheDocument();
    expect(screen.queryByText("Gmail low video")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All sources" }));
    fireEvent.click(screen.getByRole("button", { name: "All types" }));
    fireEvent.click(screen.getByRole("button", { name: "All priorities" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle read" }));
    expect(screen.getByText("Read item")).toBeInTheDocument();
    expect(screen.getByTestId("item-read")).toHaveAttribute("data-filter", "all");

    fireEvent.click(screen.getByRole("button", { name: "Compact view" }));
    expect(screen.getByTestId("item-manual")).toHaveAttribute("data-compact", "true");
  });

  it("forwards a search query and shows read search results", async () => {
    mockSearch = "q=durable+queues";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ isRead: true })]));

    render(<FeedPage />);

    expect(screen.getByText('Search results for "durable queues"')).toBeInTheDocument();
    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/items?includeProcessing=true&q=durable+queues"
    );
  });

  it("initializes the read filter from the URL", async () => {
    mockSearch = "showRead=true";
    fetchMock.mockResolvedValue(itemsResponse([makeItem({ isRead: true })]));

    render(<FeedPage />);

    expect(await screen.findByText("Unread article")).toBeInTheDocument();
    expect(screen.getByTestId("item-item-1")).toHaveAttribute("data-filter", "all");
  });

  it.each([
    { search: "", message: "No items match your filters." },
    { search: "q=missing", message: 'No results found for "missing"' },
  ])("settles a failed $search request into its empty state", async ({ search, message }) => {
    mockSearch = search;
    fetchMock.mockRejectedValue(new Error("offline"));

    render(<FeedPage />);

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("polls while an item is processing and stops its timer on unmount", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(
      itemsResponse([makeItem({ processingStatus: "processing", title: "Processing item" })])
    );
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");
    const { unmount } = render(<FeedPage />);
    await settleInitialFetch();
    expect(screen.getByText("Processing item")).toBeInTheDocument();
    const initialCalls = fetchMock.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(initialCalls + 1);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
