"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeepResearch } from "@/components/feed/deep-research";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";

const COPY: ShortcutDef = {
  id: "report.copy",
  keys: [{ key: "c", shift: true }],
  label: "Copy as Markdown",
  group: "Research",
  scope: "research",
};
const RESEARCH_FURTHER: ShortcutDef = {
  id: "report.researchFurther",
  keys: [{ key: "d", shift: true }],
  label: "Research further",
  group: "Research",
  scope: "research",
};

/** How long "Copied!" stays on the copy button. */
const COPIED_RESET_MS = 2000;

/** Compact report actions: copy the stored markdown, or start a follow-up research run. */
export function ReportToolbar({
  markdown,
  query,
  itemId,
}: {
  markdown: string;
  query: string;
  itemId?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const furtherRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleCopy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  useShortcut(
    COPY,
    (e) => {
      e.preventDefault();
      void handleCopy();
    },
    Boolean(markdown)
  );
  useShortcut(RESEARCH_FURTHER, (e) => {
    e.preventDefault();
    furtherRef.current?.click();
  });

  return (
    <div role="toolbar" aria-label="Report actions" className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        onClick={handleCopy}
        aria-keyshortcuts="Shift+C"
        title="Copy as Markdown (Shift+C)"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied!" : "Copy as Markdown"}
      </Button>
      <DeepResearch defaultQuery={query} itemId={itemId ?? undefined}>
        <Button
          ref={furtherRef}
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          aria-keyshortcuts="Shift+D"
          title="Research further (Shift+D)"
        >
          <Search className="h-4 w-4" /> Research further
        </Button>
      </DeepResearch>
    </div>
  );
}
