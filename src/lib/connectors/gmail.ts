/**
 * Gmail source connector.
 *
 * Handles OAuth2 authorization and email sync for the Gmail integration.
 * Content is fed into the Unified Intelligence Layer pipeline for processing.
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
import { runGmailSenderDiscovery } from "@/lib/connectors/publishers/discovery/gmail-sender";
import { getOAuthToken, upsertOAuthToken, deleteOAuthToken } from "@/lib/db";
import { buildRawContent, processContent } from "@/lib/intelligence/pipeline";
import { connectorLogger } from "@/lib/logger";
import { sanitizeUrl } from "@/lib/utils";
import type { ProcessingResult } from "@/lib/intelligence/types";

// Gmail API scope — read-only access is all we need.
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

// Returns a Gmail date string (YYYY/MM/DD) capped to at most 2 days ago.
// GMAIL_SYNC_AFTER_DATE is honoured only if it is more recent than 2 days ago.
function getSyncAfterDate(): string {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const configured = process.env.GMAIL_SYNC_AFTER_DATE
    ? new Date(process.env.GMAIL_SYNC_AFTER_DATE.replace(/\//g, "-"))
    : null;

  const cutoff =
    configured && configured > twoDaysAgo ? configured : twoDaysAgo;

  return `${cutoff.getFullYear()}/${String(cutoff.getMonth() + 1).padStart(2, "0")}/${String(cutoff.getDate()).padStart(2, "0")}`;
}

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
 * Disconnects Gmail by revoking the token with Google and deleting it from the DB.
 * Best-effort revocation — the local token is always deleted even if the
 * Google revoke call fails (e.g. token already expired/revoked).
 */
export async function disconnectGmail(): Promise<void> {
  const stored = getOAuthToken("gmail");
  if (stored) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: stored.access_token });
    try {
      await oauth2Client.revokeToken(stored.access_token);
    } catch {
      // Token may already be expired or revoked — that's fine.
    }
  }
  deleteOAuthToken("gmail");
}

const MAX_MESSAGES_PER_SYNC = 500;

/**
 * Cheap triage on Gmail metadata — skip obvious non-newsletter mail before
 * downloading full MIME bodies.
 */
function triageGmailMessageForNewsletter(
  labelIds: string[],
  headers: gmail_v1.Schema$MessagePartHeader[],
): "skip" | "fetch_full" {
  const get = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    "";

  const listUnsub = get("List-Unsubscribe");
  const listId = get("List-Id");
  const precedence = get("Precedence").toLowerCase();
  const autoSub = get("Auto-Submitted").toLowerCase();

  const hasListSignal = !!(listUnsub || listId);
  const bulkLike =
    precedence.includes("bulk") ||
    precedence.includes("list") ||
    autoSub.includes("auto-generated");

  if (labelIds.includes("CATEGORY_SOCIAL")) {
    return "skip";
  }

  if (hasListSignal || bulkLike) {
    return "fetch_full";
  }

  if (
    labelIds.includes("CATEGORY_UPDATES") ||
    labelIds.includes("CATEGORY_FORUMS") ||
    labelIds.includes("CATEGORY_PROMOTIONS")
  ) {
    return "fetch_full";
  }

  if (labelIds.includes("CATEGORY_PERSONAL")) {
    return "skip";
  }

  return "fetch_full";
}

/**
 * Fetches emails from Gmail and processes them through the Unified Intelligence Layer.
 *
 * Lists messages in the sync window, triages metadata to skip non-newsletter mail,
 * then fetches full bodies only for candidates. Relevance + allowed categories
 * still apply in the pipeline.
 *
 * Returns the count of processed (non-rejected) items and their results.
 */
export async function syncNewsletters(): Promise<{
  count: number;
  items: ProcessingResult[];
}> {
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

  const query = `after:${getSyncAfterDate()}`;

  const messageIds: string[] = [];
  let pageToken: string | undefined;
  while (messageIds.length < MAX_MESSAGES_PER_SYNC) {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken,
    });
    const batch = listResponse.data.messages ?? [];
    for (const m of batch) {
      if (m.id) messageIds.push(m.id);
    }
    pageToken = listResponse.data.nextPageToken ?? undefined;
    if (!pageToken || batch.length === 0) break;
  }

  const results: ProcessingResult[] = [];

  for (const msgId of messageIds) {
    try {
      const meta = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "metadata",
        metadataHeaders: [
          "Subject",
          "From",
          "To",
          "Date",
          "List-Unsubscribe",
          "List-Id",
          "Precedence",
          "Auto-Submitted",
        ],
      });

      const labelIds = meta.data.labelIds ?? [];
      const headers = meta.data.payload?.headers ?? [];
      if (triageGmailMessageForNewsletter(labelIds, headers) === "skip") {
        continue;
      }

      const full = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "full",
      });

      const raw = buildRawContentFromMessage(full.data, msgId);

      // Fan out to publisher discovery (e.g. The Ken digest → enqueue Ken URLs).
      // Kept fully out-of-band: any failure here MUST NOT break Gmail sync.
      try {
        const headers = full.data.payload?.headers ?? [];
        const getHeader = (name: string): string =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
            ?.value ?? "";
        const from = getHeader("From");
        const subject = getHeader("Subject");
        const html = findHtmlPart(full.data.payload) ?? undefined;
        const body = findTextPart(full.data.payload) ?? undefined;
        if (from) {
          runGmailSenderDiscovery({ from, body, html, subject });
        }
      } catch (err) {
        connectorLogger.warn(
          { err, msgId },
          "[gmail] publisher discovery failed (non-fatal)",
        );
      }

      const result = await processContent(raw);
      results.push(result);
    } catch (err) {
      console.error(`[gmail] Failed to process message ${msgId}:`, err);
    }
  }

  const count = results.filter((r) => r.status !== "rejected").length;
  return { count, items: results };
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Builds a RawContent object from a Gmail message for the intelligence pipeline.
 */
function buildRawContentFromMessage(
  message: gmail_v1.Schema$Message,
  messageId: string,
) {
  const headers = message.payload?.headers ?? [];

  const getHeader = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    "";

  const subject = getHeader("Subject");
  const from = getHeader("From");
  const date = getHeader("Date");
  const to = getHeader("To");
  const listUnsubscribe = getHeader("List-Unsubscribe");
  const listId = getHeader("List-Id");
  const precedence = getHeader("Precedence");
  const autoSubmitted = getHeader("Auto-Submitted");

  // Parse sender domain from "Display Name <email@domain.com>" or bare "email@domain.com".
  const nameAngleMatch = from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  const senderDomain =
    nameAngleMatch?.[2].match(/@([^\s>]+)/)?.[1] ??
    from.match(/@([^\s>]+)/)?.[1] ??
    "";

  const textBody = findTextPart(message.payload);
  const htmlBody = findHtmlPart(message.payload);
  const rawBody = htmlBody?.trim() || textBody?.trim() || "";
  const rawTextContent = textBody?.trim() || (htmlBody ? stripHtml(htmlBody) : undefined);

  // Extract URL: view-in-browser link, OR first https link in first 3000 chars, OR Gmail URL.
  const viewInBrowserUrl = htmlBody ? extractViewInBrowserUrl(htmlBody) : null;
  const firstHttpsUrl = htmlBody ? extractFirstHttpsUrl(htmlBody) : null;
  const url = sanitizeUrl(
    viewInBrowserUrl ??
    firstHttpsUrl ??
    `https://mail.google.com/mail/u/0/#inbox/${messageId}`,
  );

  const timestamp =
    message.internalDate != null
      ? new Date(Number(message.internalDate)).toISOString()
      : date
        ? new Date(date).toISOString()
        : new Date().toISOString();

  const keyHeaders: Record<string, string> = {};
  if (from) keyHeaders.From = from;
  if (to) keyHeaders.To = to;
  if (subject) keyHeaders.Subject = subject;
  if (date) keyHeaders.Date = date;
  if (listUnsubscribe) keyHeaders["List-Unsubscribe"] = listUnsubscribe;
  if (listId) keyHeaders["List-Id"] = listId;
  if (precedence) keyHeaders.Precedence = precedence;
  if (autoSubmitted) keyHeaders["Auto-Submitted"] = autoSubmitted;

  return buildRawContent({
    sourceType: "gmail",
    rawBody,
    rawTextContent,
    url,
    metadata: {
      subject: subject.trim() || undefined,
      sender: from || undefined,
      senderDomain: senderDomain || undefined,
      timestamp,
      headers: keyHeaders,
      labels: message.labelIds ?? [],
    },
  });
}

/**
 * Extracts the first https:// link from the first 3000 chars of HTML.
 * Used as fallback when no explicit "view in browser" link is found.
 */
function extractFirstHttpsUrl(html: string): string | null {
  const head = html.slice(0, 3000);
  const match = head.match(/href=["'](https:\/\/[^"']+)["']/i);
  return match?.[1] ?? null;
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
