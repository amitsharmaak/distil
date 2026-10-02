"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  "aria-label": string;
  className?: string;
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const enabled = options.filter((option) => !option.disabled);
  const tabStop = enabled.some((option) => option.value === value) ? value : enabled[0]?.value;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: T) {
    const directions: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const direction = directions[event.key];
    if (direction === undefined && event.key !== "Home" && event.key !== "End") return;
    if (!enabled.length) return;
    event.preventDefault();
    const currentIndex = enabled.findIndex((option) => option.value === current);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : (currentIndex + (direction ?? 0) + enabled.length) % enabled.length;
    const next = enabled[nextIndex].value;
    buttons.current.get(next)?.focus();
    onValueChange(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-lg bg-muted p-1", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          ref={(button) => {
            if (button) buttons.current.set(option.value, button);
            else buttons.current.delete(option.value);
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={option.disabled}
          tabIndex={option.value === tabStop ? 0 : -1}
          onClick={() => onValueChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, option.value)}
          className={cn(
            "min-h-11 min-w-11 flex-1 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
            option.value === value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
