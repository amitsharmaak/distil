"use client";

/**
 * The Feed's reading-mode pills: All · Personal · Work · Learning · Updates,
 * one selected at a time, directly under the Feed header. The row writes the
 * same `area` URL parameter the Filters sheet's Area control reads, so the two
 * never disagree. One row, horizontally scrollable, so it fits a 360px phone
 * without wrapping. Keys `1`–`5` pick a pill from anywhere on the Feed.
 */

import * as React from "react";

import { pillClass, rowClass } from "@/components/feed/filter-bar";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import { AREA_OPTIONS } from "@/lib/feed/quick-filters";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import type { LifeArea } from "@/lib/types";
import { cn } from "@/lib/utils";

export const AREA_PILLS_LABEL = "Reading mode";

export interface AreaPillsProps {
  /** The selected area; `undefined` is All. */
  value: LifeArea | undefined;
  onSelect: (area: LifeArea | undefined) => void;
}

const areaShortcut = (index: number): ShortcutDef => ({
  id: `list.area.${AREA_OPTIONS[index].value ?? "all"}`,
  keys: [{ key: String(index + 1) }],
  label: AREA_OPTIONS[index].value ? `Show ${AREA_OPTIONS[index].label}` : "Show all areas",
  group: "Reading mode",
  scope: "list",
});

/** `1`–`5` select the pills in row order; the Feed registers these beside its list shortcuts. */
export const AREA_SHORTCUTS: ShortcutDef[] = AREA_OPTIONS.map((_, index) => areaShortcut(index));

export function useAreaShortcuts(onSelect: AreaPillsProps["onSelect"]): void {
  // One hook call per pill; the row is fixed at five, so the order never changes.
  useShortcut(AREA_SHORTCUTS[0], () => onSelect(AREA_OPTIONS[0].value));
  useShortcut(AREA_SHORTCUTS[1], () => onSelect(AREA_OPTIONS[1].value));
  useShortcut(AREA_SHORTCUTS[2], () => onSelect(AREA_OPTIONS[2].value));
  useShortcut(AREA_SHORTCUTS[3], () => onSelect(AREA_OPTIONS[3].value));
  useShortcut(AREA_SHORTCUTS[4], () => onSelect(AREA_OPTIONS[4].value));
}

export function AreaPills({ value, onSelect }: AreaPillsProps) {
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const key = (area: LifeArea | undefined) => area ?? "all";
  const selectedIndex = Math.max(
    0,
    AREA_OPTIONS.findIndex((option) => option.value === value)
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const direction = step[event.key];
    if (direction === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = AREA_OPTIONS.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : (index + (direction ?? 0) + AREA_OPTIONS.length) % AREA_OPTIONS.length;
    const next = AREA_OPTIONS[nextIndex].value;
    buttons.current.get(key(next))?.focus();
    onSelect(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={AREA_PILLS_LABEL}
      // On phones the row bleeds to the screen edges so all five pills fit at 360px.
      className={cn(rowClass, "-mx-4 px-4 sm:-mx-1 sm:px-1")}
    >
      {AREA_OPTIONS.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={key(option.value)}
            ref={(button) => {
              if (button) buttons.current.set(key(option.value), button);
              else buttons.current.delete(key(option.value));
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            // Slightly tighter on phones so all five fit at 360px; identical to the chips from sm up.
            className={cn(pillClass(selected), "px-2.5 sm:px-3")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
