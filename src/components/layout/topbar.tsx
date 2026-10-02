"use client";

import { IntentLink as Link } from "@/components/navigation/intent-link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { DistilLogo } from "@/components/brand/distil-logo";

const BACK_U: ShortcutDef = {
  id: "reader.back",
  keys: [{ key: "u" }],
  label: "Back to list",
  group: "Reading",
  scope: "reader",
};
const BACK_ESC: ShortcutDef = {
  id: "reader.back.esc",
  keys: [{ key: "Escape" }],
  label: "Back to list",
  group: "Reading",
  scope: "reader",
  alwaysOn: true,
};

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Today";
  if (/^\/feed\/[^/]+$/.test(pathname)) return "Reading";
  if (pathname.startsWith("/research/")) return "Research";
  const titles: Record<string, string> = {
    "/feed": "Feed",
    "/save": "Save",
    "/settings": "Settings",
    "/research": "Research",
    "/archive": "Archive",
    "/digests": "Digests",
    "/account": "Account",
    "/onboarding": "Welcome",
  };
  return titles[pathname] ?? "Distil";
}

/** Compact navigation; reader controls scroll away with the page at every width. */
export function Topbar({
  backHref,
}: {
  /** When set, a "Back to feed" link replaces the logo on small screens. */
  backHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const goBack = () => {
    if (backHref) router.push(backHref);
  };
  useShortcut(BACK_U, goBack, !!backHref);
  useShortcut(BACK_ESC, goBack, !!backHref);

  return (
    <header
      className={
        backHref
          ? "distil-topbar mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6"
          : "distil-topbar sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden"
      }
    >
      {backHref ? (
        <Link
          href={backHref}
          aria-keyshortcuts="u Escape"
          title="Back to feed · U"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to feed
        </Link>
      ) : (
        <Link
          href="/"
          aria-label="Distil home"
          className="inline-flex min-h-11 shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <DistilLogo className="h-7 w-auto text-foreground" />
        </Link>
      )}
      {!backHref && (
        <span className="border-l border-border pl-3 text-sm font-medium text-muted-foreground">
          {pageTitle(pathname)}
        </span>
      )}
      <ThemeToggle
        collapsed
        registerShortcut={false}
        className="ml-auto size-11 text-muted-foreground hover:bg-muted hover:text-foreground"
      />
    </header>
  );
}
