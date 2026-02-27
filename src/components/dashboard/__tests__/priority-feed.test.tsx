/**
 * @jest-environment jsdom
 *
 * Tests for PriorityFeed component.
 * Verifies filtering, sorting, and rendering of priority items.
 */

import { render, screen } from "@testing-library/react";
import { PriorityFeed } from "../priority-feed";
import type { ContentItem } from "@/lib/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: `item-${Math.random()}`,
    title: "Default Title",
    summary: "Default summary.",
    sourceType: "manual",
    contentType: "article",
    topics: [],
    url: "https://example.com",
    priority: "medium",
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PriorityFeed", () => {
  it("shows empty state when there are no unread items", () => {
    const items = [makeItem({ isRead: true })];
    render(<PriorityFeed items={items} />);

    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("shows empty state when items array is empty", () => {
    render(<PriorityFeed items={[]} />);

    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("renders unread items", () => {
    const items = [makeItem({ id: "a", title: "Unread Item", isRead: false })];
    render(<PriorityFeed items={items} />);

    expect(screen.getByText("Unread Item")).toBeInTheDocument();
  });

  it("does not render read items", () => {
    const items = [
      makeItem({ id: "u", title: "Unread One", isRead: false }),
      makeItem({ id: "r", title: "Read One", isRead: true }),
    ];
    render(<PriorityFeed items={items} />);

    expect(screen.getByText("Unread One")).toBeInTheDocument();
    expect(screen.queryByText("Read One")).not.toBeInTheDocument();
  });

  it("shows high-priority items before low-priority items", () => {
    const items = [
      makeItem({ id: "l", title: "Low Priority Item", priority: "low", isRead: false }),
      makeItem({ id: "h", title: "High Priority Item", priority: "high", isRead: false }),
    ];
    render(<PriorityFeed items={items} />);

    const titles = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    // High priority item should appear before low priority item.
    expect(titles.indexOf("High Priority Item")).toBeLessThan(titles.indexOf("Low Priority Item"));
  });

  it("shows at most 5 items", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `item-${i}`, title: `Item ${i}`, isRead: false })
    );
    render(<PriorityFeed items={items} />);

    // h3 headings are used for item titles.
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.length).toBeLessThanOrEqual(5);
  });

  it("shows the priority badge for each item", () => {
    const items = [makeItem({ id: "hp", title: "High Item", priority: "high", isRead: false })];
    render(<PriorityFeed items={items} />);

    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("shows the section title", () => {
    render(<PriorityFeed items={[]} />);

    expect(screen.getByText("Priority Reading")).toBeInTheDocument();
  });
});
