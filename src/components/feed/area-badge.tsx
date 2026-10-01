"use client";

/**
 * The item's life area, fixable in two taps: the badge shows the area, a tap
 * opens the four choices, and a pick is saved at once (optimistically) through
 * `PATCH /api/v1/items/:id/state`. Picking the AI's own area clears Amit's
 * correction. Used inside the feed card (which is a link) and the reader, so
 * every interaction stops the event from reaching an enclosing link.
 */

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AREA_LABELS } from "@/lib/feed/quick-filters";
import { LIFE_AREAS, type LifeArea } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useItemMutation, useItemOverrides } from "@/lib/client-cache/item-mutations";

export interface AreaBadgeProps {
  itemId: string;
  /** Effective area (the correction when set, otherwise the AI's). */
  area?: LifeArea;
  /** The AI's own area, so the menu can mark it and picking it clears the correction. */
  aiArea?: LifeArea;
  /** Reports the saved effective area and whether it is now a correction. */
  onChange?: (next: { area: LifeArea; manualArea?: LifeArea }) => void;
  className?: string;
  /** Controlled open state of the menu; when provided the parent owns it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const stop = (event: React.SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function AreaBadge({
  itemId,
  area,
  aiArea,
  onChange,
  className,
  open,
  onOpenChange,
}: AreaBadgeProps) {
  const { updateItem } = useItemMutation();
  const overrides = useItemOverrides(itemId);
  const effectiveArea = overrides?.area ?? area;
  const [current, setCurrent] = React.useState<LifeArea | undefined>(effectiveArea);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => setCurrent(effectiveArea), [effectiveArea]);

  async function choose(next: LifeArea) {
    if (next === current || saving) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError(false);
    try {
      await updateItem(itemId, { area: next });
      onChange?.({ area: next, manualArea: next === aiArea ? undefined : next });
    } catch {
      setCurrent(previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const label = current ? AREA_LABELS[current] : "Set area";

  return (
    <span className={cn("inline-flex", className)} onClick={stop}>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            aria-label={current ? `Area: ${label}. Change area` : "Set area"}
            aria-busy={saving}
            className={cn(
              "inline-flex h-6 items-center gap-0.5 rounded-full border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              current
                ? "border-border bg-secondary text-secondary-foreground hover:bg-accent"
                : "border-dashed border-border text-muted-foreground hover:bg-accent",
              error && "border-destructive/60 text-destructive"
            )}
          >
            {label}
            <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {error ? "Couldn't save — try again" : "Move to area"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LIFE_AREAS.map((option) => (
            <DropdownMenuItem key={option} onSelect={() => void choose(option)} className="gap-2">
              <Check
                className={cn("h-3.5 w-3.5", option === current ? "opacity-100" : "opacity-0")}
                aria-hidden="true"
              />
              {AREA_LABELS[option]}
              {option === aiArea && (
                <span className="ml-auto text-[10px] text-muted-foreground">AI pick</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
