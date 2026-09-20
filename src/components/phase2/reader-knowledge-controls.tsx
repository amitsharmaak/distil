"use client";

import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, BookmarkPlus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const response = await fetch(path, init);
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
      <aside className="mt-10 border-t pt-4 text-sm text-muted-foreground" role="status">
        Loading your reader controls…
      </aside>
    );
  if (!state)
    return (
      <aside className="mt-10 border-t pt-4 text-sm text-destructive" role="alert">
        {error || "Reader controls are unavailable."}
      </aside>
    );

  const labelClass = "text-[11px] font-medium uppercase tracking-widest text-muted-foreground";
  const showNoteActions = dirty || Boolean(savedNote);

  return (
    <aside className="mt-10 space-y-6 border-t pt-6" aria-label="Reader knowledge controls">
      {/* Note — one quiet field; actions appear only once there is something to save or delete. */}
      <section aria-labelledby="reader-note-heading">
        <h2 id="reader-note-heading" className={labelClass}>
          Your note
        </h2>
        <textarea
          aria-label="Item note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={dirty || savedNote ? 3 : 1}
          className="mt-2 w-full resize-y rounded-md border border-transparent bg-transparent px-0 py-1 font-serif text-base leading-relaxed placeholder:text-muted-foreground/70 focus:border-border focus:bg-background focus:px-2 focus:outline-none"
          placeholder="Add a thought you want to remember…"
          disabled={Boolean(saving)}
        />
        {showNoteActions && (
          <div className="mt-1 flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={saveNote}
              disabled={!dirty || Boolean(saving)}
              className="h-8 gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save note
            </Button>
            {savedNote && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={deleteNote}
                disabled={Boolean(saving)}
                className="h-8 gap-1.5 text-muted-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Collections as toggle chips; hidden entirely when there are none. */}
      {collections.length > 0 && (
        <section aria-labelledby="reader-collections-heading">
          <h2 id="reader-collections-heading" className={labelClass}>
            Collections
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {collections.map((collection) => {
              const selected = memberIds.has(collection.id);
              return (
                <label
                  key={collection.id}
                  className={
                    selected
                      ? "flex h-8 cursor-pointer items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 text-sm text-foreground"
                      : "flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={Boolean(saving)}
                    onChange={() => void toggleMembership(collection.id)}
                    className="sr-only"
                  />
                  <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
                  {collection.name}
                </label>
              );
            })}
          </div>
        </section>
      )}

      {/* Archive and priority: the action bar already covers read/unread. */}
      <section
        className="flex flex-wrap items-center gap-x-5 gap-y-2"
        aria-labelledby="reader-library-heading"
      >
        <h2 id="reader-library-heading" className="sr-only">
          Reading controls
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          disabled={Boolean(saving)}
          onClick={() =>
            void updateState(
              { archived: !state.archived },
              state.archived ? "Item restored" : "Item archived"
            )
          }
        >
          {state.archived ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          {state.archived ? "Restore item" : "Archive item"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Priority
          <select
            aria-label="Manual priority"
            value={state.manualPriority ?? ""}
            onChange={(event) =>
              void updateState(
                { manualPriority: (event.target.value || null) as Priority | null },
                "Priority updated"
              )
            }
            disabled={Boolean(saving)}
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Feed ranking</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        {(error || notice || saving) && (
          <p
            className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            role={error ? "alert" : "status"}
          >
            {error || saving || notice}
          </p>
        )}
      </section>
    </aside>
  );
}
