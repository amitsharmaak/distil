"use client";

import { useEffect, useState } from "react";

import { toPlainText } from "@/lib/format";
import type { FeedItem } from "@/lib/feed/feed-query";
import { TodayPrototype } from "./today-prototype";
import type { KnowledgeItem } from "./types";

type FeedResponse = {
  items?: FeedItem[];
  resurfacedItems?: FeedItem[];
  error?: { message?: string };
};

function sourceName(item: FeedItem): string {
  return item.publication || item.author || item.sourceType;
}

function toKnowledgeItem(item: FeedItem): KnowledgeItem {
  return {
    id: item.id,
    title: item.title || "Untitled",
    summary: toPlainText(item.aiSummary || item.summary) || "No summary is available yet.",
    source: sourceName(item),
    href: `/feed/${item.id}`,
    isRead: item.isRead,
    reason: item.rank.reasons[0] || "Saved for your reading queue",
  };
}

async function getFeed(): Promise<FeedResponse> {
  const query = new URLSearchParams({
    sort: "priority",
    read: "false",
    limit: "6",
    resurface: "stale",
  });
  const response = await fetch(`/api/v1/feed?${query.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as FeedResponse;
  if (!response.ok) throw new Error(payload.error?.message || "Unable to load your reading queue.");
  return payload;
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
        const payload = await getFeed();
        if (cancelled) return;
        setPriority((payload.items ?? []).map(toKnowledgeItem));
        setRevisiting(
          (payload.resurfacedItems ?? []).map((item) => ({
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
