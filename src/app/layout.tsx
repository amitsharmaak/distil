import type { Metadata } from "next";
import { Newsreader, Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Distil — Your AI Knowledge Companion",
  description:
    "Distil transforms the relentless flow of information into focused, actionable insight.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${newsreader.variable} ${outfit.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider>
        <TooltipProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 md:pl-16 lg:pl-64 transition-all duration-300">
              <Topbar />
              <main className="px-8 py-6 pb-[calc(1.5rem+4rem)] md:pb-6">{children}</main>
              <MobileNav />
            </div>
          </div>
        </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
