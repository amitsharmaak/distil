"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CACHE_FRESHNESS,
  useContentCache,
  useContentQuery,
} from "@/lib/client-cache/content-cache";
import { useItemMutation, useItemOverrides } from "@/lib/client-cache/item-mutations";
import { contentMutationRequest } from "@/lib/client-cache/mutation-request";
import type { Priority } from "@/lib/types";

export type ReaderState = {
  isRead: boolean;
  archived: boolean;
  readingProgress: number;
  manualPriority: Priority | null;
};

/** Server-read item state for the overflow menu; `updatedAt` is when the server read it. */
export type ReaderLibraryInitial = { state: ReaderState; updatedAt?: number };
/** Server-read note for the notes panel; `updatedAt` is when the server read it. */
export type ReaderKnowledgeInitial = { note: { body: string } | null; updatedAt?: number };

type ReaderStateResponse = { state: ReaderState };
type ReaderNoteResponse = { note: { body: string } | null };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await contentMutationRequest(path, init ?? {});
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "This change could not be saved.");
  return payload;
}

/**
 * Library actions live in the reader overflow; the note stays alongside highlights.
 *
 * State reads through the account cache (seeded by the server page, so opening the menu does
 * not fetch) and writes through the shared item mutation, which updates Feed, Today and Archive.
 */
export function ReaderLibraryMenuItems({
  itemId,
  initial,
}: {
  itemId: string;
  initial?: ReaderLibraryInitial;
}) {
  const { updateItem } = useItemMutation();
  const overrides = useItemOverrides(itemId);
  const stateKey = useMemo(() => ["item", itemId, "state"] as const, [itemId]);
  const stateQuery = useContentQuery<ReaderStateResponse>({
    key: stateKey,
    url: `/api/v1/items/${itemId}/state`,
    staleTime: CACHE_FRESHNESS.detail,
    initialData: initial ? { state: initial.state } : undefined,
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const error =
    mutationError ||
    (stateQuery.error
      ? state
        ? "Could not refresh. Showing the last loaded state."
        : stateQuery.error instanceof Error
          ? stateQuery.error.message
          : "Reader controls are unavailable."
      : null);

  async function updateState(patch: Partial<ReaderState>, label: string) {
    if (!state || saving) return;
    setSaving(true);
    setMutationError(null);
    try {
      await updateItem(itemId, patch);
      setMessage(label);
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "This change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DropdownMenuSeparator />
      {!state && !error && (
        <div role="status" aria-label="Loading library actions" className="p-2">
          <Skeleton className="h-8 w-full" />
        </div>
      )}
      {state && (
        <>
          <DropdownMenuItem
            className="min-h-11"
            disabled={saving}
            onSelect={(event) => {
              event.preventDefault();
              void updateState(
                { archived: !state.archived },
                state.archived ? "Item restored" : "Item archived"
              );
            }}
          >
            {state.archived ? <ArchiveRestore /> : <Archive />}
            {state.archived ? "Restore item" : "Archive item"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            aria-label="Manual priority"
            value={state.manualPriority ?? "auto"}
            onValueChange={(value) =>
              void updateState(
                { manualPriority: value === "auto" ? null : (value as Priority) },
                "Priority updated"
              )
            }
          >
            {[
              { value: "auto", label: "Feed ranking" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ].map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                className="min-h-11"
                value={option.value}
                disabled={saving}
                onSelect={(event) => event.preventDefault()}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </>
      )}
      {(error || message) && (
        <p
          className={`px-2 py-2 text-sm ${error ? "text-danger" : "text-muted-foreground"}`}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      )}
    </>
  );
}

/**
 * The reader's note. It reads through the account cache (seeded by the server page) and
 * writes its exact detail key behind the cache write barrier, with rollback on failure.
 */
export function ReaderKnowledgeControls({
  itemId,
  initial,
}: {
  itemId: string;
  initial?: ReaderKnowledgeInitial;
}) {
  const cache = useContentCache();
  const noteKey = useMemo(() => ["item", itemId, "note"] as const, [itemId]);
  const noteQuery = useContentQuery<ReaderNoteResponse>({
    key: noteKey,
    url: `/api/v1/items/${itemId}/note`,
    staleTime: CACHE_FRESHNESS.detail,
    initialData: initial ? { note: initial.note } : undefined,
    initialDataUpdatedAt: initial?.updatedAt,
  });
  const serverNote = noteQuery.data?.note?.body ?? "";
  const [draft, setDraft] = useState<{
    itemId: string;
    body: string;
    baseline: string;
  } | null>(null);
  const currentDraft = draft?.itemId === itemId ? draft : null;
  const note = currentDraft?.body ?? serverNote;
  const savedNote = currentDraft?.baseline ?? serverNote;
  const loading = noteQuery.isPending && !noteQuery.data;
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const error =
    mutationError ||
    (noteQuery.error
      ? noteQuery.error instanceof Error
        ? noteQuery.error.message
        : "Unable to load your note."
      : null);
  const dirty = note !== savedNote;

  async function saveNote() {
    setSaving(true);
    setMutationError(null);
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
      setMutationError(cause instanceof Error ? cause.message : "Note could not be saved.");
    } finally {
      release();
      setSaving(false);
    }
  }

  async function deleteNote() {
    const previousDraft = currentDraft;
    setSaving(true);
    setMutationError(null);
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
      setMutationError(cause instanceof Error ? cause.message : "Note could not be deleted.");
    } finally {
      release();
      setSaving(false);
    }
  }

  return (
    <section
      className="space-y-3 border-t pt-6"
      aria-label="Reader knowledge controls"
      aria-labelledby="reader-note-heading"
    >
      <h2
        id="reader-note-heading"
        className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
      >
        Your note
      </h2>
      {loading ? (
        <div role="status" aria-label="Loading your note">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <textarea
            aria-label="Item note"
            value={note}
            onChange={(event) =>
              setDraft({ itemId, body: event.target.value, baseline: savedNote })
            }
            rows={dirty || savedNote ? 4 : 3}
            className="min-h-24 w-full resize-y rounded-md border border-border bg-transparent p-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Add a thought you want to remember…"
            disabled={saving}
          />
          {(dirty || Boolean(savedNote)) && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void saveNote()}
                disabled={!dirty || saving}
                className="min-h-11 gap-2"
              >
                <Save className="h-4 w-4" />
                Save note
              </Button>
              {savedNote && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void deleteNote()}
                  disabled={saving}
                  className="min-h-11 gap-2 text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {(error || notice) && (
        <p
          className={`text-sm ${error ? "text-danger" : "text-muted-foreground"}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </p>
      )}
    </section>
  );
}
