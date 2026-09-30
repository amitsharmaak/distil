/** @jest-environment jsdom */

import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShortcutsProvider, useRegisteredShortcuts } from "../shortcuts-provider";
import { useRowNavigation, type RowNavigationOptions } from "../use-row-navigation";

jest.mock("next/navigation", () => ({
  usePathname: () => "/feed",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function Ids() {
  const defs = useRegisteredShortcuts();
  return <output data-testid="ids">{defs.map((d) => d.id).join(",")}</output>;
}

function List({
  options,
  loadMore = false,
}: {
  options?: RowNavigationOptions;
  loadMore?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useRowNavigation(ref, options);
  return (
    <div ref={ref}>
      {["a", "b", "c"].map((id) => (
        <article key={id} data-row data-item-id={id}>
          <a href={`#${id}`} data-testid={`link-${id}`} onClick={(e) => e.preventDefault()}>
            {id}
          </a>
          <button>inner-{id}</button>
        </article>
      ))}
      {loadMore && <button data-load-more>More</button>}
      <input aria-label="field" />
    </div>
  );
}

function setup(options?: RowNavigationOptions, loadMore = false) {
  return render(
    <ShortcutsProvider>
      <Ids />
      <List options={options} loadMore={loadMore} />
    </ShortcutsProvider>
  );
}

const press = (key: string) => fireEvent.keyDown(window, { key });

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

describe("useRowNavigation", () => {
  it("j from nothing focuses row 1, then walks in order", () => {
    setup();
    press("j");
    expect(screen.getByTestId("link-a")).toHaveFocus();
    press("j");
    expect(screen.getByTestId("link-b")).toHaveFocus();
    press("k");
    expect(screen.getByTestId("link-a")).toHaveFocus();
  });

  it("k at the first row stays; k from nothing focuses the first row", () => {
    setup();
    press("k");
    expect(screen.getByTestId("link-a")).toHaveFocus();
    press("k");
    expect(screen.getByTestId("link-a")).toHaveFocus();
  });

  it("j past the last row clicks and focuses [data-load-more]", () => {
    setup(undefined, true);
    const more = screen.getByText("More");
    const click = jest.fn();
    more.addEventListener("click", click);
    screen.getByTestId("link-c").focus();
    press("j");
    expect(click).toHaveBeenCalledTimes(1);
    expect(more).toHaveFocus();
  });

  it("j past the last row without load-more keeps focus", () => {
    setup();
    screen.getByTestId("link-c").focus();
    press("j");
    expect(screen.getByTestId("link-c")).toHaveFocus();
  });

  it("o clicks the focused link; nothing when none focused", () => {
    setup();
    const click = jest.fn();
    screen.getByTestId("link-b").addEventListener("click", click);
    press("o");
    expect(click).not.toHaveBeenCalled();
    screen.getByTestId("link-b").focus();
    press("o");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("r and a call the callbacks with the focused id", () => {
    const onMarkRead = jest.fn();
    const onOpenArea = jest.fn();
    setup({ onMarkRead, onOpenArea });
    press("r");
    press("a");
    expect(onMarkRead).not.toHaveBeenCalled();
    expect(onOpenArea).not.toHaveBeenCalled();
    screen.getByText("inner-b").focus();
    press("r");
    press("a");
    expect(onMarkRead).toHaveBeenCalledWith("b");
    expect(onOpenArea).toHaveBeenCalledWith("b");
  });

  it("does not register r/a without callbacks", () => {
    setup();
    const ids = screen.getByTestId("ids").textContent ?? "";
    expect(ids).toContain("list.next");
    expect(ids).toContain("list.open");
    expect(ids).not.toContain("list.markRead");
    expect(ids).not.toContain("list.area");
  });

  it("ignores keys typed in an input inside the container", () => {
    setup();
    const input = screen.getByLabelText("field");
    input.focus();
    fireEvent.keyDown(input, { key: "j", bubbles: true });
    expect(input).toHaveFocus();
  });
});
