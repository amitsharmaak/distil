"use client";

import Link from "next/link";
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
      className={cn(
        "fixed left-0 top-0 z-40 hidden min-h-screen md:flex flex-col border-r bg-sidebar text-sidebar-foreground border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <DistilLogo compact={collapsed} className="h-7 w-auto shrink-0 text-sidebar-foreground" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Keyboard shortcuts */}
      <div className="px-3 pb-1">
        <button
          type="button"
          onClick={() => help.setOpen(true)}
          aria-label={collapsed ? "Keyboard shortcuts" : undefined}
          aria-keyshortcuts="?"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Keyboard className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span>Keyboard shortcuts</span>
              <Kbd className="ml-auto">?</Kbd>
            </>
          )}
        </button>
      </div>

      {/* Theme toggle */}
      <div className="px-3 pb-1">
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          className="inline-flex h-8 w-full items-center justify-center rounded-md text-sidebar-foreground/30 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
