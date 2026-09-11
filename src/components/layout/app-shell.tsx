"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

/** Reader routes (`/feed/<id>`) drop the mobile tab bar so only the action bar stays fixed. */
export function isReaderPath(pathname: string): boolean {
  return /^\/feed\/[^/]+$/.test(pathname);
}

export function AppShell({
  children,
  showAnswers = true,
  showSearch = true,
}: {
  children: React.ReactNode;
  showAnswers?: boolean;
  showSearch?: boolean;
}) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (pathname === "/login") {
    return <main className="min-h-screen">{children}</main>;
  }

  const reader = isReaderPath(pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        showAnswers={showAnswers}
        showSearch={showSearch}
      />
      <div
        className={`min-w-0 flex-1 transition-all duration-300 ${
          sidebarCollapsed ? "md:pl-16" : "md:pl-64"
        }`}
      >
        <Topbar showSearch={showSearch} backHref={reader ? "/feed" : undefined} />
        <main
          className={
            reader
              ? "px-4 py-4 sm:px-6 sm:py-6 md:px-8"
              : "px-4 py-4 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-6 md:px-8 md:pb-6"
          }
        >
          {children}
        </main>
        {!reader && <MobileNav />}
      </div>
    </div>
  );
}
