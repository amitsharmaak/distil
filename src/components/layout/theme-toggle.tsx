"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-center gap-2 text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent/50"
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
