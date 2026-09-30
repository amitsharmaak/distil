export type ShortcutScope = "global" | "list" | "reader" | "research" | "settings";

/** `mod` = Cmd on Mac, Ctrl elsewhere. */
export type ShortcutKey = { key: string; shift?: boolean; mod?: boolean };

export type ShortcutDef = {
  /** e.g. "nav.feed" */
  id: string;
  /** 1 key, or 2 for a sequence like g then f. */
  keys: ShortcutKey[];
  /** e.g. "Go to Feed" */
  label: string;
  /** "Navigation" | "Lists" | "Reading" | ... */
  group: string;
  scope: ShortcutScope;
  /** Ignores the single-key preference (?, Esc, /, mod+/). */
  alwaysOn?: boolean;
};
