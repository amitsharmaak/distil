"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Newspaper,
  Rss,
  Hash,
  Bookmark,
  Plug,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const navItems = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/topics", label: "Topics", icon: Hash },
  { href: "/collections", label: "Collections", icon: Bookmark },
  { href: "/sources", label: "Sources", icon: Plug },
  { href: "/research", label: "Research", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 hidden h-screen md:flex flex-col border-r bg-sidebar text-sidebar-foreground border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <Image
          src="/logo.png"
          alt="Distil logo"
          width={28}
          height={28}
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
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/45 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/75",
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
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent/50"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
