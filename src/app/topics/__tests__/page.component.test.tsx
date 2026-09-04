/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import TopicsPage from "../page";
import type { ContentItem } from "@/lib/types";

jest.mock("@/lib/config", () => ({
  config: { apiBaseUrl: "https://distil.test" },
}));

jest.mock("@/components/feed/content-card", () => ({
  ContentCard: ({ item }: { item: ContentItem }) => (
    <article data-testid={`topic-item-${item.id}`}>{item.title}</article>
  ),
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

function makeItem(id: string, title: string, topics: string[]): ContentItem {
  return {
    id,
    title,
    summary: "Summary",
    sourceType: "manual",
    contentType: "article",
    topics,
    url: `https://example.test/${id}`,
    priority: "medium",
    isRead: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function itemsResponse(items: ContentItem[]): Response {
  return { json: jest.fn().mockResolvedValue({ items }) } as unknown as Response;
}

describe("TopicsPage", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("derives sorted topic counts, drills into matching items, and returns to the grid", async () => {
    fetchMock.mockResolvedValue(
      itemsResponse([
        makeItem("one", "First AI item", ["AI", "Development"]),
        makeItem("two", "Second AI item", ["AI"]),
        makeItem("three", "Design item", ["Design"]),
      ])
    );

    render(<TopicsPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /AI 2 items collected/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Development 1 item collected/ })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("https://distil.test/api/items");

    fireEvent.click(screen.getByRole("button", { name: /AI 2 items collected/ }));
    expect(screen.getByRole("heading", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("First AI item")).toBeInTheDocument();
    expect(screen.getByText("Second AI item")).toBeInTheDocument();
    expect(screen.queryByText("Design item")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /AI 2 items collected/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "browse all items in the feed" })).toHaveAttribute(
      "href",
      "/feed"
    );
  });

  it("matches topic names case-insensitively in drill-down", async () => {
    fetchMock.mockResolvedValue(
      itemsResponse([makeItem("one", "Uppercase", ["AI"]), makeItem("two", "Lowercase", ["ai"])])
    );
    render(<TopicsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /AI 1 item collected/ }));

    expect(screen.getByText("Uppercase")).toBeInTheDocument();
    expect(screen.getByText("Lowercase")).toBeInTheDocument();
  });

  it("clears the add-topic form after starting monitoring", async () => {
    fetchMock.mockResolvedValue(itemsResponse([]));
    render(<TopicsPage />);
    await screen.findByText("No topics yet");

    const input = screen.getByPlaceholderText("e.g. Quantum Computing, Climate Tech...");
    fireEvent.change(input, { target: { value: "Quantum Computing" } });
    expect(input).toHaveValue("Quantum Computing");

    fireEvent.click(screen.getByRole("button", { name: "Start Monitoring" }));
    expect(input).toHaveValue("");
  });

  it.each([
    { label: "an empty response", request: () => Promise.resolve(itemsResponse([])) },
    { label: "a failed response", request: () => Promise.reject(new Error("offline")) },
  ])("shows the empty state after $label", async ({ request }) => {
    fetchMock.mockImplementation(request);
    render(<TopicsPage />);

    expect(await screen.findByText("No topics yet")).toBeInTheDocument();
    expect(
      screen.getByText("Topics will appear here automatically as you add content.")
    ).toBeInTheDocument();
  });
});
