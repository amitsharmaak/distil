"use client";

import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import { useTheme } from "./theme-provider";

const THEME_SHORTCUT: ShortcutDef = {
  id: "theme.toggle",
  keys: [{ key: "t", shift: true }],
  label: "Toggle theme",
  group: "General",
  scope: "global",
};

function ThemeShortcut({ toggle }: { toggle: () => void }) {
  useShortcut(THEME_SHORTCUT, toggle);
  return null;
}

export function ThemeToggle({
  collapsed,
  className,
  registerShortcut = true,
}: {
  collapsed?: boolean;
  /** Overrides the sidebar-oriented default layout (full width, sidebar colours). */
  className?: string;
  /** Only one mounted toggle should own Shift+T. */
  registerShortcut?: boolean;
}) {
  const { toggle } = useTheme();
  return (
    <>
      {registerShortcut && <ThemeShortcut toggle={toggle} />}
      <button
        type="button"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className ??
            "w-full text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
        )}
        onClick={toggle}
        aria-label="Toggle theme"
        aria-keyshortcuts="Shift+T"
      >
        <Sun aria-hidden="true" className="distil-theme-light h-4 w-4 shrink-0" />
        <Moon aria-hidden="true" className="distil-theme-dark h-4 w-4 shrink-0" />
        {!collapsed && (
          <span className="text-sm font-medium">
            <span className="distil-theme-light">Light mode</span>
            <span className="distil-theme-dark">Dark mode</span>
          </span>
        )}
      </button>
    </>
  );
}
