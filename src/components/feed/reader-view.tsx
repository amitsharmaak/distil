"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExtractedLink } from "@/lib/types";

const ReaderViewOverlay = dynamic(() =>
  import("@/components/feed/reader-view-overlay").then((module) => module.ReaderViewOverlay)
);

interface ReaderViewProps {
  title: string;
  author?: string;
  publication?: string;
  createdAt: string;
  /** Cleaned HTML article body, sanitized by the server before reaching this client component. */
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

  // Don't render anything if there's no full content to show.
  if (!fullContent) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsOpen(true)}>
        <BookOpen className="h-4 w-4" />
        Reader View
      </Button>

      {isOpen && (
        <ReaderViewOverlay
          title={title}
          author={author}
          publication={publication}
          createdAt={createdAt}
          sanitizedFullContent={fullContent}
          extractedLinks={extractedLinks}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
