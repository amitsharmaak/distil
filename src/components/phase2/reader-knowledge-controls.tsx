"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, BookmarkPlus, NotebookPen, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import type { Priority } from "@/lib/types";

type ReaderState = {
  isRead: boolean;
  archived: boolean;
  readingProgress: number;
  manualPriority: Priority | null;
};
type Collection = { id: string; name: string; description?: string };
type CollectionDetail = { collection: Collection; items: Array<{ itemId: string }> };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "This change could not be saved.");
  return payload;
}

export function ReaderKnowledgeControls({ itemId }: { itemId: string }) {
  const [state, setState] = useState<ReaderState | null>(null);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statePayload, notePayload, collectionPayload] = await Promise.all([
          requestJson<{ state: ReaderState }>(`/api/v1/items/${itemId}/state`),
          requestJson<{ note: { body: string } | null }>(`/api/v1/items/${itemId}/note`),
          requestJson<{ collections: Collection[] }>("/api/v1/collections"),
        ]);
        const details = await Promise.all(
          collectionPayload.collections.map((collection) =>
            requestJson<CollectionDetail>(`/api/v1/collections/${collection.id}`)
          )
        );
        if (cancelled) return;
        setState(statePayload.state);
        const body = notePayload.note?.body ?? "";
        setNote(body);
        setSavedNote(body);
        setCollections(collectionPayload.collections);
        setMemberIds(
          new Set(
            details
              .filter((detail) => detail.items.some((item) => item.itemId === itemId))
              .map((detail) => detail.collection.id)
          )
        );
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to load reader controls.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const dirty = note !== savedNote;
  const progressLabel = useMemo(() => (state?.readingProgress ?? 0) * 100, [state]);

  async function updateState(patch: Partial<ReaderState>, label: string) {
    if (!state || saving) return;
    const previous = state;
    setState({ ...state, ...patch });
    setSaving(label);
    setError(null);
    try {
      const payload = await requestJson<{ item: ReaderState & { archivedAt?: string } }>(
        `/api/v1/items/${itemId}/state`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      setState((current) =>
        current
          ? { ...current, ...payload.item, archived: Boolean(payload.item.archivedAt) }
          : current
      );
      setNotice(label);
    } catch (cause) {
      setState(previous);
      setError(cause instanceof Error ? cause.message : "This change could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  async function saveNote() {
    setSaving("Saving note…");
    setError(null);
    try {
      await requestJson(`/api/v1/items/${itemId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note }),
      });
      setSavedNote(note);
      setNotice("Note saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Note could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  async function deleteNote() {
    const previous = note;
    setNote("");
    setSavedNote("");
    setSaving("Deleting note…");
    setError(null);
    try {
      await requestJson(`/api/v1/items/${itemId}/note`, { method: "DELETE" });
      setNotice("Note deleted");
    } catch (cause) {
      setNote(previous);
      setSavedNote(previous);
      setError(cause instanceof Error ? cause.message : "Note could not be deleted.");
    } finally {
      setSaving(null);
    }
  }

  async function toggleMembership(collectionId: string) {
    if (saving) return;
    const selected = memberIds.has(collectionId);
    const previous = new Set(memberIds);
    setMemberIds((ids) => {
      const next = new Set(ids);
      if (selected) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }
      return next;
    });
    setSaving("Updating collection…");
    setError(null);
    try {
      await requestJson(`/api/v1/collections/${collectionId}/items/${itemId}`, {
        method: selected ? "DELETE" : "PUT",
        headers: selected ? undefined : { "Content-Type": "application/json" },
        body: selected ? undefined : JSON.stringify({}),
      });
      setNotice(selected ? "Removed from collection" : "Added to collection");
    } catch (cause) {
      setMemberIds(previous);
      setError(cause instanceof Error ? cause.message : "Collection could not be updated.");
    } finally {
      setSaving(null);
    }
  }

  if (loading)
    return (
      <aside className="mt-8 rounded-xl border p-4 text-sm text-muted-foreground" role="status">
        Loading your reader controls…
      </aside>
    );
  if (!state)
    return (
      <aside className="mt-8 rounded-xl border border-destructive/40 p-4 text-sm" role="alert">
        {error || "Reader controls are unavailable."}
      </aside>
    );

  return (
    <aside
      className="mt-8 grid gap-4 border-t pt-6 lg:grid-cols-2"
      aria-label="Reader knowledge controls"
    >
      <section className="rounded-xl border bg-card p-4" aria-labelledby="reader-note-heading">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-5 w-5 text-primary" />
          <h2 id="reader-note-heading" className="font-serif text-lg font-semibold">
            Your note
          </h2>
        </div>
        <textarea
          aria-label="Item note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-3 min-h-28 w-full rounded-md border bg-background p-2 text-base"
          placeholder="Add a thought you want to remember"
          disabled={Boolean(saving)}
        />
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            onClick={saveNote}
            disabled={!dirty || Boolean(saving)}
            className="min-h-11 gap-2"
          >
            <Save className="h-4 w-4" />
            Save note
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={deleteNote}
            disabled={!savedNote || Boolean(saving)}
            className="min-h-11 gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4" aria-labelledby="reader-library-heading">
        <h2 id="reader-library-heading" className="font-serif text-lg font-semibold">
          Reading controls
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            disabled={Boolean(saving)}
            onClick={() =>
              void updateState(
                { archived: !state.archived },
                state.archived ? "Item restored" : "Item archived"
              )
            }
          >
            {state.archived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {state.archived ? "Restore item" : "Archive item"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={Boolean(saving)}
            onClick={() =>
              void updateState(
                { isRead: !state.isRead },
                state.isRead ? "Marked unread" : "Marked read"
              )
            }
          >
            {state.isRead ? "Mark unread" : "Mark read"}
          </Button>
        </div>
        <label className="mt-4 block text-sm font-medium">
          Manual priority
          <select
            value={state.manualPriority ?? ""}
            onChange={(event) =>
              void updateState(
                { manualPriority: (event.target.value || null) as Priority | null },
                "Priority updated"
              )
            }
            disabled={Boolean(saving)}
            className="mt-1 min-h-11 w-full rounded-md border bg-background px-2 text-base"
          >
            <option value="">Use feed ranking</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Reading progress: {progressLabel}%</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[0, 0.25, 0.5, 0.75, 1].map((milestone) => (
              <Button
                key={milestone}
                type="button"
                variant={state.readingProgress === milestone ? "secondary" : "outline"}
                size="sm"
                className="min-h-11"
                disabled={Boolean(saving)}
                onClick={() =>
                  void updateState(
                    { readingProgress: milestone },
                    `Progress set to ${milestone * 100}%`
                  )
                }
              >
                {milestone * 100}%
              </Button>
            ))}
          </div>
        </fieldset>
      </section>
      <section
        className="rounded-xl border bg-card p-4 lg:col-span-2"
        aria-labelledby="reader-collections-heading"
      >
        <div className="flex items-center gap-2">
          <BookmarkPlus className="h-5 w-5 text-primary" />
          <h2 id="reader-collections-heading" className="font-serif text-lg font-semibold">
            Collections
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep this source with a deliberate reading thread.
        </p>
        {collections.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {collections.map((collection) => (
              <label
                key={collection.id}
                className="flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={memberIds.has(collection.id)}
                  disabled={Boolean(saving)}
                  onChange={() => void toggleMembership(collection.id)}
                  className="h-4 w-4"
                />
                {collection.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Create a collection from the Collections page to organize this item.
          </p>
        )}
      </section>
      {(error || notice || saving) && (
        <p
          className={
            error
              ? "text-sm text-destructive lg:col-span-2"
              : "text-sm text-muted-foreground lg:col-span-2"
          }
          role={error ? "alert" : "status"}
        >
          {error || saving || notice}
        </p>
      )}
    </aside>
  );
}
