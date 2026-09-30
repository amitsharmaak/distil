import { keyEquals } from "./match";
import type { ShortcutDef, ShortcutKey } from "./types";

/** Matches single keys and two-key sequences (e.g. g then f). Pure; no timers. */
export class SequenceMatcher {
  private pending: { key: ShortcutKey; at: number } | null = null;

  constructor(
    private readonly defs: () => ShortcutDef[],
    private readonly windowMs = 1000
  ) {}

  feed(key: ShortcutKey, now: number = Date.now()): ShortcutDef | null {
    const defs = this.defs();
    const pending = this.pending;
    this.pending = null;

    if (pending && now - pending.at <= this.windowMs) {
      const hit = defs.find(
        (d) => d.keys.length === 2 && keyEquals(d.keys[0], pending.key) && keyEquals(d.keys[1], key)
      );
      if (hit) return hit;
    }

    const single = defs.find((d) => d.keys.length === 1 && keyEquals(d.keys[0], key));
    if (single) return single;

    if (defs.some((d) => d.keys.length === 2 && keyEquals(d.keys[0], key))) {
      this.pending = { key, at: now };
    }
    return null;
  }

  reset(): void {
    this.pending = null;
  }
}
