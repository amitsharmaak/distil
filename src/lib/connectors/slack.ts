/**
 * Slack source connector.
 *
 * Fetches messages containing URLs from configured Slack channels using
 * the @slack/web-api SDK. Links are extracted, deduplicated against the
 * database, and inserted as ContentItems with sourceType "slack".
 *
 * Configuration:
 * - SLACK_BOT_TOKEN — Bot User OAuth Token (xoxb-...)
 * - SLACK_CHANNELS  — Comma-separated list of channel names or IDs
 *
 * Usage:
 * 1. Create a Slack App with `channels:history`, `channels:read`,
 *    `users:read` scopes (plus `groups:read` and `groups:history` for
 *    private channels). Install it to your workspace.
 * 2. Set `SLACK_BOT_TOKEN` and `SLACK_CHANNELS` in `.env.local`.
 * 3. Call `syncSlackMessages()` from an API route or cron job.
 *
 * ⚠️  SERVER-SIDE ONLY — never import from a "use client" component.
 */

import { WebClient } from "@slack/web-api";

import { config } from "@/lib/config";
import {
  insertItem,
  getItemByNormalizedUrl,
  getUserSetting,
  setUserSetting,
} from "@/lib/db";
import { fetchOG } from "@/lib/og";
import { extractContent } from "@/lib/content-extractor";
import { generateSummary } from "@/lib/ai/summarize";
import { autoTagItem } from "@/lib/ai/tagger";
import { createNotificationIfEnabled } from "@/lib/notifications";
import { isTwitterUrl } from "@/lib/utils";
import type { ContentItem } from "@/lib/types";

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the Slack bot token is configured.
 */
export function isSlackConfigured(): boolean {
  return config.slackBotToken.length > 0;
}

/**
 * Checks whether the configured bot token is valid and returns the
 * workspace name.
 */
export async function getSlackStatus(): Promise<{
  connected: boolean;
  teamName: string | null;
}> {
  if (!isSlackConfigured()) {
    return { connected: false, teamName: null };
  }

  try {
    const client = new WebClient(config.slackBotToken);
    const result = await client.auth.test();
    return { connected: true, teamName: (result.team as string) ?? null };
  } catch {
    return { connected: false, teamName: null };
  }
}

/**
 * Fetches messages containing URLs from configured Slack channels and
 * inserts them as ContentItems.
 *
 * Messages are fetched since the last sync timestamp (stored in
 * user_settings). On the first sync, messages from the last 30 days are
 * fetched. Already-synced URLs are skipped via database deduplication.
 *
 * Returns the array of newly inserted ContentItems.
 */
export async function syncSlackMessages(): Promise<{
  items: ContentItem[];
  unresolvedChannels: string[];
}> {
  if (!isSlackConfigured()) {
    throw new Error("Slack not configured");
  }

  const client = new WebClient(config.slackBotToken);

  // Parse configured channel names/IDs.
  const configuredChannels = config.slackChannels
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Determine the oldest timestamp to fetch from.
  const lastSyncRaw = getUserSetting("slack_last_sync");
  const lastSyncTs = lastSyncRaw
    ? lastSyncRaw
    : String(Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60);

  // Resolve channel names to IDs. Paginate through all results so large
  // workspaces don't silently miss channels beyond the first page.
  // Try to include private channels (requires groups:read scope); fall
  // back to public-only if the scope is missing.
  const nameToId = new Map<string, string>();
  let channelTypes = "public_channel,private_channel";
  let cursor: string | undefined;
  try {
    do {
      const listResult = await client.conversations.list({
        types: channelTypes,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      for (const ch of listResult.channels ?? []) {
        if (ch.name && ch.id) {
          nameToId.set(ch.name, ch.id);
        }
      }
      cursor = listResult.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch (err: unknown) {
    const code = (err as { data?: { error?: string } })?.data?.error;
    if (code === "missing_scope" && channelTypes.includes("private")) {
      // Bot lacks groups:read — retry with public channels only.
      channelTypes = "public_channel";
      cursor = undefined;
      do {
        const listResult = await client.conversations.list({
          types: channelTypes,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
        });
        for (const ch of listResult.channels ?? []) {
          if (ch.name && ch.id) {
            nameToId.set(ch.name, ch.id);
          }
        }
        cursor = listResult.response_metadata?.next_cursor || undefined;
      } while (cursor);
    } else {
      throw err;
    }
  }

  interface ResolvedChannel {
    id: string;
    name: string;
  }

  const resolvedChannels: ResolvedChannel[] = [];
  const unresolvedChannels: string[] = [];
  for (const entry of configuredChannels) {
    if (entry.startsWith("C")) {
      const channelName =
        [...nameToId.entries()].find(([, id]) => id === entry)?.[0] ?? entry;
      resolvedChannels.push({ id: entry, name: channelName });
    } else {
      const channelId = nameToId.get(entry);
      if (channelId) {
        resolvedChannels.push({ id: channelId, name: entry });
      } else {
        unresolvedChannels.push(entry);
      }
    }
  }

  if (unresolvedChannels.length > 0) {
    console.warn(
      `[slack] channels not found: ${unresolvedChannels.join(", ")}. ` +
        `If these are private channels, add groups:read and groups:history ` +
        `scopes to the Slack App, or use channel IDs instead of names.`,
    );
  }

  // User name cache: userId → displayName.
  const userCache = new Map<string, string>();

  const inserted: ContentItem[] = [];

  for (const channel of resolvedChannels) {
    let historyResult;
    try {
      historyResult = await client.conversations.history({
        channel: channel.id,
        oldest: lastSyncTs,
        limit: 200,
      });
    } catch (err: unknown) {
      const code = (err as { data?: { error?: string } })?.data?.error;
      if (code === "not_in_channel") {
        // Auto-join public channels so the bot can read history.
        try {
          await client.conversations.join({ channel: channel.id });
          historyResult = await client.conversations.history({
            channel: channel.id,
            oldest: lastSyncTs,
            limit: 200,
          });
        } catch {
          console.warn(
            `[slack] could not join or read #${channel.name} — invite the bot manually`,
          );
          continue;
        }
      } else {
        console.warn(
          `[slack] failed to read #${channel.name}: ${code ?? err}`,
        );
        continue;
      }
    }

    for (const message of historyResult.messages ?? []) {
      // Extract URLs from message text.
      const textUrls = extractUrls(message.text ?? "");

      // Extract URLs from attachments.
      const attachmentUrls: string[] = [];
      interface SlackAttachment {
        original_url?: string;
        from_url?: string;
        title?: string;
      }
      const attachments = (message.attachments as SlackAttachment[] | undefined) ?? [];
      for (const att of attachments) {
        if (att.original_url && !isSlackUrl(att.original_url)) {
          attachmentUrls.push(att.original_url);
        }
        if (att.from_url && !isSlackUrl(att.from_url)) {
          attachmentUrls.push(att.from_url);
        }
      }

      // Merge and deduplicate URLs.
      const allUrls = [...new Set([...textUrls, ...attachmentUrls])];

      if (allUrls.length === 0) continue;

      // Resolve user display name (cached).
      let author: string | undefined;
      if (message.user) {
        author = await resolveUserName(client, message.user, userCache);
      }

      // Find attachment metadata for title enrichment.
      const firstAttachment = attachments[0];

      for (const url of allUrls) {
        if (getItemByNormalizedUrl(url)) continue;

        // Enrich the URL with OG metadata + full content extraction,
        // same as POST /api/items — treat Slack URLs as first-class items.
        const [og, extraction] = await Promise.all([
          fetchOG(url),
          extractContent(url),
        ]);

        const item: ContentItem = {
          id: crypto.randomUUID(),
          title: og.title ?? firstAttachment?.title ?? url,
          summary: og.description ?? "",
          sourceType: "slack",
          contentType: "article",
          topics: [],
          url,
          priority: "medium",
          isRead: false,
          createdAt: new Date(
            parseFloat(message.ts!) * 1000,
          ).toISOString(),
          author: og.author ?? extraction?.byline ?? author ?? undefined,
          publication: og.siteName ?? undefined,
          thumbnailUrl: og.image ?? undefined,
          fullContent: extraction?.content ?? undefined,
          extractedLinks: extraction?.extractedLinks ?? undefined,
        };

        const newItem = insertItem(item);
        createNotificationIfEnabled(newItem);
        inserted.push(newItem);

        // Fire-and-forget AI summary for non-Twitter long-form content.
        if (!isTwitterUrl(url)) {
          generateSummary(newItem.id, { length: "brief" }).catch((err) => {
            console.error(
              "[slack] Background summary failed:",
              newItem.id,
              err,
            );
          });
        }

        // Fire-and-forget: auto-tag items so topics are content-derived.
        autoTagItem(newItem.id, newItem.title, newItem.summary).catch((err) => {
          console.error("[slack] Background auto-tag failed:", newItem.id, err);
        });
      }
    }
  }

  // Persist the current timestamp so the next sync picks up where we left off.
  setUserSetting("slack_last_sync", String(Math.floor(Date.now() / 1000)));

  return { items: inserted, unresolvedChannels };
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Extracts URLs from Slack-formatted message text.
 *
 * Slack wraps URLs in angle brackets: `<https://example.com>` or
 * `<https://example.com|display text>`. This function pulls out the raw
 * URL portion, filtering out internal Slack URLs.
 *
 * Returns an array of unique, non-Slack URLs.
 */
function extractUrls(text: string): string[] {
  const regex = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g;
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const url = match[1];
    if (!isSlackUrl(url)) {
      urls.add(url);
    }
  }

  return [...urls];
}

/**
 * Returns true if the URL is an internal Slack URL that should be skipped.
 */
function isSlackUrl(url: string): boolean {
  return url.includes("slack.com") || url.includes("slack-redir.net");
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
