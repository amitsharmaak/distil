"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function Topbar({
  backHref,
}: {
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
        <ThemeToggle collapsed registerShortcut={false} className="h-11 w-11 md:h-9 md:w-9" />
      </div>
    </header>
  );
}
