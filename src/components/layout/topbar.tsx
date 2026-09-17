"use client";

import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function Topbar({
  showSearch = true,
  backHref,
}: {
  showSearch?: boolean;
  /** When set, a "Back to feed" link replaces the date on small screens. */
  backHref?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 sm:px-6 md:px-8 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:h-9"
        >
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
      ) : (
        <span className="hidden text-[13px] text-muted-foreground md:block">{formatDate()}</span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {showSearch && (
          <Link
            href="/search"
            aria-label="Search"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:h-9 md:w-9"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>
        )}
        <ThemeToggle collapsed className="h-11 w-11 md:h-9 md:w-9" />
      </div>
    </header>
  );
}
