/** @jest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ArchiveExperience } from "../library-experiences";
import type { FeedItem } from "@/lib/feed/feed-query";
function response(payload: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "item-1",
    title: "A saved article",
    summary: "A useful summary",
    aiSummary: null,
    sourceType: "manual",
    publication: "Manual",
    contentType: "article",
    topics: [],
    url: "https://example.test/article",
    priority: "medium",
    isRead: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    processingStatus: "ready",
    ...overrides,
  } as FeedItem;
}

describe("library experiences", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads, restores, and rolls back archived items", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "PATCH")
        return Promise.resolve(response({ error: { message: "Offline" } }, false));
      return Promise.resolve(response({ items: [item()] }));
    });
    render(<ArchiveExperience />);
    expect(screen.getByRole("status", { name: "Loading archive" })).toBeInTheDocument();
    expect(await screen.findByText("A saved article")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByText("A saved article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/items/item-1/state",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("shows archive empty and load-error states", async () => {
    fetchMock.mockResolvedValueOnce(response({ items: [] }));
    render(<ArchiveExperience />);
    expect(await screen.findByText(/Nothing is archived/)).toBeInTheDocument();

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error("Archive unavailable"));
    render(<ArchiveExperience />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Archive unavailable");
  });
});
