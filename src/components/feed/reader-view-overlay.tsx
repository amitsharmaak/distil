"use client";

import { useCallback, useEffect } from "react";
import { BookOpen, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ExtractedLink } from "@/lib/types";

export function ReaderViewOverlay({
  title,
  author,
  publication,
  createdAt,
  sanitizedFullContent,
  extractedLinks,
  onClose,
}: {
  title: string;
  author?: string;
  publication?: string;
  createdAt: string;
  sanitizedFullContent: string;
  extractedLinks: ExtractedLink[];
  onClose: () => void;
}) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 mt-4 sm:mt-8 mb-4 sm:mb-8 w-full max-w-3xl max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-6 py-3 rounded-t-xl">
          <span className="text-sm font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Reader View
          </span>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClose}>
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>

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
          <div
            className="prose prose-lg dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizedFullContent }}
          />

          {extractedLinks.length > 0 && (
            <>
              <Separator />
              <section>
                <h2 className="text-lg font-semibold mb-3">Links in this article</h2>
                <ul className="space-y-2">
                  {extractedLinks.map((link, index) => (
                    <li key={index}>
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
  );
}
