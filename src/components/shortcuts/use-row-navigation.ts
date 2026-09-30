"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import { useShortcut } from "./shortcuts-provider";

export type RowNavigationOptions = {
  /** `r` on the focused row; the shortcut is registered only when provided. */
  onMarkRead?: (itemId: string) => void;
  /** `a` on the focused row; registered only when provided. */
  onOpenArea?: (itemId: string) => void;
  /** Default true; passes through to useShortcut. */
  enabled?: boolean;
};

const list = { group: "Lists", scope: "list" } as const;
const NEXT: ShortcutDef = { id: "list.next", keys: [{ key: "j" }], label: "Next item", ...list };
const PREV: ShortcutDef = {
  id: "list.prev",
  keys: [{ key: "k" }],
  label: "Previous item",
  ...list,
};
const OPEN: ShortcutDef = { id: "list.open", keys: [{ key: "o" }], label: "Open item", ...list };
const MARK_READ: ShortcutDef = {
  id: "list.markRead",
  keys: [{ key: "r" }],
  label: "Mark as read",
  ...list,
};
const AREA: ShortcutDef = {
  id: "list.area",
  keys: [{ key: "a" }],
  label: "Change life area",
  ...list,
};

function rowLink(row: Element): HTMLElement | null {
  return row.querySelector<HTMLElement>("a[href]");
}

export function useRowNavigation(
  containerRef: React.RefObject<HTMLElement | null>,
  options: RowNavigationOptions = {}
): { focusedItemId: () => string | null; focusRow: (itemId: string) => boolean } {
  const { onMarkRead, onOpenArea, enabled = true } = options;
  const markReadRef = useRef(onMarkRead);
  const areaRef = useRef(onOpenArea);
  useEffect(() => {
    markReadRef.current = onMarkRead;
    areaRef.current = onOpenArea;
  });

  const rows = useCallback(
    (): HTMLElement[] =>
      Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []),
    [containerRef]
  );

  const focusedRow = useCallback((): HTMLElement | null => {
    const active = document.activeElement;
    if (!active) return null;
    return rows().find((row) => row.contains(active)) ?? null;
  }, [rows]);

  const focusedItemId = useCallback(
    (): string | null => focusedRow()?.getAttribute("data-item-id") ?? null,
    [focusedRow]
  );

  const focusAt = useCallback((row: HTMLElement | undefined) => {
    const link = row ? rowLink(row) : null;
    if (!link) return false;
    link.focus();
    link.scrollIntoView?.({ block: "nearest" });
    return true;
  }, []);

  const focusRow = useCallback(
    (itemId: string): boolean =>
      focusAt(rows().find((row) => row.getAttribute("data-item-id") === itemId)),
    [rows, focusAt]
  );

  const next = useCallback(() => {
    const all = rows();
    const current = focusedRow();
    const index = current ? all.indexOf(current) : -1;
    if (index >= 0 && index === all.length - 1) {
      const more = containerRef.current?.querySelector<HTMLElement>("[data-load-more]");
      if (more) {
        more.click();
        more.focus();
      }
      return;
    }
    focusAt(all[index + 1]);
  }, [rows, focusedRow, focusAt, containerRef]);

  const prev = useCallback(() => {
    const all = rows();
    const current = focusedRow();
    const index = current ? all.indexOf(current) : -1;
    focusAt(all[Math.max(index - 1, 0)]);
  }, [rows, focusedRow, focusAt]);

  const open = useCallback(() => {
    const current = focusedRow();
    if (current) rowLink(current)?.click();
  }, [focusedRow]);

  const markRead = useCallback(() => {
    const id = focusedItemId();
    if (id) markReadRef.current?.(id);
  }, [focusedItemId]);

  const area = useCallback(() => {
    const id = focusedItemId();
    if (id) areaRef.current?.(id);
  }, [focusedItemId]);

  useShortcut(NEXT, next, enabled);
  useShortcut(PREV, prev, enabled);
  useShortcut(OPEN, open, enabled);
  useShortcut(MARK_READ, markRead, enabled && Boolean(onMarkRead));
  useShortcut(AREA, area, enabled && Boolean(onOpenArea));

  return { focusedItemId, focusRow };
}
