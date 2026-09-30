import type { ShortcutKey } from "./types";

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "submit",
  "checkbox",
  "radio",
  "range",
  "file",
  "color",
]);

/** True when the target is a text-entry element where single-key shortcuts must not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input") return !NON_TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
  if (tag === "textarea" || tag === "select") return true;
  return el.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"]') !== null;
}

/** Whether the platform primary modifier is Cmd (macOS/iOS) rather than Ctrl. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const PUNCTUATION: Record<string, [string, string]> = {
  Slash: ["/", "?"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Comma: [",", "<"],
  Period: [".", ">"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Backquote: ["`", "~"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Backslash: ["\\", "|"],
};

/** Normalise a keydown event; null when it must not match (composing, handled, undeclared modifier). */
export function eventToKey(e: KeyboardEvent): ShortcutKey | null {
  if (e.isComposing || e.defaultPrevented) return null;
  if (e.altKey) return null;
  const mac = isMacPlatform();
  const primary = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  if (other) return null;

  const out: ShortcutKey = { key: "" };
  const k = e.key;
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(k)) return null;
  if (!k || k === "Dead" || k === "Unidentified") {
    // Layout gave no character: fall back to the US physical position.
    const punct = PUNCTUATION[e.code];
    if (!punct) return null;
    out.key = punct[e.shiftKey ? 1 : 0];
  } else if (k.length === 1 && k !== " " && !/[\p{L}\p{N}]/u.test(k)) {
    // Printable punctuation: the layout already folded shift into the character.
    out.key = k;
  } else {
    out.key = k.length === 1 ? k.toLowerCase() : k;
    out.shift = e.shiftKey;
  }
  if (primary) out.mod = true;
  return out;
}

export function keyEquals(a: ShortcutKey, b: ShortcutKey): boolean {
  return a.key === b.key && !!a.shift === !!b.shift && !!a.mod === !!b.mod;
}
