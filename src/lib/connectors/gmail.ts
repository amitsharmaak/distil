/**
 * Gmail source connector.
 *
 * Handles OAuth2 authorization and newsletter sync for the Gmail integration.
 *
 * ⚠️  SERVER-SIDE ONLY — never import from a "use client" component.
 *
 * Flow:
 * 1. User clicks "Connect Gmail" → browser navigates to /api/auth/gmail
 * 2. Server redirects to Google OAuth consent screen (getAuthUrl)
 * 3. Google redirects back to /api/auth/gmail/callback with a `code`
 * 4. handleCallback exchanges the code for tokens and stores them in DB
 * 5. User clicks "Sync Now" → POST /api/gmail/sync calls syncNewsletters()
 */

import { google, gmail_v1 } from "googleapis";

import { config } from "@/lib/config";
import {
  getOAuthToken,
  upsertOAuthToken,
  insertItem,
  getItemByNormalizedUrl,
} from "@/lib/db";
import { createNotificationIfEnabled } from "@/lib/notifications";
import { sanitizeUrl } from "@/lib/utils";
import type { ContentItem, Priority } from "@/lib/types";

// Gmail API scope — read-only access is all we need.
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

// Add sender email addresses here to include them in the sync.
const NEWSLETTER_SENDERS = [
  "info@yourstory.com",
];

// Earliest date to fetch emails from (YYYY/MM/DD).
const SYNC_AFTER_DATE = "2026/02/01";

// Gmail system label IDs that should not be used as topics.
const SYSTEM_LABELS = new Set([
  "INBOX",
  "SENT",
  "DRAFTS",
  "SPAM",
  "TRASH",
  "STARRED",
  "IMPORTANT",
  "UNREAD",
  "CATEGORY_PERSONAL",
  "CATEGORY_SOCIAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
]);

// ── OAuth2 client factory ──────────────────────────────────────────────────────

/**
 * Creates a fresh OAuth2 client on each call.
 * Not a singleton — tokens must be set per-request to avoid stale credentials.
 */
function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the Google OAuth2 authorization URL to redirect the user to.
 *
 * - `access_type: "offline"` → Google returns a refresh_token on first auth.
 * - `prompt: "consent"` → Forces the consent screen every time so we always
 *   receive a refresh_token (omitting this can skip it on re-authorization).
 */
export function getAuthUrl(): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
  });
}

/**
 * Exchanges an authorization code for OAuth tokens and persists them.
 * Called once by the /api/auth/gmail/callback route.
 *
 * Throws if the code is invalid, expired, or a network error occurs.
 */
export async function handleCallback(code: string): Promise<void> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Fetch the authenticated user's email address to display in the UI.
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress ?? null;

  upsertOAuthToken("gmail", {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token ?? null,
    expiry_date: tokens.expiry_date ?? null,
    email,
  });
}

/**
 * Returns the connected Gmail address, or null if Gmail is not connected.
 */
export function getConnectedEmail(): string | null {
  const token = getOAuthToken("gmail");
  return token?.email ?? null;
}

/**
 * Fetches newsletters from Gmail and inserts them as ContentItems.
 *
 * Only emails with a `List-Unsubscribe` header are fetched (newsletters,
 * digests, and subscription emails). Already-synced items are skipped via
 * URL-based deduplication.
 *
 * Returns the array of newly inserted ContentItems.
 */
export async function syncNewsletters(): Promise<ContentItem[]> {
  const tokenRow = getOAuthToken("gmail");
  if (!tokenRow) throw new Error("Gmail not connected");

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token ?? undefined,
    expiry_date: tokenRow.expiry_date ?? undefined,
  });

  // Persist refreshed tokens automatically when googleapis refreshes them.
  oauth2Client.on("tokens", (newTokens) => {
    if (newTokens.access_token) {
      upsertOAuthToken("gmail", {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token ?? tokenRow.refresh_token,
        expiry_date: newTokens.expiry_date ?? tokenRow.expiry_date,
        email: tokenRow.email,
      });
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Build query from the allowed senders list.
  const fromClause = NEWSLETTER_SENDERS.map((s) => `from:${s}`).join(" OR ");
  const query = `(${fromClause}) after:${SYNC_AFTER_DATE}`;

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 100,
  });

  const messages = listResponse.data.messages ?? [];
  const inserted: ContentItem[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const item = buildContentItem(full.data, msg.id);
    if (!item) continue;

    // Skip if a ContentItem with this URL already exists (normalized dedup).
    if (getItemByNormalizedUrl(item.url)) continue;

    const newItem = insertItem(item);
    createNotificationIfEnabled(newItem);
    inserted.push(newItem);
  }

  return inserted;
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Transforms a raw Gmail message into a ContentItem.
 * Returns null if the message cannot be meaningfully transformed.
 */
function buildContentItem(
  message: gmail_v1.Schema$Message,
  messageId: string,
): ContentItem | null {
  const headers = message.payload?.headers ?? [];

  const getHeader = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    "";

  const subject = getHeader("Subject");
  const from = getHeader("From");
  const date = getHeader("Date");

  const title = subject.trim() || "(no subject)";
  const summary = message.snippet?.trim() ?? "";

  // Parse "Display Name <email@domain.com>" or bare "email@domain.com".
  const nameAngleMatch = from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  const author = nameAngleMatch ? nameAngleMatch[1].trim() : from.split("@")[0];
  const emailDomain =
    nameAngleMatch?.[2].match(/@([^\s>]+)/)?.[1] ??
    from.match(/@([^\s>]+)/)?.[1] ??
    "";
  // Strip common newsletter subdomain prefixes for a cleaner publication name.
  const publication = emailDomain.replace(
    /^(mail|newsletter|noreply|news|info|hello|hi|reply|support)\./i,
    "",
  );

  // Extract the email body for fullContent.
  // Prefer plain text; fall back to HTML with tags stripped.
  const textBody = findTextPart(message.payload);
  const htmlBody = findHtmlPart(message.payload);
  const fullContent =
    textBody?.trim() ||
    (htmlBody ? stripHtml(htmlBody) : undefined);

  // Try to extract a "view in browser" URL from the HTML body.
  const viewInBrowserUrl = htmlBody
    ? extractViewInBrowserUrl(htmlBody)
    : null;
  // Fallback: use the Gmail web URL for this message.
  const url = sanitizeUrl(
    viewInBrowserUrl ??
    `https://mail.google.com/mail/u/0/#inbox/${messageId}`,
  );

  const labelIds = message.labelIds ?? [];
  const isImportant = labelIds.includes("IMPORTANT");
  const isUnread = labelIds.includes("UNREAD");

  // Only keep user-defined labels (non-system) as topics.
  const topics = labelIds.filter((id) => !SYSTEM_LABELS.has(id));

  const createdAt = date
    ? new Date(date).toISOString()
    : new Date().toISOString();

  const priority: Priority = isImportant ? "high" : "medium";

  return {
    id: crypto.randomUUID(),
    title,
    summary,
    fullContent,
    sourceType: "gmail",
    contentType: "article",
    topics,
    author,
    publication,
    url,
    priority,
    isRead: !isUnread,
    createdAt,
  };
}

/**
 * Recursively searches a MIME message payload for the first text/plain part.
 * Returns the decoded string, or null if no plain text part is found.
 */
function findTextPart(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string | null {
  if (!payload) return null;
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  for (const part of payload.parts ?? []) {
    const found = findTextPart(part);
    if (found) return found;
  }
  return null;
}

/**
 * Strips HTML tags and decodes common entities to produce readable plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Recursively searches a MIME message payload for the first text/html part.
 * Returns the decoded HTML string, or null if no HTML part is found.
 */
function findHtmlPart(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string | null {
  if (!payload) return null;
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  for (const part of payload.parts ?? []) {
    const found = findHtmlPart(part);
    if (found) return found;
  }
  return null;
}

/**
 * Searches the first 3000 characters of the HTML for a "view in browser" link.
 * Newsletters almost always include one near the top of the email.
 *
 * Returns the href URL, or null if none is found.
 */
function extractViewInBrowserUrl(html: string): string | null {
  const head = html.slice(0, 3000);

  // Pattern 1: href before the link text (e.g. <a href="...">View in browser</a>)
  const beforeMatch = head.match(
    /href=["'](https?:\/\/[^"']+)["'][^>]*>[^<]*(?:view|browser|web\s+version|online)/i,
  );
  if (beforeMatch?.[1]) return beforeMatch[1];

  // Pattern 2: link text before the href (e.g. View online <a href="...">)
  const afterMatch = head.match(
    /(?:view|browser|web\s+version|online)[^<]*<[^>]*href=["'](https?:\/\/[^"']+)["']/i,
  );
  if (afterMatch?.[1]) return afterMatch[1];

  return null;
}
