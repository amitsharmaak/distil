"use client";

import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { usePathname } from "next/navigation";
import {
  Newspaper,
  Rss,
  Settings,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useShortcutsHelp } from "@/components/shortcuts/shortcuts-provider";
import { Kbd } from "@/components/ui/kbd";

const navItems = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/research", label: "Research", icon: FlaskConical, prefetch: false },
  { href: "/save", label: "Save", icon: BookmarkPlus, prefetch: false },
  { href: "/settings", label: "Settings", icon: Settings, prefetch: false },
];

export function Sidebar({
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const pathname = usePathname();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const help = useShortcutsHelp();

  function setCollapsed(next: boolean) {
    if (controlledCollapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  }

  return (
    <aside
      data-collapsed={collapsed}
      className="distil-sidebar fixed left-0 top-0 z-40 hidden h-dvh flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 motion-reduce:transition-none md:flex"
    >
      {/* Brand */}
      <div className="flex h-20 shrink-0 items-center gap-2.5 px-4">
        <BrandMark className="size-7 shrink-0" />
        {!collapsed && (
          <span className="font-serif text-2xl font-semibold tracking-tight text-sidebar-foreground">
            distil
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Sidebar" className="flex-1 space-y-1 px-2 py-2">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.prefetch}
              aria-current={isActive ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "flex min-h-11 min-w-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Keyboard shortcuts */}
      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={() => help.setOpen(true)}
          aria-label={collapsed ? "Keyboard shortcuts" : undefined}
          aria-keyshortcuts="?"
          className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Keyboard className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span>Keyboard shortcuts</span>
              <Kbd className="ml-auto">?</Kbd>
            </>
          )}
        </button>
      </div>

      {/* Theme toggle */}
      <div className="px-2 pb-1">
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* Collapse toggle */}
      <div className="mt-2 border-t border-sidebar-border p-2">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
