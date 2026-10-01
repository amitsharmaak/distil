"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CACHE_FRESHNESS,
  useContentCache,
  useContentQuery,
} from "@/lib/client-cache/content-cache";
import { useItemMutation, useItemOverrides } from "@/lib/client-cache/item-mutations";
import type { Priority } from "@/lib/types";

export type ReaderState = {
  isRead: boolean;
  archived: boolean;
  readingProgress: number;
  manualPriority: Priority | null;
};

export type ReaderKnowledgeInitial = {
  state: ReaderState;
  note: { body: string } | null;
  updatedAt?: number;
};
type ReaderStateResponse = { state: ReaderState };
type ReaderNoteResponse = { note: { body: string } | null };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "This change could not be saved.");
  return payload;
}

export function ReaderKnowledgeControls({
  itemId,
  initial,
}: {
  itemId: string;
  initial?: ReaderKnowledgeInitial;
}) {
  const cache = useContentCache();
  const { updateItem } = useItemMutation();
  const overrides = useItemOverrides(itemId);
  const stateKey = useMemo(() => ["item", itemId, "state"] as const, [itemId]);
  const noteKey = useMemo(() => ["item", itemId, "note"] as const, [itemId]);
  const stateQuery = useContentQuery<ReaderStateResponse>({
    key: stateKey,
    url: `/api/v1/items/${itemId}/state`,
    staleTime: CACHE_FRESHNESS.detail,
    initialData: initial ? { state: initial.state } : undefined,
    initialDataUpdatedAt: initial?.updatedAt,
  });
  const noteQuery = useContentQuery<ReaderNoteResponse>({
    key: noteKey,
    url: `/api/v1/items/${itemId}/note`,
    staleTime: CACHE_FRESHNESS.detail,
    initialData: initial ? { note: initial.note } : undefined,
    initialDataUpdatedAt: initial?.updatedAt,
  });
  const baseState = stateQuery.data?.state ?? null;
  const state = baseState
    ? {
        ...baseState,
        ...(overrides?.isRead !== undefined ? { isRead: overrides.isRead } : {}),
        ...(overrides?.archived !== undefined ? { archived: overrides.archived } : {}),
        ...(overrides?.readingProgress !== undefined
          ? { readingProgress: overrides.readingProgress }
          : {}),
        ...(overrides?.manualPriority !== undefined
          ? { manualPriority: overrides.manualPriority }
          : {}),
      }
    : null;
  const serverNote = noteQuery.data?.note?.body ?? "";
  const [draft, setDraft] = useState<{
    itemId: string;
    body: string;
    baseline: string;
  } | null>(null);
  const currentDraft = draft?.itemId === itemId ? draft : null;
  const note = currentDraft?.body ?? serverNote;
  const savedNote = currentDraft?.baseline ?? serverNote;
  const loading =
    (stateQuery.isPending && !stateQuery.data) || (noteQuery.isPending && !noteQuery.data);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryError = stateQuery.error ?? noteQuery.error;
  const visibleError =
    error ||
    (queryError instanceof Error
      ? queryError.message
      : queryError
        ? "Unable to load reader controls."
        : null);

  const dirty = note !== savedNote;

  async function updateState(patch: Partial<ReaderState>, label: string) {
    if (!state || saving) return;
    setSaving(label);
    setError(null);
    try {
      await updateItem(itemId, patch);
      setNotice(label);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This change could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  async function saveNote() {
    setSaving("Saving note…");
    setError(null);
    const release = cache.beginWrite();
    let previous: ReaderNoteResponse | undefined;
    let optimisticUpdateApplied = false;
    try {
      await cache.cancel(noteKey);
      previous = cache.get<ReaderNoteResponse>(noteKey);
      cache.set<ReaderNoteResponse>(noteKey, { note: { body: note } });
      optimisticUpdateApplied = true;
      const payload = await requestJson<ReaderNoteResponse>(`/api/v1/items/${itemId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note }),
      });
      cache.set(noteKey, payload);
      setDraft(null);
      setNotice("Note saved");
    } catch (cause) {
      if (optimisticUpdateApplied) cache.set(noteKey, previous);
      setError(cause instanceof Error ? cause.message : "Note could not be saved.");
    } finally {
      release();
      setSaving(null);
    }
  }

  async function deleteNote() {
    const previousDraft = currentDraft;
    setSaving("Deleting note…");
    setError(null);
    const release = cache.beginWrite();
    let previous: ReaderNoteResponse | undefined;
    let optimisticUpdateApplied = false;
    try {
      await cache.cancel(noteKey);
      previous = cache.get<ReaderNoteResponse>(noteKey);
      cache.set<ReaderNoteResponse>(noteKey, { note: null });
      optimisticUpdateApplied = true;
      setDraft(null);
      await requestJson(`/api/v1/items/${itemId}/note`, { method: "DELETE" });
      setNotice("Note deleted");
    } catch (cause) {
      if (optimisticUpdateApplied) {
        cache.set(noteKey, previous);
        setDraft(previousDraft);
      }
      setError(cause instanceof Error ? cause.message : "Note could not be deleted.");
    } finally {
      release();
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
        {visibleError || "Reader controls are unavailable."}
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
          onChange={(event) => setDraft({ itemId, body: event.target.value, baseline: savedNote })}
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
        {(visibleError || notice || saving) && (
          <p
            className={visibleError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            role={visibleError ? "alert" : "status"}
          >
            {visibleError || saving || notice}
          </p>
        )}
      </section>
    </aside>
  );
}
