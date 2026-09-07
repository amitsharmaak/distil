"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Highlighter, NotebookPen, Save } from "lucide-react";
import type { ReaderKnowledgeFixture } from "./types";

export function ReaderKnowledgePrototype({ fixture }: { fixture: ReaderKnowledgeFixture }) {
  const [note, setNote] = useState(fixture.note);
  const [savedNote, setSavedNote] = useState(fixture.note);
  const [archived, setArchived] = useState(Boolean(fixture.archived));
  const [collections, setCollections] = useState(fixture.collections);
  const [activeAnnotation, setActiveAnnotation] = useState(
    fixture.annotations.find((annotation) => annotation.state === "active")?.id ?? ""
  );
  const annotation = fixture.annotations.find((entry) => entry.id === activeAnnotation);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_20rem] sm:px-6">
      <article className="min-w-0">
        <header className="border-b pb-5">
          <p className="text-sm text-muted-foreground">{fixture.source}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold leading-tight">{fixture.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setArchived((value) => !value)}
            >
              {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {archived ? "Restore item" : "Archive item"}
            </button>
            <span className="self-center text-xs text-muted-foreground">
              {archived ? "Archived items are excluded from Today." : ""}
            </span>
          </div>
        </header>
        {fixture.intelligenceState === "degraded" && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-amber-400/60 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <strong>AI summary is unavailable.</strong>
            <p className="mt-1">
              {fixture.degradedReason} You can still read, save notes, and highlight this source.
            </p>
          </div>
        )}
        <div className="prose prose-lg mt-7 max-w-none dark:prose-invert">
          {fixture.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <section className="mt-8 border-t pt-6" aria-labelledby="highlights-heading">
          <div className="flex items-center gap-2">
            <Highlighter className="h-5 w-5 text-primary" />
            <h2 id="highlights-heading" className="font-serif text-xl font-semibold">
              Highlights
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Select text in the final reader to create a highlight; this prototype shows its saved
            state.
          </p>
          <ul className="mt-4 space-y-3">
            {fixture.annotations.map((entry) => (
              <li key={entry.id} className="rounded-lg border p-3">
                <button
                  type="button"
                  onClick={() => setActiveAnnotation(entry.id)}
                  className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <q className="font-medium">{entry.quote}</q>
                </button>
                {entry.state === "orphaned" ? (
                  <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                    This highlight could not be matched after the source changed.
                  </p>
                ) : (
                  entry.comment && (
                    <p className="mt-2 text-sm text-muted-foreground">{entry.comment}</p>
                  )
                )}
              </li>
            ))}
          </ul>
          {annotation?.state === "active" && (
            <label className="mt-4 block text-sm font-medium">
              Comment
              <textarea
                defaultValue={annotation.comment}
                className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}
        </section>
      </article>
      <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-xl border bg-card p-4" aria-labelledby="note-heading">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-primary" />
            <h2 id="note-heading" className="font-serif text-lg font-semibold">
              Your note
            </h2>
          </div>
          <textarea
            aria-label="Item note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-3 min-h-32 w-full rounded-md border bg-background p-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSavedNote(note)}
          >
            <Save className="h-4 w-4" />
            Save note
          </button>
          {savedNote === note && (
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              Saved locally in this prototype
            </p>
          )}
        </section>
        <section className="rounded-xl border bg-card p-4" aria-labelledby="collections-heading">
          <h2 id="collections-heading" className="font-serif text-lg font-semibold">
            Collections
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep this item with a deliberate reading thread.
          </p>
          <div className="mt-3 space-y-2">
            {collections.map((collection) => (
              <label
                key={collection.id}
                className="flex min-h-11 items-center gap-3 rounded-md px-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={collection.selected}
                  onChange={() =>
                    setCollections((current) =>
                      current.map((entry) =>
                        entry.id === collection.id ? { ...entry, selected: !entry.selected } : entry
                      )
                    )
                  }
                  className="h-4 w-4"
                />
                {collection.name}
              </label>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}
