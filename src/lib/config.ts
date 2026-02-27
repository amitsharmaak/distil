/**
 * Central application configuration.
 *
 * All environment variables are read, validated, and exported from this
 * single module. Server-side code imports the full `config` object.
 * Client-side code may only access `NEXT_PUBLIC_*` variables (exposed
 * via the `apiBaseUrl` field below).
 *
 * To add a new configuration value:
 * 1. Add the env variable to `.env.example` with a description.
 * 2. Add it here with a sensible default.
 * 3. Document it in CLAUDE.md under "Environment Variables".
 */

export const config = {
  /**
   * Absolute or relative path to the SQLite database file.
   * Defaults to `./data/pia.db` relative to the project root.
   *
   * Override with DB_PATH env var for cloud deployments that mount
   * a persistent volume (e.g. DB_PATH=/mnt/data/pia.db).
   *
   * In tests this is overridden to ":memory:" for an in-memory DB.
   */
  dbPath: process.env.DB_PATH ?? "./data/pia.db",

  /**
   * Base URL for API calls made from client components (browser).
   * Must be a NEXT_PUBLIC_ variable so it is included in the client bundle.
   *
   * Defaults to localhost:3000 for local development.
   * Set NEXT_PUBLIC_API_BASE_URL to your deployed domain in production.
   */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000",

  /**
   * Current Node environment: "development", "test", or "production".
   * Used to gate dev-only behavior (e.g. verbose logging).
   */
  env: process.env.NODE_ENV ?? "development",
} as const;
