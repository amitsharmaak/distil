/** @jest-environment jsdom */
import { fireEvent, screen, waitFor, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderWithContentCache } from "../../../../tests/support/content-cache";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { TodayPrototype } from "../today-prototype";
import { todayFixture } from "../fixtures";

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}));

// Story rows carry the area control, which writes through the account cache.
const render = (ui: ReactElement, options?: RenderOptions) =>
  renderWithContentCache(ui, { wrapper: ShortcutsProvider, ...options });

describe("TodayPrototype", () => {
  it("separates the edition from resurfacing without system-language explanations", () => {
    render(<TodayPrototype {...todayFixture} />);
    expect(screen.getByRole("heading", { name: "Priority Reading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Worth Revisiting" })).toBeInTheDocument();
    expect(screen.queryByText(/Why now:/)).not.toBeInTheDocument();
    expect(screen.getByText("3 stories · 3 min")).toBeInTheDocument();
    expect(screen.getByText(/opened 21 days ago/)).toBeInTheDocument();
  });

  it("marks each item as a row and does not nest a main landmark", () => {
    const { container } = render(<TodayPrototype {...todayFixture} />);
    expect(container.querySelectorAll("article[data-row][data-item-id]")).toHaveLength(3);
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("article[data-row] a[href]")).toHaveAttribute(
      "href",
      "/feed/priority-1"
    );
  });

  it("j and k walk both sections in one order; r is not registered", () => {
    render(<TodayPrototype {...todayFixture} />);
    const press = (key: string) => fireEvent.keyDown(window, { key });
    const link = (href: string) => document.querySelector(`a[href="${href}"]`);
    press("j");
    expect(link("/feed/priority-1")).toHaveFocus();
    press("j");
    expect(link("/feed/priority-2")).toHaveFocus();
    press("j");
    expect(link("/feed/revisit-1")).toHaveFocus();
    press("k");
    expect(link("/feed/priority-2")).toHaveFocus();
  });

  it("uses a lead, four standard stories, then compact rows", () => {
    const priority = Array.from({ length: 7 }, (_, index) => ({
      ...todayFixture.priority[0],
      id: `story-${index}`,
      title: `Story ${index}`,
      href: `/feed/story-${index}`,
    }));
    const { container } = render(<TodayPrototype priority={priority} revisiting={[]} />);
    const variants = [...container.querySelectorAll("[data-story-variant]")].map((row) =>
      row.getAttribute("data-story-variant")
    );
    expect(variants).toEqual([
      "lead",
      "standard",
      "standard",
      "standard",
      "standard",
      "compact",
      "compact",
    ]);
    expect(screen.getByText("7 stories · 7 min")).toBeInTheDocument();
    expect(screen.getByText("You’ve reached the end of this edition.")).toBeInTheDocument();
  });

  it("opens the focused story's area with a and restores navigation after Escape", async () => {
    render(<TodayPrototype {...todayFixture} />);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Set area" })[0]).toHaveFocus()
    );
    fireEvent.keyDown(window, { key: "j" });
    expect(document.querySelector('a[href="/feed/priority-2"]')).toHaveFocus();
  });

  it("has useful empty states", () => {
    render(<TodayPrototype priority={[]} revisiting={[]} />);
    expect(screen.getByText(/Nothing urgent/)).toBeInTheDocument();
    expect(screen.getByText(/Saved ideas/)).toBeInTheDocument();
  });
});
