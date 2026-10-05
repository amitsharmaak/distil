"use client";

import { DistilLogo } from "@/components/brand/distil-logo";
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
import { IntentLink, ResearchListIntentLink } from "@/components/navigation/intent-link";

const navItems = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/research", label: "Research", icon: FlaskConical },
  { href: "/save", label: "Save", icon: BookmarkPlus },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * One row layout for the navigation and the footer controls, so their icons and labels share a
 * left edge when expanded and sit centred in the rail when collapsed.
 */
function rowClass(collapsed: boolean, active = false): string {
  return cn(
    "flex min-h-11 min-w-11 w-full items-center justify-start gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    collapsed && "justify-center px-0",
    active
      ? "bg-sidebar-accent text-sidebar-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
  );
}

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
      {/* Brand. Expanded, the mark's ink shares the nav icons' left edge (nav px-2 + row px-3 =
          20 px; the mark's ink starts 0.2 px inside its box). Collapsed, the compact mark is
          centred in the rail like the icons. */}
      <div
        className={cn(
          "flex h-20 shrink-0 items-center",
          collapsed ? "justify-center px-0" : "px-5"
        )}
      >
        <DistilLogo compact={collapsed} className="h-7 w-auto shrink-0 text-sidebar-foreground" />
      </div>

      {/* Navigation */}
      <nav aria-label="Sidebar" className="flex-1 space-y-1 px-2 py-2">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const NavLink = item.href === "/research" ? ResearchListIntentLink : IntentLink;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={rowClass(collapsed, isActive)}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Keyboard shortcuts */}
      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={() => help.setOpen(true)}
          // The full name does not fit the expanded width beside the key hint, so the visible
          // label is the short form and the accessible name stays complete.
          aria-label="Keyboard shortcuts"
          aria-keyshortcuts="?"
          className={rowClass(collapsed)}
        >
          <Keyboard className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="min-w-0 truncate">Shortcuts</span>
              <Kbd className="ml-auto shrink-0">?</Kbd>
            </>
          )}
        </button>
      </div>

      {/* Theme toggle */}
      <div className="px-2 pb-1">
        <ThemeToggle collapsed={collapsed} className={rowClass(collapsed)} />
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
