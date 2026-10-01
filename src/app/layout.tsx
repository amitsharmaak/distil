import type { Metadata, Viewport } from "next";
import { Newsreader, Outfit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { AppShell } from "@/components/layout/lazy-app-shell";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";
import { loadClientCacheScope } from "@/lib/server-render/cache-scope";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  applicationName: "Distil",
  title: "Distil — Your AI Knowledge Companion",
  description: "Save articles and turn them into focused, actionable insight.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Distil" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const accountKey = await loadClientCacheScope();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{document.documentElement.classList.toggle("dark",localStorage.theme==="dark")}catch{}',
          }}
        />
      </head>
      <body className={`${newsreader.variable} ${outfit.variable} font-sans antialiased`}>
        <ThemeProvider>
          <ContentCacheProvider accountKey={accountKey}>
            <AppShell>{children}</AppShell>
          </ContentCacheProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
