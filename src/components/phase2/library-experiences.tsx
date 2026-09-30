"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";
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

export function ArchiveExperience() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api<{ items: FeedItem[] }>("/api/v1/feed?archive=only&sort=recent&limit=100")
      .then((payload) => {
        if (!cancelled) setItems(payload.items);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to load archived items.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function restore(itemId: string) {
    setRestoring(itemId);
    setError(null);
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== itemId));
    try {
      await api(`/api/v1/items/${itemId}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
    } catch (cause) {
      setItems(previous);
      setError(cause instanceof Error ? cause.message : "Item could not be restored.");
    } finally {
      setRestoring(null);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Archive</h1>
        <p className="mt-1 text-muted-foreground">Items kept out of your active reading queue.</p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
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
