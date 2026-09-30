/**
 * @jest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FilterBar, SEARCH_DEBOUNCE_MS } from "../filter-bar";
import { feedFilterState } from "@/lib/feed/feed-url";

function renderBar(search = "") {
  const onChange = jest.fn();
  const onSearchDraftChange = jest.fn();
  const view = render(
    <FilterBar
      filters={feedFilterState(new URLSearchParams(search))}
      onChange={onChange}
      onSearchDraftChange={onSearchDraftChange}
      sheet={<button type="button">Filters</button>}
    />
  );
  const rerender = (next: string) =>
    view.rerender(
      <FilterBar
        filters={feedFilterState(new URLSearchParams(next))}
        onChange={onChange}
        onSearchDraftChange={onSearchDraftChange}
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

describe("FilterBar layout", () => {
  it("keeps the area switch and quick toggles out of the bar", () => {
    renderBar();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unread only" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("renders the leading slot beside the search", () => {
    render(
      <FilterBar
        filters={feedFilterState(new URLSearchParams())}
        onChange={jest.fn()}
        leading={<h1>Feed</h1>}
      />
    );
    expect(screen.getByRole("heading", { name: "Feed" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveAttribute(
      "placeholder",
      "Search"
    );
  });
});

describe("FilterBar active filter chips", () => {
  it("shows every active filter as a removable chip and clears everything at once", () => {
    const { onChange } = renderBar(
      "source=gmail&topic=AI&archive=include&dateFrom=2026-09-01T00:00:00.000Z&q=rust&area=work&contentType=video&priority=high&site=x.com&read=true"
    );
    for (const label of [
      "Work",
      "Read included",
      "High priority",
      "Videos",
      "X posts",
      "Gmail",
      "AI",
      "Including archived",
      "From 2026-09-01",
    ]) {
      expect(screen.getByRole("button", { name: `Remove filter: ${label}` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Gmail" }));
    expect(onChange).toHaveBeenLastCalledWith({ source: [] });
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Work" }));
    expect(onChange).toHaveBeenLastCalledWith({ area: [] });
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Read included" }));
    expect(onChange).toHaveBeenLastCalledWith({ read: undefined, showRead: undefined });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: undefined, area: undefined, source: undefined })
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("offers chips and Clear only when a filter narrows the default view", () => {
    renderBar("q=rust");
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    cleanup();
    renderBar("site=x.com");
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});
