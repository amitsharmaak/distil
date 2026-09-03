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
  it("shows onboarding guidance when items is empty", () => {
    render(<StatsOverview items={[]} />);

    expect(
      screen.getByText("No items yet. Connect a source or add a link to get started.")
    ).toBeInTheDocument();
  });

  it("shows the correct total item count", () => {
    // One item is read so Total (3) ≠ Unread (2), avoiding duplicate text matches.
    const items = [makeItem(), makeItem(), makeItem({ isRead: true })];
    render(<StatsOverview items={items} />);

    expect(screen.getByText(/unread/)).toHaveTextContent(
      "2 unread · 3 total items · 1 source · 1 topic"
    );
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

    expect(screen.getByText(/sources/)).toHaveTextContent("2 sources");
  });

  it("shows the number of distinct topics", () => {
    const items = [
      makeItem({ topics: ["AI", "Tech"] }),
      makeItem({ topics: ["Tech", "Web"] }), // "Tech" overlaps — counted once
    ];
    render(<StatsOverview items={items} />);

    expect(screen.getByText(/topics/)).toHaveTextContent("3 topics");
  });

  it("renders all four inline stat labels", () => {
    render(<StatsOverview items={[makeItem()]} />);

    expect(screen.getByText(/unread/)).toHaveTextContent(
      "1 unread · 1 total item · 1 source · 1 topic"
    );
  });
});
