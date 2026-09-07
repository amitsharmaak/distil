"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArchiveRestore, FolderPlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import type { FeedItem } from "@/lib/feed/feed-query";

type Collection = { id: string; name: string; description?: string };
type CollectionDetail = { collection: Collection; items: Array<{ itemId: string }> };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, init);
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

export function CollectionsExperience() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void api<{ collections: Collection[] }>("/api/v1/collections")
      .then((payload) => {
        if (!cancelled) setCollections(payload.collections);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to load collections.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const payload = await api<{ collection: Collection }>("/api/v1/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setCollections((current) => [...current, payload.collection]);
      setName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Collection could not be created.");
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Collections</h1>
        <p className="mt-1 text-muted-foreground">
          Deliberate reading threads, separate from automatically inferred topics.
        </p>
      </header>
      <form
        onSubmit={create}
        className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row"
      >
        <label className="sr-only" htmlFor="collection-name">
          Collection name
        </label>
        <input
          id="collection-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          placeholder="e.g. Product strategy"
          className="min-h-11 flex-1 rounded-md border bg-background px-3 text-base"
        />
        <Button type="submit" disabled={!name.trim() || creating} className="min-h-11 gap-2">
          <FolderPlus className="h-4 w-4" />
          Create collection
        </Button>
      </form>
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
          Loading collections…
        </p>
      ) : collections.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/collections/${collection.id}`}
                className="block min-h-28 rounded-xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h2 className="font-serif text-lg font-semibold">{collection.name}</h2>
                {collection.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Create a collection for a project, question, or reading thread you want to return to.
        </div>
      )}
    </div>
  );
}

export function CollectionDetailExperience({ collectionId }: { collectionId: string }) {
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const found = await api<CollectionDetail>(`/api/v1/collections/${collectionId}`);
        const all = await api<{ items: FeedItem[] }>(
          `/api/v1/feed?archive=include&collection=${encodeURIComponent(collectionId)}&sort=recent&limit=100`
        );
        if (!cancelled) {
          setDetail(found);
          setItems(all.items);
        }
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to load this collection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);
  async function remove(itemId: string) {
    setRemoving(itemId);
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== itemId));
    try {
      await api(`/api/v1/collections/${collectionId}/items/${itemId}`, { method: "DELETE" });
    } catch (cause) {
      setItems(previous);
      setError(cause instanceof Error ? cause.message : "Item could not be removed.");
    } finally {
      setRemoving(null);
    }
  }
  if (loading)
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Loading collection…
      </p>
    );
  if (!detail)
    return (
      <div
        className="mx-auto max-w-3xl rounded-xl border border-destructive/40 p-5 text-sm"
        role="alert"
      >
        {error || "Collection not found."}
      </div>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/collections" className="text-sm text-muted-foreground hover:text-foreground">
          ← Collections
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold">{detail.collection.name}</h1>
        {detail.collection.description && (
          <p className="mt-1 text-muted-foreground">{detail.collection.description}</p>
        )}
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ItemLink item={item} />
              </div>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 min-h-11 shrink-0"
                disabled={removing === item.id}
                onClick={() => void remove(item.id)}
                aria-label={`Remove ${item.title} from collection`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          No items in this collection yet. Add them from a reader.
        </div>
      )}
    </div>
  );
}
