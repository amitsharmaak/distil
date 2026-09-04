import { BookmarkPlus, Share2 } from "lucide-react";
import { CaptureForm } from "@/components/capture/capture-form";

export const metadata = { title: "Save an article — Distil" };

export default function SavePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="inline-flex rounded-full bg-primary/10 p-3 text-primary">
          <BookmarkPlus className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-serif text-display font-semibold tracking-tight">Save an article</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Paste a link and Distil will extract, summarize, and organize it for your feed.
          </p>
        </div>
      </header>
      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
        aria-label="Article capture form"
      >
        <CaptureForm />
      </section>
      <aside className="flex gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
        <Share2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          On iPhone, use the Distil Shortcut from Chrome or any app with a Share button to save
          without copying the link.
        </p>
      </aside>
    </div>
  );
}
