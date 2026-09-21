"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Newspaper,
  Rss,
  Search,
  Settings,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Bot,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const navItems = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ask", label: "Ask", icon: Bot },
  { href: "/research", label: "Research", icon: FlaskConical },
  { href: "/save", label: "Save", icon: BookmarkPlus },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  collapsed: controlledCollapsed,
  onCollapsedChange,
  showAnswers = true,
  showSearch = true,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  showAnswers?: boolean;
  showSearch?: boolean;
}) {
  const pathname = usePathname();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;

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
        <Image
          src="/logo.svg"
          alt="Distil logo"
          width={28}
          height={28}
          sizes="(max-width: 768px) 32px, 64px"
          className="h-7 w-7 rounded-md object-cover"
        />
        {!collapsed && (
          <span className="font-serif text-lg font-semibold tracking-tight text-sidebar-foreground">
            distil
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems
          .filter((item) => {
            if (item.href === "/search") return showSearch;
            if (item.href === "/ask") return showAnswers;
            return true;
          })
          .map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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
