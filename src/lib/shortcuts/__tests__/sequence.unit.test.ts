import { SequenceMatcher } from "../sequence";
import type { ShortcutDef, ShortcutKey } from "../types";

const k = (key: string): ShortcutKey => ({ key });
const def = (id: string, ...keys: string[]): ShortcutDef => ({
  id,
  keys: keys.map(k),
  label: id,
  group: "Test",
  scope: "global",
});

const defs = [
  def("nav.feed", "g", "f"),
  def("nav.settings", "g", "s"),
  def("help", "?"),
  def("j", "j"),
];

describe("SequenceMatcher", () => {
  it("arms on the first key and fires on the second", () => {
    const m = new SequenceMatcher(() => defs);
    expect(m.feed(k("g"), 0)).toBeNull();
    expect(m.feed(k("f"), 500)?.id).toBe("nav.feed");
    expect(m.feed(k("f"), 600)).toBeNull();
  });

  it("fires at exactly the window and treats the key fresh after it", () => {
    const m = new SequenceMatcher(() => defs);
    m.feed(k("g"), 0);
    expect(m.feed(k("f"), 1000)?.id).toBe("nav.feed");
    m.feed(k("g"), 0);
    expect(m.feed(k("f"), 1001)).toBeNull();
  });

  it("re-arms when the expired key is itself a first key", () => {
    const m = new SequenceMatcher(() => defs);
    m.feed(k("g"), 0);
    expect(m.feed(k("g"), 2000)).toBeNull();
    expect(m.feed(k("s"), 2100)?.id).toBe("nav.settings");
  });

  it("clears pending on a wrong second key", () => {
    const m = new SequenceMatcher(() => defs);
    m.feed(k("g"), 0);
    expect(m.feed(k("x"), 100)).toBeNull();
    expect(m.feed(k("f"), 200)).toBeNull();
  });

  it("returns single-key defs and lets them win over arming", () => {
    const withBoth = [...defs, def("g.single", "g")];
    const m = new SequenceMatcher(() => withBoth);
    expect(m.feed(k("g"), 0)?.id).toBe("g.single");
    expect(m.feed(k("f"), 100)).toBeNull();
    expect(m.feed(k("j"), 200)?.id).toBe("j");
  });

  it("reset clears pending", () => {
    const m = new SequenceMatcher(() => defs);
    m.feed(k("g"), 0);
    m.reset();
    expect(m.feed(k("f"), 100)).toBeNull();
  });

  it("reads defs fresh on every feed", () => {
    let current: ShortcutDef[] = [];
    const m = new SequenceMatcher(() => current);
    expect(m.feed(k("j"), 0)).toBeNull();
    current = defs;
    expect(m.feed(k("j"), 1)?.id).toBe("j");
  });
});
