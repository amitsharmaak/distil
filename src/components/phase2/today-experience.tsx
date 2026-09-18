"use client";

import { useEffect, useState } from "react";

import type { FeedItem } from "@/lib/feed/feed-query";
import { TODAY_FEED_QUERY, todaySections, type TodaySections } from "@/lib/feed/today-selection";
import { TodayPrototype } from "./today-prototype";

type FeedResponse = {
  items?: FeedItem[];
  resurfacedItems?: FeedItem[];
  error?: { message?: string };
};

async function getFeed(): Promise<FeedResponse> {
  const query = new URLSearchParams(TODAY_FEED_QUERY);
  const response = await fetch(`/api/v1/feed?${query.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as FeedResponse;
  if (!response.ok) throw new Error(payload.error?.message || "Unable to load your reading queue.");
  return payload;
}

/**
 * Today's sections. With `initial` (the server page has already run the
 * read) this is purely presentational. Without it (no server-side user, the
 * legacy SQLite path, or `FEATURE_SERVER_RENDER=false`) it fetches the same
 * selection from the API, as the pre-P5 page did. Selection stays
 * deliberately conservative until the durable digest/resurfacing worker
 * lands: it shows unread items that have been left unopened for at least
 * two weeks.
 */
export function TodayExperience({ initial }: { initial?: TodaySections | null } = {}) {
  const [sections, setSections] = useState<TodaySections | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const payload = await getFeed();
        if (!cancelled) setSections(todaySections(payload));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Today.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [initial]);

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
  if (!sections) {
    return (
      <div className="py-12 text-center text-muted-foreground" role="status">
        Loading Today…
      </div>
    );
  }
  return <TodayPrototype priority={sections.priority} revisiting={sections.revisiting} />;
}
