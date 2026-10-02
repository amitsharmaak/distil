"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ShortcutsHelpDialog } from "@/components/shortcuts/shortcuts-help-dialog";
import { useGlobalShortcuts } from "@/components/shortcuts/use-global-shortcuts";

/** Reader routes (`/feed/<id>`) use a quiet shell with navigation available on demand. */
export function isReaderPath(pathname: string): boolean {
  return /^\/feed\/[^/]+$/.test(pathname);
}

function GlobalShortcuts({ toggleSidebar }: { toggleSidebar: () => void }) {
  useGlobalShortcuts(toggleSidebar);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reader = isReaderPath(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [readerNavigationVisible, setReaderNavigationVisible] = useState(false);
  const toggleSidebar = useCallback(() => {
    if (reader) setReaderNavigationVisible((visible) => !visible);
    else setSidebarCollapsed((collapsed) => !collapsed);
  }, [reader]);

  if (
    pathname === "/login" ||
    pathname === "/sign-in" ||
    pathname === "/invite" ||
    pathname === "/reset-password" ||
    pathname === "/access-denied" ||
    pathname === "/privacy"
  ) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <ShortcutsProvider>
      <GlobalShortcuts toggleSidebar={toggleSidebar} />
      <ShortcutsHelpDialog />
      <div
        className="distil-shell flex min-h-screen"
        data-reader={reader}
        data-reader-navigation={readerNavigationVisible}
      >
        <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
        <div
          data-sidebar-collapsed={sidebarCollapsed}
          className="distil-shell-content min-w-0 flex-1 transition-[padding-left] duration-200 motion-reduce:transition-none"
        >
          <Topbar backHref={reader ? "/feed" : undefined} />
          <main
            className={
              reader
                ? "px-4 py-5 sm:px-6 sm:py-8 md:px-8"
                : "px-4 py-5 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-8 md:px-8 md:pb-8"
            }
          >
            {children}
          </main>
          {!reader && <MobileNav />}
        </div>
      </div>
    </ShortcutsProvider>
  );
}
