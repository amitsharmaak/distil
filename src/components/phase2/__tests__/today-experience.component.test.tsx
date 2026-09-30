/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen } from "@testing-library/react";

import { TodayExperience, type TodayInitial } from "../today-experience";
import type { FeedItem } from "@/lib/feed/feed-query";
import { todayFilterState, todayView } from "@/lib/feed/today-selection";

let mockSearch = "";
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/feed",
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
}));

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
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
    rank: {
      sort: "priority",
      score: 100,
      reasons: ["Manual priority: high"],
      components: { itemPriority: "high" },
    },
    ...overrides,
  };
}

function response(
  items: FeedItem[],
  resurfacedItems: FeedItem[] = [],
  nextCursor?: string
): Response {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ items, resurfacedItems, nextCursor }),
  } as unknown as Response;
}

/** What the server page would hand over for the current `mockSearch`. */
function serverInitial(page: {
  items?: FeedItem[];
  resurfacedItems?: FeedItem[];
  nextCursor?: string;
}): TodayInitial {
  return todayView(todayFilterState(new URLSearchParams(mockSearch)), page);
}

function feedCalls(): string[] {
  return jest
    .mocked(global.fetch)
    .mock.calls.map(([url]) => String(url))
    .filter((url) => url.startsWith("/api/v1/feed"));
}

beforeEach(() => {
  mockSearch = "";
  mockReplace.mockReset();
  jest.mocked(global.fetch).mockClear();
});

describe("TodayExperience", () => {
  it("renders real priority and eligible revisit items from the versioned feed", async () => {
    const stale = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    jest.mocked(global.fetch).mockResolvedValue(
      response(
        [item()],
        [
          item({
            id: "stale",
            title: "Worth revisiting",
            lastOpenedAt: stale,
            rank: {
              sort: "recent",
              score: 1,
              reasons: ["Chronological order"],
              components: { itemPriority: "high" },
            },
          }),
        ]
      )
    );

    render(<TodayExperience />);

    expect(await screen.findByText("Important reading")).toBeInTheDocument();
    expect(screen.getByText("Worth revisiting")).toBeInTheDocument();
    expect(feedCalls()).toEqual(["/api/v1/feed?sort=priority&read=false&limit=6&resurface=stale"]);
  });

  it("renders Markdown summaries as plain text", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      response([
        item({
          aiSummary:
            "## Why it matters\n\n**Durable** capture beats [connectors](https://example.test).",
        }),
      ])
    );

    render(<TodayExperience />);

    expect(
      await screen.findByText("Why it matters Durable capture beats connectors.")
    ).toBeInTheDocument();
  });

  it("surfaces an API failure instead of silently showing fixtures", async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: { message: "PostgreSQL is required" } }),
    } as unknown as Response);
    render(<TodayExperience />);
    expect(await screen.findByRole("alert")).toHaveTextContent("PostgreSQL is required");
  });

  it("shows the default sections with the search and Filters, and no fetch, from server data", () => {
    render(<TodayExperience initial={serverInitial({ items: [item()] })} />);

    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Priority Reading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Worth Revisiting" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Unread matches" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Search everything →" })).not.toBeInTheDocument();
    expect(feedCalls()).toEqual([]);
  });

  it("keeps the default sections when only a sort is in the URL", () => {
    mockSearch = "sort=recent";
    render(<TodayExperience initial={serverInitial({ items: [item()] })} />);
    expect(screen.getByRole("heading", { name: "Priority Reading" })).toBeInTheDocument();
    expect(feedCalls()).toEqual([]);
  });

  it("replaces the sections with one results list for a search, an area or a filter", () => {
    mockSearch = "q=durable&area=work&contentType=video";
    render(
      <TodayExperience
        initial={serverInitial({
          items: [item({ id: "hit", title: "Durable queues" })],
          nextCursor: "more",
        })}
      />
    );

    expect(screen.getByRole("heading", { name: "Unread matches" })).toBeInTheDocument();
    expect(screen.getByText("Durable queues")).toBeInTheDocument();
    expect(screen.getByText("First 1")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Priority Reading" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Worth Revisiting" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter: Work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter: Videos" })).toBeInTheDocument();
    expect(feedCalls()).toEqual([]);
  });

  it("links “Search everything →” to the Feed with the same parameters, read items included", () => {
    mockSearch = "q=durable&area=work&site=x.com&read=false&archive=only&sort=recent";
    render(<TodayExperience initial={serverInitial({ items: [item()] })} />);

    const href = screen.getByRole("link", { name: "Search everything →" }).getAttribute("href")!;
    const [path, query] = href.split("?");
    expect(path).toBe("/feed");
    const params = new URLSearchParams(query);
    expect(params.get("q")).toBe("durable");
    expect(params.getAll("area")).toEqual(["work"]);
    expect(params.getAll("site")).toEqual(["x.com"]);
    expect(params.get("sort")).toBe("recent");
    expect(params.get("read")).toBe("true");
    expect(params.has("archive")).toBe(false);
  });

  it("shows an empty-result state that still offers the wider search", () => {
    mockSearch = "q=nothing&priority=high";
    render(<TodayExperience initial={serverInitial({ items: [] })} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Nothing unread matches “nothing” with these filters."
    );
    expect(screen.getByRole("link", { name: "Search everything →" })).toHaveAttribute(
      "href",
      "/feed?q=nothing&priority=high&read=true"
    );
  });

  it("shows a filter-only empty state without a search", () => {
    mockSearch = "area=personal";
    render(<TodayExperience initial={serverInitial({ items: [] })} />);
    expect(screen.getByRole("status")).toHaveTextContent("No unread items match these filters.");
  });

  it("fetches the unread results itself when the server did not render this view", async () => {
    mockSearch = "q=durable&read=true&archive=include";
    jest.mocked(global.fetch).mockResolvedValue(response([item({ title: "Durable queues" })]));

    render(<TodayExperience />);

    expect(await screen.findByText("Durable queues")).toBeInTheDocument();
    expect(feedCalls()).toEqual([
      "/api/v1/feed?archive=exclude&sort=relevance&limit=20&q=durable&read=false",
    ]);
  });

  it("narrows what is on screen while typing, then commits the search to Today's URL", () => {
    jest.useFakeTimers();
    try {
      render(
        <TodayExperience
          initial={serverInitial({
            items: [item(), item({ id: "other", title: "Gardening notes" })],
          })}
        />
      );
      fireEvent.change(screen.getByRole("searchbox", { name: "Search your items" }), {
        target: { value: "garden" },
      });

      expect(screen.getByRole("heading", { name: "Unread matches" })).toBeInTheDocument();
      expect(screen.getByText("Gardening notes")).toBeInTheDocument();
      expect(screen.queryByText("Important reading")).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(250);
      });
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/?q=garden", { scroll: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it("clears every filter back to the plain Today URL", () => {
    mockSearch = "q=durable&area=work";
    render(<TodayExperience initial={serverInitial({ items: [] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/", { scroll: false });
  });
});
