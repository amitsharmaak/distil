/** @jest-environment jsdom */

import { renderWithContentCache as render } from "../../../../tests/support/content-cache";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { ShortcutDef, ShortcutKey } from "@/lib/shortcuts/types";
import { useGlobalShortcuts } from "../use-global-shortcuts";
import { DetailActionBar } from "@/components/feed/detail-action-bar-content";
import {
  ShortcutsProvider,
  scopeForPathname,
  useShortcut,
  useShortcutsSuspended,
} from "../shortcuts-provider";
import { ShortcutsHelpDialog } from "../shortcuts-help-dialog";
import { readSingleKeyShortcuts, setSingleKeyShortcuts } from "../shortcuts-preference";

let mockPathname = "/feed";
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

const def = (id: string, keys: ShortcutKey[], extra: Partial<ShortcutDef> = {}): ShortcutDef => ({
  id,
  keys,
  label: `Label ${id}`,
  group: "Navigation",
  scope: "global",
  ...extra,
});

const T = def("t", [{ key: "t" }]);
const GF = def("nav.feed", [{ key: "g" }, { key: "f" }]);
const REFRESH = def("refresh", [{ key: "r", mod: true }], { alwaysOn: true });
const J = def("list.next", [{ key: "j" }], { group: "Lists", scope: "list", label: "Next item" });
const RD = def("read.top", [{ key: "g", shift: true }], {
  group: "Reading",
  scope: "reader",
  label: "Top",
});

function Probe({
  defs,
  handlers,
  suspended = false,
}: {
  defs: ShortcutDef[];
  handlers: Record<string, jest.Mock>;
  suspended?: boolean;
}) {
  return (
    <>
      {defs.map((d) => (
        <One key={d.id} d={d} fn={handlers[d.id]} />
      ))}
      <Suspender suspended={suspended} />
    </>
  );
}
function One({ d, fn }: { d: ShortcutDef; fn: jest.Mock }) {
  useShortcut(d, fn);
  return null;
}
function Suspender({ suspended }: { suspended: boolean }) {
  useShortcutsSuspended(suspended);
  return null;
}

function setup(defs: ShortcutDef[], suspended = false) {
  const handlers = Object.fromEntries(defs.map((d) => [d.id, jest.fn()]));
  render(
    <ShortcutsProvider>
      <Probe defs={defs} handlers={handlers} suspended={suspended} />
      <ShortcutsHelpDialog />
      <input aria-label="field" />
    </ShortcutsProvider>
  );
  return handlers;
}

describe("shortcuts provider", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPathname = "/feed";
    mockPush.mockClear();
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
  });
  afterEach(cleanup);

  it("fires a single-key handler", () => {
    const h = setup([T]);
    fireEvent.keyDown(window, { key: "t" });
    expect(h.t).toHaveBeenCalledTimes(1);
  });

  it("fires a two-key sequence", () => {
    const h = setup([GF]);
    fireEvent.keyDown(window, { key: "g" });
    expect(h["nav.feed"]).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "f" });
    expect(h["nav.feed"]).toHaveBeenCalledTimes(1);
  });

  it("opens the dialog with ? and closes it with Escape", () => {
    setup([T]);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("only lets help shortcuts act while the help dialog is open", () => {
    const h = setup([T]);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
    fireEvent.keyDown(window, { key: "t" });
    expect(h.t).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
    fireEvent.keyDown(window, { key: "t" });
    expect(h.t).toHaveBeenCalledTimes(1);
  });

  it("ignores undeclared modifiers without preventing default", () => {
    const h = setup([T, REFRESH]);
    const notPrevented = fireEvent.keyDown(window, { key: "t", metaKey: true });
    expect(notPrevented).toBe(true);
    expect(h.t).not.toHaveBeenCalled();
    const prevented = fireEvent.keyDown(window, { key: "t" });
    expect(prevented).toBe(false);
  });

  it("does not fire while typing in an input", () => {
    const h = setup([T]);
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "t" });
    expect(h.t).not.toHaveBeenCalled();
  });

  it("silences plain letters but not ? when the preference is off", () => {
    setSingleKeyShortcuts(false);
    const h = setup([T, REFRESH]);
    fireEvent.keyDown(window, { key: "t" });
    expect(h.t).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "r", metaKey: true });
    expect(h.refresh).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
  });

  it("is silenced by useShortcutsSuspended(true)", () => {
    const h = setup([T], true);
    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "?" });
    expect(h.t).not.toHaveBeenCalled();
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("lists registered shortcuts grouped, current scope first", () => {
    mockPathname = "/feed";
    setup([T, J, RD, GF]);
    fireEvent.keyDown(window, { key: "?" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Lists", "General", "Navigation", "Reading"]);
    expect(screen.getByText("Next item")).toBeTruthy();
    expect(screen.getByText("Label nav.feed")).toBeTruthy();
    expect(screen.getByText("then")).toBeTruthy();
    expect(screen.getAllByText("Show keyboard shortcuts")).toHaveLength(2);
  });

  it("toggles the preference from the dialog", () => {
    setup([T]);
    fireEvent.keyDown(window, { key: "?" });
    fireEvent.click(screen.getByRole("switch"));
    expect(readSingleKeyShortcuts()).toBe(false);
  });
});

describe("single-key preference", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips and notifies subscribers", () => {
    expect(readSingleKeyShortcuts()).toBe(true);
    const seen = jest.fn();
    window.addEventListener("distil-shortcuts-preference-change", seen);
    act(() => setSingleKeyShortcuts(false));
    expect(readSingleKeyShortcuts()).toBe(false);
    expect(localStorage.getItem("distil.shortcuts.singleKey")).toBe("off");
    act(() => setSingleKeyShortcuts(true));
    expect(readSingleKeyShortcuts()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(2);
    window.removeEventListener("distil-shortcuts-preference-change", seen);
  });
});

function Globals() {
  useGlobalShortcuts(() => {});
  return null;
}

describe("real-engine wiring", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPush.mockClear();
    mockPathname = "/feed/abc";
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
  });
  afterEach(cleanup);

  it("g then f pushes /feed", () => {
    render(
      <ShortcutsProvider>
        <Globals />
      </ShortcutsProvider>
    );
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "f" });
    expect(mockPush).toHaveBeenCalledWith("/feed");
  });

  it("/ pushes /feed?focus=search when the page has no search box", () => {
    render(
      <ShortcutsProvider>
        <Globals />
      </ShortcutsProvider>
    );
    fireEvent.keyDown(window, { key: "/" });
    expect(mockPush).toHaveBeenCalledWith("/feed?focus=search");
  });

  it("does not preventDefault Cmd+R", () => {
    render(
      <ShortcutsProvider>
        <DetailActionBar
          itemId="1"
          url="https://example.com"
          title="T"
          isRead={false}
          prevId={null}
          nextId={null}
        />
      </ShortcutsProvider>
    );
    const global = global_fetch();
    expect(fireEvent.keyDown(window, { key: "r", metaKey: true })).toBe(true);
    expect(global).not.toHaveBeenCalled();
  });

  it("r marks read; preference off silences r but not ?", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(
      <ShortcutsProvider>
        <DetailActionBar
          itemId="1"
          url="https://example.com"
          title="T"
          isRead={false}
          prevId={null}
          nextId={null}
        />
        <ShortcutsHelpDialog />
      </ShortcutsProvider>
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "r" });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => setSingleKeyShortcuts(false));
    fetchMock.mockClear();
    await act(async () => {
      fireEvent.keyDown(window, { key: "r" });
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
  });
});

function global_fetch() {
  const f = jest.fn();
  global.fetch = f as unknown as typeof fetch;
  return f;
}

describe("scopeForPathname", () => {
  it("maps routes to scopes", () => {
    expect(scopeForPathname("/")).toBe("list");
    expect(scopeForPathname("/today")).toBe("list");
    expect(scopeForPathname("/feed")).toBe("list");
    expect(scopeForPathname("/feed/abc")).toBe("reader");
    expect(scopeForPathname("/research/1")).toBe("research");
    expect(scopeForPathname("/settings")).toBe("settings");
    expect(scopeForPathname("/archive")).toBe("global");
  });
});
