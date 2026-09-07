/** @jest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  ArchiveExperience,
  CollectionDetailExperience,
  CollectionsExperience,
} from "../library-experiences";
import type { FeedItem } from "@/lib/feed/feed-query";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

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
    push.mockReset();
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
    expect(screen.getByRole("status")).toHaveTextContent("Loading archive");
    expect(await screen.findByText("A saved article")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByText("A saved article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/v1/items/item-1/state",
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

  it("creates, edits, and confirms deletion of collections", async () => {
    const collection = { id: "c-1", name: "Product", description: "Ideas" };
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith("/collections") && init?.method === "POST") {
        return Promise.resolve(response({ collection }));
      }
      if (path.endsWith("/collections/c-1") && init?.method === "PATCH") {
        return Promise.resolve(response({ collection: { ...collection, name: "Updated" } }));
      }
      if (path.endsWith("/collections/c-1") && init?.method === "DELETE") {
        return Promise.resolve(response({}));
      }
      return Promise.resolve(response({ collections: [] }));
    });
    render(<CollectionsExperience />);
    expect(await screen.findByText(/Create a collection/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Collection name"), { target: { value: "Product" } });
    fireEvent.change(screen.getByLabelText("Collection description"), {
      target: { value: "Ideas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create collection" }));
    expect(await screen.findByRole("heading", { name: "Product" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(
      screen.getByLabelText("Collection name", { selector: "#edit-collection-name-c-1" }),
      {
        target: { value: "Updated" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Updated" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Updated" })).not.toBeInTheDocument()
    );
  });

  it("shows collection creation and load errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Collections unavailable"));
    render(<CollectionsExperience />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Collections unavailable");

    cleanup();
    fetchMock.mockReset();
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "POST")
        return Promise.resolve(response({ error: { message: "Cannot create" } }, false));
      return Promise.resolve(response({ collections: [] }));
    });
    render(<CollectionsExperience />);
    await screen.findByText(/Create a collection/);
    fireEvent.change(screen.getByLabelText("Collection name"), { target: { value: "Product" } });
    fireEvent.click(screen.getByRole("button", { name: "Create collection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot create");
  });

  it("loads a collection, removes an item, and restores it on failure", async () => {
    const collection = { id: "c-1", name: "Product", description: "Ideas" };
    const saved = item();
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith("/collections/c-1") && !init?.method)
        return Promise.resolve(response({ collection, items: [{ itemId: saved.id }] }));
      if (path.includes("/feed?") && !init?.method)
        return Promise.resolve(response({ items: [saved] }));
      if (init?.method === "DELETE")
        return Promise.resolve(response({ error: { message: "Keep it" } }, false));
      return Promise.resolve(response({}));
    });
    render(<CollectionDetailExperience collectionId="c-1" />);
    expect(await screen.findByRole("heading", { name: "Product" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove A saved article from collection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep it");
    expect(screen.getByText("A saved article")).toBeInTheDocument();
  });

  it("handles missing and empty collection details", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Collection missing"));
    render(<CollectionDetailExperience collectionId="missing" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Collection missing");

    fetchMock.mockReset();
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/feed?")) return Promise.resolve(response({ items: [] }));
      return Promise.resolve(response({ collection: { id: "c-1", name: "Empty" }, items: [] }));
    });
    render(<CollectionDetailExperience collectionId="c-1" />);
    expect(await screen.findByRole("heading", { name: "Empty" })).toBeInTheDocument();
    expect(screen.getByText(/No items in this collection yet/)).toBeInTheDocument();
  });
});
