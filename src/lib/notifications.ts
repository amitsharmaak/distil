/**
 * Notification helper — creates in-app notifications based on user preferences.
 *
 * Currently supports one notification type: high-priority item alerts.
 * Called after item insertion in API routes and source connectors.
 *
 * ⚠️  SERVER-SIDE ONLY — never import this from a "use client" component.
 */

import { getUserSetting, insertNotification } from "./db";
import type { ContentItem } from "./types";

/**
 * Creates an in-app notification for a high-priority item if the user
 * has the preference enabled (defaults to enabled when no preference is stored).
 */
export function createNotificationIfEnabled(item: ContentItem): void {
  if (item.priority !== "high") return;

  const pref = getUserSetting("notification_high_priority");
  // Default to enabled if no preference has been saved yet.
  const enabled = pref === undefined ? true : pref === "true";
  if (!enabled) return;

  insertNotification({
    id: crypto.randomUUID(),
    itemId: item.id,
    title: `High-priority: ${item.title}`,
    message: (item.summary ?? "").slice(0, 120),
  });
}
