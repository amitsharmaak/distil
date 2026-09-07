/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";

import { SearchExperience } from "../search-experience";
import type { PassageSearchResponse } from "@/lib/knowledge/retrieval";

let search = "";
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push }),
}));
jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

const result = {
  itemId: "item-1",
  chunkId: "chunk-1",
  contentVersionId: "version-1",
  title: "Durable queues",
  url: "https://example.test/queues",
  sourceType: "manual",
  excerpt: "A durable queue preserves work across restarts.",
  excerptStart: 0,
  excerptEnd: 48,
  score: 0.8,
  reasons: ["keyword:chunk_text"],
  retrievalMode: "keyword" as const,
  degradation: [],
};

const payload: PassageSearchResponse = {
  query: "durable queues",
  results: [result],
  retrievalMode: "keyword",
  degradation: [],
};

function ok(value: unknown): Response {
  return { ok: true, status: 200, json: jest.fn().mockResolvedValue(value) } as unknown as Response;
}

describe("SearchExperience", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    search = "";
    push.mockReset();
    fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue(ok(payload));
  });

  it("shows the empty prompt without querying", () => {
    render(<SearchExperience />);
    expect(screen.getByText("Enter a query to search your saved knowledge.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading while a search request is pending", () => {
    search = "q=durable+queues";
    fetchMock.mockReturnValue(new Promise<Response>(() => {}) as Promise<Response>);
    render(<SearchExperience />);
    expect(screen.getByRole("status")).toHaveTextContent("Searching");
  });

  it("renders result passages, match reasons, and keyword-mode disclosure", async () => {
    search = "q=durable+queues";
    render(<SearchExperience />);
    expect(await screen.findByRole("heading", { name: "Durable queues" })).toBeInTheDocument();
    expect(screen.getByText("A durable queue preserves work across restarts.")).toBeInTheDocument();
    expect(screen.getByText("keyword:chunk_text")).toBeInTheDocument();
    expect(screen.getByText(/Keyword mode is active/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in reader" })).toHaveAttribute(
      "href",
      "/feed/item-1"
    );
  });

  it("submits q and facets into the URL", () => {
    render(<SearchExperience />);
    fireEvent.change(screen.getByLabelText("Search saved knowledge"), {
      target: { value: "durable queues" },
    });
    fireEvent.click(screen.getByRole("button", { name: "manual" }));
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "systems" } });
    fireEvent.submit(screen.getByRole("search"));
    const destination = push.mock.calls[0]?.[0] as string;
    expect(destination).toContain("/search?q=durable+queues");
    expect(destination).toContain("source=manual");
    expect(destination).toContain("topic=systems");
  });

  it("shows a safe unavailable state for the API", async () => {
    search = "q=durable";
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({
        error: { code: "POSTGRES_REQUIRED", message: "Search requires PostgreSQL" },
      }),
    } as unknown as Response);
    render(<SearchExperience />);
    expect(
      await screen.findByRole("heading", { name: "Search is unavailable" })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("feed and saved items remain available");
  });

  it("shows an error response without results", async () => {
    search = "q=durable";
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ error: { message: "Invalid search query" } }),
    } as unknown as Response);
    render(<SearchExperience />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid search query");
  });

  it("renders an empty results state", async () => {
    search = "q=missing";
    fetchMock.mockResolvedValue(ok({ ...payload, query: "missing", results: [] }));
    render(<SearchExperience />);
    expect(await screen.findByText("No saved passages matched this search.")).toBeInTheDocument();
  });
});
