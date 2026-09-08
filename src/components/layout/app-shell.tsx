"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function AppShell({
  children,
  showAnswers = true,
  showDigests = true,
  showKnowledgeUi = true,
  showSearch = true,
}: {
  children: React.ReactNode;
  showAnswers?: boolean;
  showDigests?: boolean;
  showKnowledgeUi?: boolean;
  showSearch?: boolean;
}) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (pathname === "/login") {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        showAnswers={showAnswers}
        showDigests={showDigests}
        showKnowledgeUi={showKnowledgeUi}
        showSearch={showSearch}
      />
      <div
        className={`min-w-0 flex-1 transition-all duration-300 ${
          sidebarCollapsed ? "md:pl-16" : "md:pl-64"
        }`}
      >
        <Topbar />
        <main className="px-4 py-4 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-6 md:px-8 md:pb-6">
          {children}
        </main>
        <MobileNav showAnswers={showAnswers} showDigests={showDigests} showSearch={showSearch} />
      </div>
    </div>
  );
}
