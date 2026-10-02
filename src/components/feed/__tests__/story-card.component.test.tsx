/** @jest-environment jsdom */

import { renderWithContentCache as render } from "../../../../tests/support/content-cache";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { StoryCard } from "../story-card";
import type { ContentItem } from "@/lib/types";
import type { KnowledgeItem } from "@/components/phase2/types";

const mockPrefetch = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), prefetch: mockPrefetch }),
}));

beforeEach(() => {
  mockPrefetch.mockClear();
  jest.mocked(global.fetch).mockReset();
});

const item: ContentItem = {
  id: "story-1",
  title: "A resilient system | Example",
  url: "https://example.com/story",
  publication: "Example",
  sourceType: "browser-extension",
  contentType: "article",
  summary: "Raw capture excerpt.",
  aiSummary:
    "## TL;DR\n\nA readable lead sentence. Another sentence.\n\n## Key Points\n- First insight.\n- Second insight.\n- Third insight.\n- Fourth insight.",
  readingMinutes: 6,
  priority: "medium",
  topics: [],
  isRead: false,
  area: "work",
  createdAt: "2026-10-01T00:00:00.000Z",
  thumbnailUrl: "https://example.com/image.jpg",
};

it("shows publisher, clean title and lead with reading time and a quiet area control", () => {
  const { container } = render(<StoryCard item={item} />);
  expect(screen.getByText("Example")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /A resilient system/ })).toBeInTheDocument();
  expect(screen.getByText("A readable lead sentence.")).toBeInTheDocument();
  expect(screen.getByText("6 min read")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Area: Work. Change area" })).toBeInTheDocument();
  expect(screen.queryByText(/TL;DR|Key Points|Extension|medium|First insight/)).toBeNull();
  expect(screen.getByRole("img", { name: "Unread" })).toBeInTheDocument();
  expect(container.querySelector("a button")).toBeNull();
});

it("renders only the lead card's first three points", () => {
  render(<StoryCard item={{ ...item, priority: "high" }} variant="lead" />);
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("Third insight.")).toBeInTheDocument();
  expect(screen.queryByText("Fourth insight.")).not.toBeInTheDocument();
  expect(screen.getByText("High priority")).toBeInTheDocument();
});

it("keeps thumbnail, publisher, title and area in compact mode, without an excerpt", () => {
  const { container } = render(<StoryCard item={item} variant="compact" filter="unread" />);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/feed/story-1?filter=unread");
  expect(screen.queryByText("A readable lead sentence.")).not.toBeInTheDocument();
  expect(screen.getByText("Example")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Change area/ })).toBeInTheDocument();
  expect(container.querySelector("img")).toHaveAttribute("src", item.thumbnailUrl);
});

it("uses private lazy image requests in reserved geometry and hides failed imagery", () => {
  const { container } = render(<StoryCard item={item} />);
  const image = container.querySelector("img")!;
  expect(image).toHaveAttribute("loading", "lazy");
  expect(image).toHaveAttribute("decoding", "async");
  expect(image).toHaveAttribute("referrerPolicy", "no-referrer");
  expect(image.parentElement?.className).toContain("aspect-");
  fireEvent.error(image);
  expect(image).toHaveStyle({ visibility: "hidden" });
  expect(image.parentElement).toBeInTheDocument();
});

it("supports knowledge items and text-only stories with the same row contract", () => {
  const knowledge: KnowledgeItem = {
    id: "knowledge-1",
    title: "Saved essay",
    summary: "A useful perspective.",
    source: "Manual",
    url: "https://journal.example/essay",
    href: "/feed/knowledge-1",
    reason: "",
    isRead: true,
  };
  const { container } = render(<StoryCard item={knowledge} />);
  expect(container.querySelectorAll("[data-row][data-item-id]")).toHaveLength(1);
  expect(screen.getByRole("link")).toHaveAttribute("href", knowledge.href);
  expect(screen.getByText("journal.example")).toBeInTheDocument();
  expect(screen.queryByText("Manual")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Unread" })).not.toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
});

it("keeps processing items non-navigable and rejected items out of the list", () => {
  const { rerender, container } = render(
    <StoryCard item={{ ...item, processingStatus: "processing" as const }} />
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText("Analyzing…")).toBeInTheDocument();
  rerender(<StoryCard item={{ ...item, processingStatus: "rejected" as const }} />);
  expect(container.querySelector("[data-row]")).toBeNull();
});

it("does not prefetch on render and warms the reader route only after intent", () => {
  render(<StoryCard item={{ ...item, id: "story-intent" }} filter="unread" />);
  const link = screen.getByRole("link");
  // Viewport prefetch is off: a list of cards must not fan out route requests.
  expect(mockPrefetch).not.toHaveBeenCalled();
  fireEvent.focus(link);
  expect(mockPrefetch).toHaveBeenCalledTimes(1);
  expect(mockPrefetch).toHaveBeenCalledWith("/feed/story-intent?filter=unread");
});

it("marks a story read through the shared item mutation", async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);
  const onMarkRead = jest.fn();
  render(<StoryCard item={{ ...item, id: "story-2" }} onMarkRead={onMarkRead} />);

  fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));

  expect(onMarkRead).toHaveBeenCalledWith("story-2", true);
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/items/story-2/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    })
  );
});
