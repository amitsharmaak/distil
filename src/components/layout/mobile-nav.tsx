"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Rss, Hash, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/topics", label: "Topics", icon: Hash },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-border bg-background md:hidden">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
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
