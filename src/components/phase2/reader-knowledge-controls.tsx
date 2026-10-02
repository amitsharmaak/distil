"use client";

import { useEffect, useState } from "react";
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
import type { Priority } from "@/lib/types";

type ReaderState = {
  isRead: boolean;
  archived: boolean;
  readingProgress: number;
  manualPriority: Priority | null;
};
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "This change could not be saved.");
  return payload;
}

/** Library actions live in the reader overflow; the note stays alongside highlights. */
export function ReaderLibraryMenuItems({ itemId }: { itemId: string }) {
  const [state, setState] = useState<ReaderState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void requestJson<{ state: ReaderState }>(`/api/v1/items/${itemId}/state`)
      .then((payload) => {
        if (!cancelled) setState(payload.state);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Reader controls are unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  async function updateState(patch: Partial<ReaderState>, label: string) {
    if (!state || saving) return;
    const previous = state;
    setState({ ...state, ...patch });
    setSaving(true);
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
      setMessage(label);
    } catch (cause) {
      setState(previous);
      setError(cause instanceof Error ? cause.message : "This change could not be saved.");
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

export function ReaderKnowledgeControls({ itemId }: { itemId: string }) {
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void requestJson<{ note: { body: string } | null }>(`/api/v1/items/${itemId}/note`)
      .then((payload) => {
        if (cancelled) return;
        const body = payload.note?.body ?? "";
        setNote(body);
        setSavedNote(body);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to load your note.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);
  const dirty = note !== savedNote;

  async function saveNote() {
    setSaving(true);
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
      setSaving(false);
    }
  }
  async function deleteNote() {
    const previous = note;
    setNote("");
    setSavedNote("");
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/v1/items/${itemId}/note`, { method: "DELETE" });
      setNotice("Note deleted");
    } catch (cause) {
      setNote(previous);
      setSavedNote(previous);
      setError(cause instanceof Error ? cause.message : "Note could not be deleted.");
    } finally {
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
            onChange={(event) => setNote(event.target.value)}
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
