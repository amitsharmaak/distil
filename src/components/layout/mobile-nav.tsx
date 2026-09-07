"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Rss, BookmarkPlus, Search, Settings, Sparkles, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/digests", label: "Digests", icon: Sparkles },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ask", label: "Ask", icon: Bot },
  { href: "/save", label: "Save", icon: BookmarkPlus },
  { href: "/research", label: "Research", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav({ showDigests = true }: { showDigests?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom,0px))] items-stretch border-t border-border bg-background pb-safe md:hidden">
      {tabs
        .filter((tab) => tab.href !== "/digests" || showDigests)
        .map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
    </nav>
  );
}
