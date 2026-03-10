import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PIA — Personal Information Aggregator",
  description: "Your intelligent information hub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TooltipProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 pl-64 transition-all duration-300">
              <Topbar />
              <main className="p-6">{children}</main>
            </div>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
