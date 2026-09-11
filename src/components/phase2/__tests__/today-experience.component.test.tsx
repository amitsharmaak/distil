/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";

import { TodayExperience } from "../today-experience";
import type { FeedItem } from "@/lib/feed/feed-query";

jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));

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

function response(items: FeedItem[]): Response {
  return { ok: true, json: jest.fn().mockResolvedValue({ items }) } as unknown as Response;
}

describe("TodayExperience", () => {
  it("renders real priority and eligible revisit items from the versioned feed", async () => {
    const stale = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    jest.mocked(global.fetch).mockImplementation((url) => {
      const text = String(url);
      return Promise.resolve(
        response(
          text.includes("sort=priority")
            ? [item()]
            : [
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
    });

    render(<TodayExperience />);

    expect(await screen.findByText("Important reading")).toBeInTheDocument();
    expect(screen.getByText("Worth revisiting")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/feed?sort=priority&read=false&limit=6")
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/feed?sort=recent&archive=exclude&limit=100")
    );
  });

  it("renders Markdown summaries as plain text", async () => {
    jest.mocked(global.fetch).mockImplementation((url) =>
      Promise.resolve(
        response(
          String(url).includes("sort=priority")
            ? [
                item({
                  aiSummary:
                    "## Why it matters\n\n**Durable** capture beats [connectors](https://example.test).",
                }),
              ]
            : []
        )
      )
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
});
