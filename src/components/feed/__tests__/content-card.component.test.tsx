/** @jest-environment jsdom */

import { renderWithContentCache as render } from "../../../../tests/support/content-cache";
import { act, fireEvent, screen } from "@testing-library/react";

import { ContentCard } from "../content-card";
import type { ContentItem } from "@/lib/types";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), prefetch: jest.fn() }),
}));

const item = {
  id: "item-1",
  title: "A title",
  summary: "A summary",
  url: "https://example.com/a",
  sourceType: "manual",
  contentType: "article",
  priority: "high",
  topics: [],
  isRead: false,
  area: "work",
  createdAt: new Date().toISOString(),
  processingStatus: "ready",
} as unknown as ContentItem;

describe("ContentCard area control", () => {
  it("forwards the controlled open state to the area menu", () => {
    const onAreaOpenChange = jest.fn();
    render(<ContentCard item={item} areaOpen onAreaOpenChange={onAreaOpenChange} />);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onAreaOpenChange).toHaveBeenCalledWith(false);
  });
});

describe.each([false, true])("ContentCard (compact=%s)", (compact) => {
  it("renders an article row with sibling link and buttons", async () => {
    jest.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);
    const { container } = render(<ContentCard item={item} compact={compact} />);
    const row = container.querySelector("article[data-row][data-item-id]");
    expect(row).toHaveAttribute("data-item-id", "item-1");
    expect(container.querySelector("a button")).toBeNull();
    expect(container.querySelector("a")).toHaveAttribute("href", "/feed/item-1");
    const onClick = jest.fn((e: Event) => e.preventDefault());
    container.querySelector("a")!.addEventListener("click", onClick);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    });
    expect(onClick).not.toHaveBeenCalled();
  });
});
