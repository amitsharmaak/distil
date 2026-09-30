/** @jest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ShortcutDef, ShortcutKey } from "@/lib/shortcuts/types";
import { ShortcutsProvider, useShortcut, useShortcutsSuspended } from "../shortcuts-provider";
import { ShortcutsHelpDialog } from "../shortcuts-help-dialog";
import { readSingleKeyShortcuts, setSingleKeyShortcuts } from "../shortcuts-preference";

let mockPathname = "/feed";
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

jest.mock("@/lib/shortcuts/match", () => ({
  isEditableTarget: (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"),
  eventToKey: (e: KeyboardEvent) => {
    if (e.isComposing || e.defaultPrevented || e.altKey) return null;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key !== "/" && e.key !== "r") return null;
    const k: { key: string; shift?: boolean; mod?: boolean } = {
      key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
    };
    if (mod) k.mod = true;
    if (e.shiftKey && /^[a-z]$/i.test(e.key)) k.shift = true;
    return k;
  },
  keyEquals: (a: ShortcutKey, b: ShortcutKey) =>
    a.key === b.key && !!a.shift === !!b.shift && !!a.mod === !!b.mod,
  isMacPlatform: () => true,
}));

jest.mock("@/lib/shortcuts/sequence", () => {
  const eq = (a: ShortcutKey, b: ShortcutKey) =>
    a.key === b.key && !!a.shift === !!b.shift && !!a.mod === !!b.mod;
  class SequenceMatcher {
    private pending: ShortcutKey | null = null;
    private at = 0;
    constructor(
      private defs: () => ShortcutDef[],
      private windowMs = 1000
    ) {}
    feed(key: ShortcutKey, now = Date.now()): ShortcutDef | null {
      const defs = this.defs();
      if (this.pending && now - this.at <= this.windowMs) {
        const hit = defs.find(
          (d) => d.keys.length === 2 && eq(d.keys[0], this.pending!) && eq(d.keys[1], key)
        );
        this.pending = null;
        if (hit) return hit;
      }
      this.pending = null;
      const single = defs.find((d) => d.keys.length === 1 && eq(d.keys[0], key));
      if (single) return single;
      if (defs.some((d) => d.keys.length === 2 && eq(d.keys[0], key))) {
        this.pending = key;
        this.at = now;
      }
      return null;
    }
    reset() {
      this.pending = null;
    }
  }
  return { SequenceMatcher };
});

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
