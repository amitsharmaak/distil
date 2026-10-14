/**
 * @jest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { AREA_SHORTCUTS, AreaPills, useAreaShortcuts } from "../area-pills";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/feed",
  useSearchParams: () => new URLSearchParams(""),
}));

afterEach(cleanup);

function renderPills(value?: "personal" | "work" | "learning" | "updates") {
  const onSelect = jest.fn();
  render(<AreaPills value={value} onSelect={onSelect} />);
  const group = within(screen.getByRole("radiogroup", { name: "Reading mode" }));
  return { onSelect, group };
}

describe("AreaPills", () => {
  it("shows All and the four areas as single-select pills, All checked by default", () => {
    const { group } = renderPills();
    expect(group.getAllByRole("radio").map((pill) => pill.textContent)).toEqual([
      "All",
      "Personal",
      "Work",
      "Learning",
      "Updates",
    ]);
    expect(group.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
    expect(group.getByRole("radio", { name: "Work" })).toHaveAttribute("aria-checked", "false");
  });

  it("marks the selected area and reports a click as the area value", () => {
    const { group, onSelect } = renderPills("work");
    expect(group.getByRole("radio", { name: "Work" })).toHaveAttribute("aria-checked", "true");
    expect(group.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(group.getByRole("radio", { name: "Learning" }));
    expect(onSelect).toHaveBeenLastCalledWith("learning");
    fireEvent.click(group.getByRole("radio", { name: "All" }));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it("moves with the arrow keys and wraps, only the selected pill in the tab order", () => {
    const { group, onSelect } = renderPills("updates");
    const updates = group.getByRole("radio", { name: "Updates" });
    expect(updates).toHaveAttribute("tabindex", "0");
    expect(group.getByRole("radio", { name: "All" })).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(updates, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(group.getByRole("radio", { name: "All" })).toHaveFocus();
    fireEvent.keyDown(group.getByRole("radio", { name: "All" }), { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("updates");
    fireEvent.keyDown(updates, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it("never wraps onto a second line: the row scrolls sideways instead", () => {
    renderPills();
    const row = screen.getByRole("radiogroup", { name: "Reading mode" });
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).not.toContain("flex-wrap");
    for (const pill of within(row).getAllByRole("radio")) {
      expect(pill.className).toContain("whitespace-nowrap");
      expect(pill.className).toContain("shrink-0");
    }
  });

  it("binds 1 to 5 to the pills in row order", () => {
    const onSelect = jest.fn();
    function Feed() {
      useAreaShortcuts(onSelect);
      return null;
    }
    render(
      <ShortcutsProvider>
        <Feed />
      </ShortcutsProvider>
    );
    expect(AREA_SHORTCUTS.map((def) => def.keys[0].key)).toEqual(["1", "2", "3", "4", "5"]);
    expect(
      AREA_SHORTCUTS.every((def) => def.group === "Reading mode" && def.scope === "list")
    ).toBe(true);
    fireEvent.keyDown(window, { key: "3" });
    expect(onSelect).toHaveBeenLastCalledWith("work");
    fireEvent.keyDown(window, { key: "1" });
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    fireEvent.keyDown(window, { key: "5" });
    expect(onSelect).toHaveBeenLastCalledWith("updates");
  });
});
