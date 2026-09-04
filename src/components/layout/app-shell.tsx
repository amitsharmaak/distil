"use client";

import { usePathname } from "next/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1 transition-all duration-300 md:pl-16 lg:pl-64">
        <Topbar />
        <main className="px-4 py-4 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-6 md:px-8 md:pb-6">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
