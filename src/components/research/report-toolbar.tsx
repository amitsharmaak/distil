"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeepResearch } from "@/components/feed/deep-research";

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

  return (
    <div role="toolbar" aria-label="Report actions" className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5" onClick={handleCopy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied!" : "Copy as Markdown"}
      </Button>
      <DeepResearch defaultQuery={query} itemId={itemId ?? undefined}>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5">
          <Search className="h-4 w-4" /> Research further
        </Button>
      </DeepResearch>
    </div>
  );
}
