"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

export function ThemeToggle({
  collapsed,
  className,
}: {
  collapsed?: boolean;
  /** Overrides the sidebar-oriented default layout (full width, sidebar colours). */
  className?: string;
}) {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "justify-center gap-2",
        className ??
          "w-full text-sidebar-foreground/65 hover:text-sidebar-foreground/85 hover:bg-sidebar-accent/50"
      )}
      onClick={toggle}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 shrink-0" />
      ) : (
        <Moon className="h-4 w-4 shrink-0" />
      )}
      {!collapsed && (
        <span className="text-[13px] font-medium">
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </span>
      )}
    </Button>
  );
}
