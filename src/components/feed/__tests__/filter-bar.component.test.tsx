/**
 * @jest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FilterBar, SEARCH_DEBOUNCE_MS } from "../filter-bar";
import { feedFilterState } from "@/lib/feed/feed-url";

function renderBar(search = "", options: { collectionNames?: Record<string, string> } = {}) {
  const onChange = jest.fn();
  const onSearchDraftChange = jest.fn();
  const view = render(
    <FilterBar
      filters={feedFilterState(new URLSearchParams(search))}
      onChange={onChange}
      onSearchDraftChange={onSearchDraftChange}
      collectionNames={options.collectionNames}
      sheet={<button type="button">Filters</button>}
    />
  );
  const rerender = (next: string) =>
    view.rerender(
      <FilterBar
        filters={feedFilterState(new URLSearchParams(next))}
        onChange={onChange}
        onSearchDraftChange={onSearchDraftChange}
        collectionNames={options.collectionNames}
        sheet={<button type="button">Filters</button>}
      />
    );
  return { onChange, onSearchDraftChange, rerender };
}

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

describe("FilterBar search", () => {
  it("reports every keystroke and commits one debounced search per pause", () => {
    jest.useFakeTimers();
    const { onChange, onSearchDraftChange } = renderBar();
    const input = screen.getByRole("searchbox", { name: "Search your items" });

    fireEvent.change(input, { target: { value: "ru" } });
    fireEvent.change(input, { target: { value: "rus" } });
    fireEvent.change(input, { target: { value: "rust" } });
    expect(onSearchDraftChange).toHaveBeenLastCalledWith("rust");
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: "rust" });
  });

  it("never sends a search shorter than two characters", () => {
    jest.useFakeTimers();
    const { onChange } = renderBar();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: " r " } });
    act(() => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the search with the clear button and with Escape", () => {
    const first = renderBar("q=rust");
    const input = screen.getByRole("searchbox");
    expect(input).toHaveValue("rust");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(first.onChange).toHaveBeenCalledWith({ q: undefined });
    cleanup();

    const second = renderBar("q=rust");
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(second.onChange).toHaveBeenCalledWith({ q: undefined });
  });

  it("follows the URL when the search changes from elsewhere", () => {
    const { rerender } = renderBar("q=rust");
    rerender("q=queues");
    expect(screen.getByRole("searchbox")).toHaveValue("queues");
    rerender("");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("focuses the search on '/' unless the user is typing in another field", () => {
    renderBar();
    const input = screen.getByRole("searchbox");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(input).toHaveFocus();

    input.blur();
    const other = document.createElement("textarea");
    document.body.appendChild(other);
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(other).toHaveFocus();
    other.remove();
  });
});

describe("FilterBar area switch", () => {
  it("shows All by default and selects one area at a time", () => {
    const { onChange } = renderBar();
    const group = screen.getByRole("radiogroup", { name: "Area" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Work" }));
    expect(onChange).toHaveBeenLastCalledWith({ area: "work" });
  });

  it("returns to All by removing the area", () => {
    const { onChange } = renderBar("area=personal");
    expect(screen.getByRole("radio", { name: "Personal" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith({ area: undefined });
  });
});

describe("FilterBar quick filters", () => {
  it("renders the five toggles with Unread on by default", () => {
    renderBar();
    const pressed = (name: string) =>
      screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect(pressed("Unread")).toBe("true");
    expect(pressed("High priority")).toBe("false");
    expect(pressed("Videos")).toBe("false");
    expect(pressed("X")).toBe("false");
    expect(pressed("Podcasts")).toBe("false");
  });

  it("maps each toggle to URL parameters and keeps other values of the same facet", () => {
    const { onChange } = renderBar("contentType=podcast&priority=medium");
    fireEvent.click(screen.getByRole("button", { name: "Videos" }));
    expect(onChange).toHaveBeenLastCalledWith({ contentType: ["podcast", "video"] });
    fireEvent.click(screen.getByRole("button", { name: "Podcasts" }));
    expect(onChange).toHaveBeenLastCalledWith({ contentType: [] });
    fireEvent.click(screen.getByRole("button", { name: "High priority" }));
    expect(onChange).toHaveBeenLastCalledWith({ priority: ["medium", "high"] });
    fireEvent.click(screen.getByRole("button", { name: "X" }));
    expect(onChange).toHaveBeenLastCalledWith({ site: ["x.com"] });
    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    expect(onChange).toHaveBeenLastCalledWith({ read: "true", showRead: undefined });
  });

  it("shows sheet filters as removable chips and clears everything at once", () => {
    const { onChange } = renderBar(
      "source=gmail&topic=AI&collection=c1&archive=include&dateFrom=2026-09-01T00:00:00.000Z&q=rust&area=work",
      { collectionNames: { c1: "Reading list" } }
    );
    for (const label of ["Gmail", "AI", "Reading list", "Including archived", "From 2026-09-01"]) {
      expect(screen.getByRole("button", { name: `Remove filter: ${label}` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Gmail" }));
    expect(onChange).toHaveBeenLastCalledWith({ source: [] });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: undefined, area: undefined, source: undefined })
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("offers Clear only when something narrows the default view", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    cleanup();
    renderBar("site=x.com");
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});
