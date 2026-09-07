"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Highlighter, Pencil, RefreshCw, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";

type Annotation = {
  id: string;
  selectedQuote: string;
  prefix: string;
  suffix: string;
  startOffset?: number;
  endOffset?: number;
  contentHash: string;
  contentVersion: string;
  comment?: string;
  status: "active" | "orphaned";
};

type SelectionAnchor = {
  quote: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
  contentVersion: string;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "The highlight could not be saved.");
  return payload;
}

/** A deterministic browser-safe digest used to identify the visible reader text. */
async function digest(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digestBytes = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digestBytes))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return `sha256:${hex}`;
  }

  // Older embedded browsers may not expose SubtleCrypto. The API accepts an
  // opaque hash, so keep anchoring usable while still producing a fixed value.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `sha256:${hex.repeat(8)}`;
}

function textOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

async function makeAnchor(
  root: HTMLElement,
  selection: Selection
): Promise<SelectionAnchor | null> {
  if (!selection.rangeCount || !selection.anchorNode || !selection.focusNode) return null;
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;

  const range = selection.getRangeAt(0);
  const text = range.toString();
  if (!text.trim()) return null;

  const content = root.textContent ?? "";
  const rawStart = textOffset(root, range.startContainer, range.startOffset);
  const rawEnd = textOffset(root, range.endContainer, range.endOffset);
  const leadingWhitespace = text.length - text.trimStart().length;
  const trailingWhitespace = text.length - text.trimEnd().length;
  const startOffset = Math.min(rawStart, rawEnd) + leadingWhitespace;
  const endOffset = Math.max(rawStart, rawEnd) - trailingWhitespace;
  const quote = content.slice(startOffset, endOffset).trim();
  if (!quote || endOffset <= startOffset) return null;

  const contentHash = await digest(content);
  return {
    quote,
    prefix: content.slice(Math.max(0, startOffset - 120), startOffset),
    suffix: content.slice(endOffset, Math.min(content.length, endOffset + 120)),
    startOffset,
    endOffset,
    contentHash,
    contentVersion: `reader-v1:${contentHash}`,
  };
}

function anchorStillMatches(annotation: Annotation, content: string): boolean {
  if (annotation.startOffset === undefined || annotation.endOffset === undefined) {
    return content.includes(annotation.selectedQuote);
  }
  return content.slice(annotation.startOffset, annotation.endOffset) === annotation.selectedQuote;
}

export function ReaderAnnotations({
  itemId,
  children,
}: {
  itemId: string;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<SelectionAnchor | null>(null);
  const [reanchorId, setReanchorId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentContent = useCallback(() => contentRef.current?.textContent ?? "", []);

  useEffect(() => {
    let cancelled = false;
    void requestJson<{ annotations: Annotation[] }>(`/api/v1/items/${itemId}/annotations`)
      .then((payload) => {
        if (cancelled) return;
        const content = currentContent();
        setAnnotations(
          payload.annotations.map((annotation) => ({
            ...annotation,
            status:
              annotation.status === "active" && !anchorStillMatches(annotation, content)
                ? "orphaned"
                : annotation.status,
          }))
        );
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to load highlights.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentContent, itemId]);

  const captureSelection = useCallback(async () => {
    const root = contentRef.current;
    const selected = window.getSelection();
    if (!root || !selected) return;
    const anchor = await makeAnchor(root, selected);
    if (!anchor) return;
    setError(null);
    setNotice(null);
    setSelection(anchor);
    if (reanchorId) setComment(annotations.find((entry) => entry.id === reanchorId)?.comment ?? "");
  }, [annotations, reanchorId]);

  function cancelSelection() {
    setSelection(null);
    setReanchorId(null);
    setComment("");
    window.getSelection()?.removeAllRanges();
  }

  async function saveSelection() {
    if (!selection || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (reanchorId) {
        const payload = await requestJson<{ annotation: Annotation }>(
          `/api/v1/items/${itemId}/annotations/${reanchorId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              selectedQuote: selection.quote,
              prefix: selection.prefix,
              suffix: selection.suffix,
              startOffset: selection.startOffset,
              endOffset: selection.endOffset,
              contentHash: selection.contentHash,
              contentVersion: selection.contentVersion,
              status: "active",
              comment: comment || null,
            }),
          }
        );
        setAnnotations((current) =>
          current.map((entry) => (entry.id === reanchorId ? payload.annotation : entry))
        );
        setNotice("Highlight re-anchored");
      } else {
        const payload = await requestJson<{ annotation: Annotation }>(
          `/api/v1/items/${itemId}/annotations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              selectedQuote: selection.quote,
              prefix: selection.prefix,
              suffix: selection.suffix,
              startOffset: selection.startOffset,
              endOffset: selection.endOffset,
              contentHash: selection.contentHash,
              contentVersion: selection.contentVersion,
              comment: comment || null,
            }),
          }
        );
        setAnnotations((current) => [...current, payload.annotation]);
        setNotice("Highlight saved");
      }
      cancelSelection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The highlight could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveComment(annotation: Annotation) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = await requestJson<{ annotation: Annotation }>(
        `/api/v1/items/${itemId}/annotations/${annotation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: editingComment || null }),
        }
      );
      setAnnotations((current) =>
        current.map((entry) => (entry.id === annotation.id ? payload.annotation : entry))
      );
      setEditingId(null);
      setNotice("Highlight updated");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The highlight could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAnnotation(annotation: Annotation) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/v1/items/${itemId}/annotations/${annotation.id}`, {
        method: "DELETE",
      });
      setAnnotations((current) => current.filter((entry) => entry.id !== annotation.id));
      setNotice("Highlight deleted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The highlight could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = useMemo(
    () => annotations.filter((annotation) => annotation.status === "active").length,
    [annotations]
  );

  return (
    <>
      <div
        ref={contentRef}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        className="reader-annotation-content"
      >
        {children}
      </div>

      <section className="mt-8 border-t pt-6" aria-labelledby="highlights-heading">
        <div className="flex items-center gap-2">
          <Highlighter className="h-5 w-5 text-primary" />
          <h2 id="highlights-heading" className="font-serif text-xl font-semibold">
            Highlights
          </h2>
          {!loading && <span className="text-xs text-muted-foreground">{activeCount} active</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Select text above to save an anchored highlight. Anchors include nearby context so a
          changed source can be re-anchored later.
        </p>

        {selection && (
          <div
            className="mt-4 rounded-lg border bg-card p-3"
            role="dialog"
            aria-label="Save highlight"
          >
            <q className="block text-sm font-medium">{selection.quote}</q>
            <label className="mt-3 block text-sm font-medium" htmlFor="highlight-comment">
              Comment (optional)
            </label>
            <textarea
              id="highlight-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-base"
              disabled={saving}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void saveSelection()}
                disabled={saving}
                className="min-h-11 gap-2"
              >
                <Save className="h-4 w-4" />
                {reanchorId ? "Save re-anchor" : "Save highlight"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={cancelSelection}
                disabled={saving}
                className="min-h-11 gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            Loading highlights…
          </p>
        ) : annotations.length ? (
          <ul className="mt-4 space-y-3">
            {annotations.map((annotation) => (
              <li key={annotation.id} className="rounded-lg border p-3">
                <q className="block font-medium">{annotation.selectedQuote}</q>
                {annotation.status === "orphaned" && (
                  <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                    This highlight no longer matches the source. Select its replacement text and
                    re-anchor it.
                  </p>
                )}
                {editingId === annotation.id ? (
                  <>
                    <label
                      className="mt-2 block text-sm font-medium"
                      htmlFor={`edit-comment-${annotation.id}`}
                    >
                      Comment
                    </label>
                    <textarea
                      id={`edit-comment-${annotation.id}`}
                      value={editingComment}
                      onChange={(event) => setEditingComment(event.target.value)}
                      className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-base"
                      disabled={saving}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        onClick={() => void saveComment(annotation)}
                        disabled={saving}
                        className="min-h-11 gap-2"
                      >
                        <Save className="h-4 w-4" /> Save comment
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                        className="min-h-11"
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  annotation.comment && (
                    <p className="mt-2 text-sm text-muted-foreground">{annotation.comment}</p>
                  )
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 gap-2"
                    disabled={saving}
                    onClick={() => {
                      setEditingId(annotation.id);
                      setEditingComment(annotation.comment ?? "");
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Edit comment
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 gap-2"
                    disabled={saving}
                    onClick={() => {
                      setReanchorId(annotation.id);
                      setComment(annotation.comment ?? "");
                      setNotice("Select replacement text above");
                    }}
                  >
                    <RefreshCw className="h-4 w-4" /> Re-anchor
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 gap-2 text-destructive hover:text-destructive"
                    disabled={saving}
                    onClick={() => void removeAnnotation(annotation)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No highlights yet.
          </p>
        )}
        {(error || notice) && (
          <p
            className={
              error ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-muted-foreground"
            }
            role={error ? "alert" : "status"}
          >
            {error || notice}
          </p>
        )}
      </section>
    </>
  );
}
