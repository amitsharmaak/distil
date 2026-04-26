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
   * Defaults to `./data/distil.db` relative to the project root.
   *
   * Override with DB_PATH env var for cloud deployments that mount
   * a persistent volume (e.g. DB_PATH=/mnt/data/distil.db).
   *
   * In tests this is overridden to ":memory:" for an in-memory DB.
   */
  dbPath: process.env.DB_PATH ?? "./data/distil.db",

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

  /**
   * Google OAuth2 credentials for Gmail integration.
   * Obtain from Google Cloud Console → APIs & Services → Credentials.
   * NEVER commit real values — store in .env.local only.
   */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",

  /**
   * Must exactly match the redirect URI registered in Google Cloud Console.
   */
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    "http://localhost:3000/api/auth/gmail/callback",

  /**
   * Google Gemini API key for AI integration.
   * Used for summarization, prioritization, preference learning, and deep research.
   * Obtain from https://aistudio.google.com/app/apikey
   * NEVER commit real values — store in .env.local only.
   */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",

  /**
   * OpenAI API key for GPT models.
   * Obtain from https://platform.openai.com/api-keys
   * NEVER commit real values — store in .env.local only.
   */
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",

  /**
   * Anthropic API key for Claude models.
   * Obtain from https://console.anthropic.com/settings/keys
   * NEVER commit real values — store in .env.local only.
   */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",

  /**
   * Slack Bot Token (xoxb-...) for reading channel messages.
   * Obtain from https://api.slack.com/apps after creating a Slack App.
   * Required scopes: channels:history, channels:read, users:read.
   * NEVER commit real values — store in .env.local only.
   */
  slackBotToken: process.env.SLACK_BOT_TOKEN ?? "",

  /**
   * Comma-separated list of Slack channel names to monitor for shared links.
   * Example: "general,engineering,random"
   */
  slackChannels: process.env.SLACK_CHANNELS ?? "",

  /**
   * Password required to wipe all data via DELETE /api/data.
   * Set DISTIL_DELETE_PASSWORD in .env.local to enable the danger-zone reset.
   */
  deletePassword: process.env.DISTIL_DELETE_PASSWORD ?? "",

  /**
   * How often (in hours) to automatically sync Gmail and Slack in the background.
   * The scheduler checks every 15 minutes and triggers a sync when this interval
   * has elapsed since the last successful sync. Defaults to 3 hours.
   *
   * Also exposed as NEXT_PUBLIC_SYNC_INTERVAL_HOURS for display in the UI.
   */
  syncIntervalHours: parseInt(process.env.SYNC_INTERVAL_HOURS ?? "3", 10),

  /**
   * Directory where per-publisher Playwright persisted contexts are stored.
   * Each publisher gets a subdirectory keyed by its id (e.g. data/publisher-sessions/the-ken/).
   */
  publisherSessionDir:
    process.env.PUBLISHER_SESSION_DIR ?? "data/publisher-sessions",

  /**
   * Optional comma-separated list of publisher ids to enable.
   * Empty/undefined enables all registered publishers.
   */
  publishersEnabled: (process.env.PUBLISHERS_ENABLED ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;
