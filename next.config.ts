import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
