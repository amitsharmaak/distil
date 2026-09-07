"use client";

import { useEffect, useState } from "react";

import { config } from "@/lib/config";
import type { FeedItem } from "@/lib/feed/feed-query";
import { TodayPrototype } from "./today-prototype";
import type { KnowledgeItem } from "./types";

type FeedResponse = { items?: FeedItem[]; error?: { message?: string } };

function sourceName(item: FeedItem): string {
  return item.publication || item.author || item.sourceType;
}

function toKnowledgeItem(item: FeedItem): KnowledgeItem {
  return {
    id: item.id,
    title: item.title || "Untitled",
    summary: item.aiSummary || item.summary || "No summary is available yet.",
    source: sourceName(item),
    href: `/feed/${item.id}`,
    isRead: item.isRead,
    reason: item.rank.reasons[0] || "Saved for your reading queue",
  };
}

async function getFeed(query: URLSearchParams): Promise<FeedItem[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/feed?${query.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as FeedResponse;
  if (!response.ok) throw new Error(payload.error?.message || "Unable to load your reading queue.");
  return payload.items ?? [];
}

/**
 * The API-backed shell around the Wave 0 Today presentation.  Selection stays
 * deliberately conservative until the durable digest/resurfacing worker lands:
 * it shows unread items that have been left unopened for at least two weeks.
 */
export function TodayExperience() {
  const [priority, setPriority] = useState<KnowledgeItem[]>([]);
  const [revisiting, setRevisiting] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [priorityItems, recentItems] = await Promise.all([
          getFeed(new URLSearchParams({ sort: "priority", read: "false", limit: "6" })),
          getFeed(new URLSearchParams({ sort: "recent", archive: "exclude", limit: "100" })),
        ]);
        if (cancelled) return;
        const staleAfter = Date.now() - 14 * 24 * 60 * 60 * 1000;
        setPriority(priorityItems.map(toKnowledgeItem));
        setRevisiting(
          recentItems
            .filter(
              (item) =>
                !item.isRead &&
                item.lastOpenedAt &&
                new Date(item.lastOpenedAt).getTime() <= staleAfter
            )
            .slice(0, 3)
            .map((item) => ({
              ...toKnowledgeItem(item),
              reason: "Unopened for two weeks · worth another look",
            }))
        );
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Today.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground" role="status">
        Loading Today…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="mx-auto max-w-3xl rounded-xl border border-destructive/40 p-5 text-sm"
        role="alert"
      >
        <p className="font-medium">Today is unavailable</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
      </div>
    );
  }
  return <TodayPrototype priority={priority} revisiting={revisiting} />;
}
