/**
 * Slack source connector.
 *
 * Uses Slack's User OAuth flow (xoxp tokens). The app acts AS the authenticated
 * user, which means it can read every public channel, private channel, DM and
 * group DM the user is already a member of — with NO per-channel bot
 * invitations and no static channel allow-list.
 *
 * Configuration:
 * - SLACK_CLIENT_ID / SLACK_CLIENT_SECRET — registered Slack App credentials
 * - SLACK_REDIRECT_URI — must match a Redirect URL on the Slack App
 * - SLACK_CHANNELS — comma-separated allowlist of channel names/IDs to sync;
 *   if unset or empty, sync is skipped entirely
 *
 * Required User Token Scopes (set on the Slack App):
 *   channels:history, channels:read,
 *   groups:history,   groups:read,
 *   im:history,       im:read,
 *   mpim:history,     mpim:read,
 *   users:read
 *
 * Flow:
 * 1. User clicks "Connect Slack" → /api/auth/slack redirects to Slack's
 *    consent screen (built by `getAuthUrl`).
 * 2. Slack redirects back to /api/auth/slack/callback with `?code=...`.
 * 3. `handleCallback` exchanges the code via oauth.v2.access, extracts the
 *    user-scoped xoxp token from `authed_user.access_token`, and persists it.
 * 4. `syncSlackMessages` enumerates every conversation the user belongs to via
 *    `users.conversations` and pulls new history.
 *
 * ⚠️  SERVER-SIDE ONLY — never import from a "use client" component.
 */

import { WebClient } from "@slack/web-api";

import { config } from "@/lib/config";
import { connectorLogger } from "@/lib/logger";
import {
  getOAuthToken,
  getOAuthTokensByProvider,
  upsertOAuthToken,
  deleteOAuthToken,
  getUserSetting,
  setUserSetting,
  type OAuthTokenRow,
} from "@/lib/db";
import { buildRawContent, processContent } from "@/lib/intelligence/pipeline";
import { sanitizeUrl } from "@/lib/utils";
import type { ProcessingResult } from "@/lib/intelligence/types";

const PROVIDER = "slack";

// User Token Scopes — these grant the xoxp token access to read every
// conversation type the user belongs to.
const SLACK_USER_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "users:read",
];

// Conversation types to enumerate via users.conversations.
const CONVERSATION_TYPES = "public_channel,private_channel,mpim,im";

// ── OAuth ──────────────────────────────────────────────────────────────────────

/**
 * Returns the Slack authorization URL to redirect the user to.
 *
 * Note: User Token Scopes are passed via `user_scope` (NOT `scope`). Slack
 * treats `scope` as bot scopes; using it would issue a bot token instead.
 */
export function getAuthUrl(state?: string): string {
  if (!config.slackClientId) {
    throw new Error("SLACK_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    client_id: config.slackClientId,
    user_scope: SLACK_USER_SCOPES.join(","),
    redirect_uri: config.slackRedirectUri,
  });
  if (state) params.set("state", state);
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  team?: { id?: string; name?: string };
  authed_user?: {
    id?: string;
    access_token?: string;
    token_type?: string;
    scope?: string;
  };
}

/**
 * Exchanges an authorization code for a user OAuth token and persists it.
 * Called once by /api/auth/slack/callback.
 */
export async function handleCallback(code: string): Promise<void> {
  if (!config.slackClientId || !config.slackClientSecret) {
    throw new Error("Slack OAuth credentials are not configured");
  }

  const body = new URLSearchParams({
    client_id: config.slackClientId,
    client_secret: config.slackClientSecret,
    code,
    redirect_uri: config.slackRedirectUri,
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as SlackOAuthV2Response;

  if (!data.ok || !data.authed_user?.access_token) {
    throw new Error(`Slack OAuth exchange failed: ${data.error ?? "unknown"}`);
  }

  const teamId = data.team?.id ?? "";
  const teamName = data.team?.name ?? "";
  const userId = data.authed_user.id ?? "";
  const identity = teamName && userId ? `${teamName}:${userId}` : (teamName || userId || null);

  upsertOAuthToken(PROVIDER, teamId, {
    access_token: data.authed_user.access_token,
    refresh_token: null, // Slack user tokens don't expire by default.
    expiry_date: null,
    email: identity,
  });

  // Clear the watermark for this workspace so the next sync uses the full lookback window.
  setUserSetting(syncKey(teamId), "0");
}

/** Per-workspace sync watermark key. Handles legacy '' team_id from pre-migration tokens. */
function syncKey(teamId: string): string {
  return teamId ? `slack_last_sync_${teamId}` : "slack_last_sync";
}

export interface SlackWorkspaceStatus {
  teamId: string;
  teamName: string | null;
  userName: string | null;
  connected: boolean;
  lastSync: string | null;
}

/**
 * Returns true if at least one Slack workspace is connected.
 */
export function isSlackConfigured(): boolean {
  return getOAuthTokensByProvider(PROVIDER).length > 0;
}

/**
 * Disconnects a specific Slack workspace by teamId.
 * Best-effort token revocation, then removes the local row.
 */
export async function disconnectSlack(teamId: string): Promise<void> {
  const stored = getOAuthToken(PROVIDER, teamId);
  if (stored) {
    try {
      const client = new WebClient(stored.access_token);
      await client.auth.revoke();
    } catch {
      // Token may already be revoked or network may be flaky — drop it locally regardless.
    }
  }
  deleteOAuthToken(PROVIDER, teamId);
}

/**
 * Returns status for all connected Slack workspaces.
 */
export async function getAllSlackStatuses(): Promise<SlackWorkspaceStatus[]> {
  const tokens = getOAuthTokensByProvider(PROVIDER);
  if (tokens.length === 0) return [];

  return Promise.all(
    tokens.map(async (token) => {
      const lastSyncRaw = getUserSetting(syncKey(token.team_id));
      const lastSync =
        lastSyncRaw && Number(lastSyncRaw) > 0
          ? new Date(Number(lastSyncRaw) * 1000).toISOString()
          : token.updated_at;
      try {
        const client = new WebClient(token.access_token);
        const result = await client.auth.test();
        return {
          teamId: token.team_id,
          teamName: (result.team as string) ?? null,
          userName: (result.user as string) ?? null,
          connected: true,
          lastSync,
        };
      } catch {
        return { teamId: token.team_id, teamName: null, userName: null, connected: false, lastSync };
      }
    }),
  );
}

/** @deprecated Use getAllSlackStatuses() */
export async function getSlackStatus(): Promise<{
  connected: boolean;
  teamName: string | null;
  userName: string | null;
}> {
  const statuses = await getAllSlackStatuses();
  if (statuses.length === 0) return { connected: false, teamName: null, userName: null };
  const first = statuses[0];
  return { connected: first.connected, teamName: first.teamName, userName: first.userName };
}

// ── Sync ───────────────────────────────────────────────────────────────────────

interface ResolvedConversation {
  id: string;
  name: string;
  type: "public_channel" | "private_channel" | "mpim" | "im";
}

/**
 * Fetches messages containing URLs from all connected Slack workspaces and
 * processes them through the Unified Intelligence Layer.
 */
export async function syncSlackMessages(): Promise<{
  count: number;
  items: ProcessingResult[];
  stats: { channels: number; messagesScanned: number; messagesWithUrls: number };
}> {
  const tokens = getOAuthTokensByProvider(PROVIDER);
  if (tokens.length === 0) throw new Error("Slack not connected");

  const allItems: ProcessingResult[] = [];
  let totalChannels = 0;
  let totalMessagesScanned = 0;
  let totalMessagesWithUrls = 0;

  for (const token of tokens) {
    const result = await syncWorkspace(token);
    allItems.push(...result.items);
    totalChannels += result.stats.channels;
    totalMessagesScanned += result.stats.messagesScanned;
    totalMessagesWithUrls += result.stats.messagesWithUrls;
  }

  const count = allItems.filter((r) => r.status !== "rejected").length;
  const stats = { channels: totalChannels, messagesScanned: totalMessagesScanned, messagesWithUrls: totalMessagesWithUrls };
  connectorLogger.info({ workspaces: tokens.length, ...stats, kept: count }, "Slack sync completed");
  return { count, items: allItems, stats };
}

/**
 * Syncs a single Slack workspace token.
 */
async function syncWorkspace(token: OAuthTokenRow): Promise<{
  items: ProcessingResult[];
  stats: { channels: number; messagesScanned: number; messagesWithUrls: number };
}> {
  const client = new WebClient(token.access_token);
  const key = syncKey(token.team_id);

  // Stamp the watermark at the START of the sync so a partial/killed run still
  // advances. Messages arriving mid-sync in an already-read channel are caught next run.
  const syncStartTs = String(Math.floor(Date.now() / 1000));

  // Cap first-sync window to the last 7 days.
  const sevenDaysAgoTs = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  // Fall back to legacy key for tokens migrated from before multi-workspace support.
  const lastSyncRaw = getUserSetting(key) ?? getUserSetting("slack_last_sync");
  const lastSyncTs =
    lastSyncRaw && Number(lastSyncRaw) > sevenDaysAgoTs
      ? lastSyncRaw
      : String(sevenDaysAgoTs);

  const conversations: ResolvedConversation[] = [];
  let cursor: string | undefined;
  do {
    const list = await client.users.conversations({
      types: CONVERSATION_TYPES,
      exclude_archived: true,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const ch of list.channels ?? []) {
      if (!ch.id) continue;
      const type = ch.is_im
        ? "im"
        : ch.is_mpim
          ? "mpim"
          : ch.is_private
            ? "private_channel"
            : "public_channel";
      conversations.push({ id: ch.id, name: ch.name ?? "", type: type as ResolvedConversation["type"] });
    }
    cursor = list.response_metadata?.next_cursor || undefined;
  } while (cursor);

  const allowlist = config.slackChannels;
  if (allowlist.length === 0) {
    connectorLogger.info(
      { teamId: token.team_id },
      "SLACK_CHANNELS not configured — skipping sync. Set SLACK_CHANNELS to an allowlist of channel names.",
    );
    return { items: [], stats: { channels: 0, messagesScanned: 0, messagesWithUrls: 0 } };
  }
  const filteredConversations = conversations.filter((c) => {
    const name = c.name.toLowerCase();
    const id = c.id.toLowerCase();
    return allowlist.includes(name) || allowlist.includes(id);
  });

  const userCache = new Map<string, string>();
  const results: ProcessingResult[] = [];
  let messagesScanned = 0;
  let messagesWithUrls = 0;

  try {
    for (const conv of filteredConversations) {
      const channelLabel =
        (await resolveConversationLabel(client, conv, userCache)) || conv.id;

      let historyCursor: string | undefined;
      do {
        let historyResult;
        try {
          historyResult = await client.conversations.history({
            channel: conv.id,
            oldest: lastSyncTs,
            limit: 200,
            ...(historyCursor ? { cursor: historyCursor } : {}),
          });
        } catch (err: unknown) {
          const code = (err as { data?: { error?: string } })?.data?.error;
          connectorLogger.warn(
            { channel: channelLabel, teamId: token.team_id, err: code ?? err },
            "Failed to read Slack conversation",
          );
          break;
        }

        for (const message of historyResult.messages ?? []) {
          const subtype = (message as { subtype?: string }).subtype;
          if (subtype === "message_changed" || subtype === "message_deleted") continue;

          messagesScanned++;

          const textUrls = extractUrls(message.text ?? "");

          interface SlackAttachment { original_url?: string; from_url?: string; }
          const attachmentUrls: string[] = [];
          const attachments = (message.attachments as SlackAttachment[] | undefined) ?? [];
          for (const att of attachments) {
            if (att.original_url && !isSlackUrl(att.original_url)) attachmentUrls.push(sanitizeUrl(att.original_url));
            if (att.from_url && !isSlackUrl(att.from_url)) attachmentUrls.push(sanitizeUrl(att.from_url));
          }

          const blockUrls = extractUrlsFromBlocks((message.blocks as unknown[]) ?? []);
          const allUrls = [...new Set([...textUrls, ...attachmentUrls, ...blockUrls])].filter((u) => !isSlackUrl(u));
          if (allUrls.length === 0) continue;

          messagesWithUrls++;
          let authorName: string | undefined;
          if (message.user) authorName = await resolveUserName(client, message.user, userCache);

          const timestamp = new Date(parseFloat(message.ts!) * 1000).toISOString();

          for (const url of allUrls) {
            try {
              const raw = buildRawContent({
                sourceType: "slack",
                rawBody: message.text ?? "",
                url,
                metadata: { channelName: channelLabel, authorName, timestamp },
              });
              results.push(await processContent(raw));
            } catch (err) {
              connectorLogger.error({ err, url, channel: channelLabel }, "Failed to process Slack URL");
            }
          }
        }

        historyCursor = historyResult.response_metadata?.next_cursor || undefined;
      } while (historyCursor);
    }
  } finally {
    setUserSetting(key, syncStartTs);
  }

  return {
    items: results,
    stats: { channels: filteredConversations.length, messagesScanned, messagesWithUrls },
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for a conversation. Public/private channels
 * already carry a name; IMs and MPIMs need member names looked up.
 */
async function resolveConversationLabel(
  client: WebClient,
  conv: ResolvedConversation,
  userCache: Map<string, string>,
): Promise<string> {
  if (conv.name) return conv.name;

  try {
    const info = await client.conversations.info({ channel: conv.id });
    const ch = info.channel as
      | {
          name?: string;
          user?: string;
          is_im?: boolean;
          is_mpim?: boolean;
        }
      | undefined;
    if (ch?.name) return ch.name;

    if (ch?.is_im && ch.user) {
      const peer = await resolveUserName(client, ch.user, userCache);
      return peer ? `DM: ${peer}` : `DM: ${ch.user}`;
    }

    if (ch?.is_mpim) {
      const members = await client.conversations.members({ channel: conv.id });
      const names = await Promise.all(
        (members.members ?? [])
          .slice(0, 6)
          .map((u) => resolveUserName(client, u, userCache).then((n) => n ?? u)),
      );
      return `Group DM: ${names.join(", ")}`;
    }
  } catch {
    // Fall through to id.
  }
  return conv.id;
}

/**
 * Extracts URLs from Slack-formatted message text.
 *
 * Slack wraps URLs in angle brackets: `<https://example.com>` or
 * `<https://example.com|display text>`. Internal Slack URLs are filtered out.
 */
function extractUrls(text: string): string[] {
  const regex = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g;
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const url = sanitizeUrl(match[1]);
    if (!isSlackUrl(url)) {
      urls.add(url);
    }
  }

  return [...urls];
}

function isSlackUrl(url: string): boolean {
  return url.includes("slack.com") || url.includes("slack-redir.net");
}

/**
 * Recursively walks Slack Block Kit JSON and collects every `url` field found
 * on `link` elements (rich_text) and `accessory`/`action` blocks. This covers
 * the majority of URLs that don't appear in `message.text` angle-bracket form.
 */
function extractUrlsFromBlocks(blocks: unknown[]): string[] {
  const urls: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "link" && typeof obj.url === "string") {
      urls.push(sanitizeUrl(obj.url));
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) val.forEach(walk);
      else if (val && typeof val === "object") walk(val);
    }
  }

  blocks.forEach(walk);
  return [...new Set(urls)];
}

/**
 * Resolves a Slack user ID to a display name, using a cache to avoid
 * redundant API calls. Returns undefined if the lookup fails.
 */
async function resolveUserName(
  client: WebClient,
  userId: string,
  cache: Map<string, string>,
): Promise<string | undefined> {
  if (cache.has(userId)) {
    return cache.get(userId);
  }

  try {
    const result = await client.users.info({ user: userId });
    const displayName =
      result.user?.profile?.display_name ||
      result.user?.real_name ||
      result.user?.name ||
      undefined;
    if (displayName) {
      cache.set(userId, displayName);
    }
    return displayName;
  } catch {
    return undefined;
  }
}
