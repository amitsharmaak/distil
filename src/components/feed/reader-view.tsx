"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ExtractedLink } from "@/lib/types";

interface ReaderViewProps {
  title: string;
  author?: string;
  publication?: string;
  createdAt: string;
  /** Cleaned HTML article body from Readability. */
  fullContent: string;
  /** Links extracted from the article. */
  extractedLinks: ExtractedLink[];
}

export function ReaderView({
  title,
  author,
  publication,
  createdAt,
  fullContent,
  extractedLinks,
}: ReaderViewProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll while overlay is open
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  // Don't render anything if there's no full content to show.
  if (!fullContent) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsOpen(true)}>
        <BookOpen className="h-4 w-4" />
        Reader View
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Overlay panel */}
          <div className="relative z-10 mt-8 mb-8 w-full max-w-3xl max-h-[calc(100vh-4rem)] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl">
            {/* Sticky header bar */}
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-6 py-3 rounded-t-xl">
              <span className="text-sm font-medium flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Reader View
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            {/* Article body — clean reading layout */}
            <article className="mx-auto max-w-prose px-6 py-8 space-y-6">
              <header>
                <h1 className="text-3xl font-bold tracking-tight leading-tight">{title}</h1>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  {author && <span>{author}</span>}
                  {author && publication && <span>&middot;</span>}
                  {publication && <span>{publication}</span>}
                  <span>&middot;</span>
                  <span>{new Date(createdAt).toLocaleDateString()}</span>
                </div>
              </header>

              <Separator />

              {/* Rendered article HTML from Readability (clean — no scripts/iframes) */}
              <div
                className="prose prose-lg dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: fullContent }}
              />

              {/* Extracted links section */}
              {extractedLinks.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h2 className="text-lg font-semibold mb-3">Links in this article</h2>
                    <ul className="space-y-2">
                      {extractedLinks.map((link, i) => (
                        <li key={i}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1.5"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span>{link.text || link.url}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </article>
          </div>
        </div>
      )}
    </>
  );
}
