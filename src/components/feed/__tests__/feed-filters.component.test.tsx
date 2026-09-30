/**
 * @jest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { FeedFilterSheet } from "../feed-filters";
import { feedFilterState } from "@/lib/feed/feed-url";

function renderSheet(search = "", activeCount = 0) {
  const onChange = jest.fn();
  const onViewModeChange = jest.fn();
  render(
    <FeedFilterSheet
      filters={feedFilterState(new URLSearchParams(search))}
      onChange={onChange}
      activeCount={activeCount}
      topicOptions={["AI"]}
      viewMode="card"
      onViewModeChange={onViewModeChange}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
  return { onChange, onViewModeChange };
}

afterEach(cleanup);

describe("FeedFilterSheet", () => {
  it("switches area one at a time and back to All", () => {
    const { onChange } = renderSheet("area=personal");
    const area = within(screen.getByRole("radiogroup", { name: "Area" }));
    expect(area.getByRole("radio", { name: "Personal" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(area.getByRole("radio", { name: "Work" }));
    expect(onChange).toHaveBeenLastCalledWith({ area: "work" });
    fireEvent.click(area.getByRole("radio", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith({ area: undefined });
  });

  it("shows Unread only as a switch that is on by default", () => {
    const { onChange } = renderSheet();
    const unread = screen.getByRole("switch", { name: "Unread only" });
    expect(unread).toHaveAttribute("aria-checked", "true");
    fireEvent.click(unread);
    expect(onChange).toHaveBeenLastCalledWith({ read: "true", showRead: undefined });
  });

  it("maps type chips, including X posts, to their URL parameters", () => {
    const { onChange } = renderSheet("contentType=podcast&site=example.com");
    expect(screen.getByRole("button", { name: "Podcasts" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Videos" }));
    expect(onChange).toHaveBeenLastCalledWith({ contentType: ["podcast", "video"] });
    fireEvent.click(screen.getByRole("button", { name: "X posts" }));
    expect(onChange).toHaveBeenLastCalledWith({ site: ["example.com", "x.com"] });
  });

  it("toggles priority, source and topic chips", () => {
    const { onChange } = renderSheet("priority=high");
    fireEvent.click(screen.getByRole("button", { name: "High" }));
    expect(onChange).toHaveBeenLastCalledWith({ priority: [] });
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    expect(onChange).toHaveBeenLastCalledWith({ source: ["gmail"] });
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(onChange).toHaveBeenLastCalledWith({ topic: ["AI"] });
  });

  it("offers Best match only while searching, and sets sort and archive", () => {
    renderSheet();
    expect(screen.queryByRole("radio", { name: "Best match" })).not.toBeInTheDocument();
    cleanup();
    const { onChange } = renderSheet("q=rust");
    expect(screen.getByRole("radio", { name: "Best match" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByRole("radio", { name: "Recent" }));
    expect(onChange).toHaveBeenLastCalledWith({ sort: "recent" });
    fireEvent.click(screen.getByRole("radio", { name: "Archived" }));
    expect(onChange).toHaveBeenLastCalledWith({ archive: "only" });
  });

  it("writes whole-day date bounds", () => {
    const { onChange } = renderSheet();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    expect(onChange).toHaveBeenLastCalledWith({ dateFrom: "2026-09-01T00:00:00.000Z" });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-03" } });
    expect(onChange).toHaveBeenLastCalledWith({ dateTo: "2026-09-03T23:59:59.999Z" });
  });

  it("switches layout, resets filters but keeps the search, and closes on Done", () => {
    const { onChange, onViewModeChange } = renderSheet("q=rust&source=gmail", 1);
    fireEvent.click(screen.getByRole("button", { name: "Compact layout" }));
    expect(onViewModeChange).toHaveBeenCalledWith("compact");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const reset = onChange.mock.lastCall[0];
    expect(reset).toEqual(expect.objectContaining({ source: undefined, area: undefined }));
    expect(reset).not.toHaveProperty("q");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables Reset when nothing is active", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("hides unread, archive, layout and (optionally) sort for an unread-queue page", () => {
    const { rerender } = render(
      <FeedFilterSheet
        filters={feedFilterState(new URLSearchParams(""))}
        onChange={jest.fn()}
        activeCount={0}
        topicOptions={[]}
        unreadQueue
        showSort={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.queryByRole("switch", { name: "Unread only" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Sort" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Layout" })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Area" })).toBeInTheDocument();

    rerender(
      <FeedFilterSheet
        filters={feedFilterState(new URLSearchParams("q=queues"))}
        onChange={jest.fn()}
        activeCount={0}
        topicOptions={[]}
        unreadQueue
      />
    );
    const sort = within(screen.getByRole("radiogroup", { name: "Sort" }));
    expect(sort.getByRole("radio", { name: "Best match" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("group", { name: "Layout" })).not.toBeInTheDocument();
  });
});
