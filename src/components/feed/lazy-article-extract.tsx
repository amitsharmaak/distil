"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { config } from "@/lib/config";

interface LazyArticleExtractProps {
  itemId: string;
  url: string;
  hasFullContent: boolean;
  /** When set, extraction was already attempted — don't retry. */
  contentExtractedAt?: string;
  children: React.ReactNode;
}

/**
 * Triggers content extraction in the background when fullContent is missing
 * AND no previous extraction attempt was recorded. Once extracted (or failed),
 * `content_extracted_at` is stamped in the DB so subsequent visits are instant.
 */
export function LazyArticleExtract({
  itemId,
  url,
  hasFullContent,
  contentExtractedAt,
  children,
}: LazyArticleExtractProps) {
  const router = useRouter();
  const alreadyDone = hasFullContent || !!contentExtractedAt;
  const [status, setStatus] = useState<"idle" | "loading" | "done">(
    alreadyDone ? "done" : "idle"
  );

  useEffect(() => {
    if (alreadyDone || !url) {
      setStatus("done");
      return;
    }
    let cancelled = false;

    async function run() {
      setStatus("loading");
      try {
        const res = await fetch(`${config.apiBaseUrl}/api/items/${itemId}/extract`, {
          method: "POST",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setStatus("done");
          if (data.extracted) router.refresh();
        } else {
          setStatus("done");
        }
      } catch {
        if (!cancelled) setStatus("done");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [itemId, url, alreadyDone, router]);

  if (status === "loading") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading article content…
          </p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
