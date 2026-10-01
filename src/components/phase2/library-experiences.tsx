"use client";

import Link from "next/link";
import { useState } from "react";
import { ArchiveRestore, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CACHE_FRESHNESS,
  useContentCache,
  useContentQuery,
} from "@/lib/client-cache/content-cache";
import type { FeedItem } from "@/lib/feed/feed-query";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok)
    throw new Error(payload.error?.message || "The request could not be completed.");
  return payload;
}

function ItemLink({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/feed/${item.id}`}
      prefetch={false}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-xs text-muted-foreground">{item.publication || item.sourceType}</p>
      <h2 className="mt-1 font-serif text-lg font-semibold">{item.title || "Untitled"}</h2>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
        {item.aiSummary || item.summary || "No summary is available yet."}
      </p>
    </Link>
  );
}

interface ArchiveResponse {
  items: FeedItem[];
}

const ARCHIVE_KEY = ["library", "archive"] as const;

function updatedLabel(updatedAt: number): string {
  if (!updatedAt) return "Not updated yet";
  return `Last updated ${new Date(updatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function ArchiveExperience() {
  const cache = useContentCache();
  const archiveQuery = useContentQuery<ArchiveResponse>({
    key: ARCHIVE_KEY,
    url: "/api/v1/feed?archive=only&sort=recent&limit=100",
    staleTime: CACHE_FRESHNESS.library,
  });
  const items = archiveQuery.data?.items ?? [];
  const loading = archiveQuery.isPending && !archiveQuery.data;
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  async function restore(itemId: string) {
    setRestoring(itemId);
    setMutationError(null);
    const previous = cache.get<ArchiveResponse>(ARCHIVE_KEY);
    cache.set<ArchiveResponse>(ARCHIVE_KEY, (current) => ({
      items: (current?.items ?? []).filter((item) => item.id !== itemId),
    }));
    try {
      await api(`/api/v1/items/${itemId}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      await Promise.all([
        cache.invalidate(["feed"]),
        cache.invalidate(["today"]),
        cache.invalidate(["item"]),
      ]);
    } catch (cause) {
      cache.set(ARCHIVE_KEY, previous);
      setMutationError(cause instanceof Error ? cause.message : "Item could not be restored.");
    } finally {
      setRestoring(null);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Archive</h1>
          <p className="mt-1 text-muted-foreground">Items kept out of your active reading queue.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            disabled={archiveQuery.isFetching}
            onClick={() => void archiveQuery.refetch()}
            aria-label="Refresh archive"
          >
            <RefreshCw className={`h-4 w-4 ${archiveQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {updatedLabel(archiveQuery.dataUpdatedAt)}
          </p>
        </div>
      </header>
      {(mutationError || archiveQuery.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {mutationError ||
            (archiveQuery.data
              ? "Refresh failed. Cached archive is still shown."
              : archiveQuery.error instanceof Error
                ? archiveQuery.error.message
                : "Unable to load archived items.")}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Loading archive…
        </p>
      ) : items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ItemLink item={item} />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11 shrink-0 gap-2"
                disabled={restoring === item.id}
                onClick={() => void restore(item.id)}
              >
                <ArchiveRestore className="h-4 w-4" />
                Restore
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Nothing is archived. Archived items will stay here until you restore them.
        </div>
      )}
    </div>
  );
}
