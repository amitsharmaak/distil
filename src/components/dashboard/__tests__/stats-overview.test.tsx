/**
 * @jest-environment jsdom
 *
 * Tests for StatsOverview component.
 * Verifies that stat counts are computed correctly from the items prop.
 */

import { render, screen } from "@testing-library/react";
import { StatsOverview } from "../stats-overview";
import type { ContentItem } from "@/lib/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: `item-${Math.random()}`,
    title: "Item",
    summary: "",
    sourceType: "manual",
    contentType: "article",
    topics: ["Tech"],
    url: "https://example.com",
    priority: "medium",
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StatsOverview", () => {
  it("shows 0 for all stats when items is empty", () => {
    render(<StatsOverview items={[]} />);

    // Total Items
    expect(screen.getByText("Total Items")).toBeInTheDocument();
    // All stat values should be "0"
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("shows the correct total item count", () => {
    // One item is read so Total (3) ≠ Unread (2), avoiding duplicate text matches.
    const items = [makeItem(), makeItem(), makeItem({ isRead: true })];
    render(<StatsOverview items={items} />);

    // "3" should appear exactly once — as the Total Items count.
    expect(screen.getAllByText("3")).toHaveLength(1);
  });

  it("shows the correct unread count", () => {
    const items = [
      makeItem({ isRead: false }),
      makeItem({ isRead: false }),
      makeItem({ isRead: true }),
    ];
    render(<StatsOverview items={items} />);

    // "2" should appear for the unread count.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows the number of distinct source types", () => {
    const items = [
      makeItem({ sourceType: "gmail" }),
      makeItem({ sourceType: "gmail" }), // duplicate — should not be counted twice
      makeItem({ sourceType: "slack" }),
    ];
    render(<StatsOverview items={items} />);

    // 2 distinct sources: gmail and slack.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows the number of distinct topics", () => {
    const items = [
      makeItem({ topics: ["AI", "Tech"] }),
      makeItem({ topics: ["Tech", "Web"] }), // "Tech" overlaps — counted once
    ];
    render(<StatsOverview items={items} />);

    // 3 distinct topics: AI, Tech, Web.
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders all four stat card labels", () => {
    render(<StatsOverview items={[]} />);

    expect(screen.getByText("Total Items")).toBeInTheDocument();
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Topics")).toBeInTheDocument();
  });
});
