import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-src 'none'",
              "form-action 'self'",
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "script-src-attr 'none'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https: data:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  // SQLite performs WAL/schema initialization at module import time. Keep the
  // page-data worker pool serial until the Phase 1 PostgreSQL cutover removes
  // that build-time contention.
  experimental: {
    cpus: 1,
  },
  /**
   * Mark better-sqlite3 as a server-external package.
   *
   * better-sqlite3 is a native Node.js addon (.node binary). It must only
   * run on the server and must never be bundled into the client-side JS.
   * `serverExternalPackages` is the Next.js 13+ / Turbopack-compatible way
   * to tell the bundler "leave this package alone — require() it at runtime".
   *
   * This replaces the old webpack `externals` approach, which is incompatible
   * with Turbopack (the default bundler in Next.js 16+).
   */
  serverExternalPackages: ["better-sqlite3", "playwright", "playwright-core"],
};

export default nextConfig;
