"use client";

import { useState } from "react";
import { Captions, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoTranscriptButtonProps {
  itemId: string;
}

/**
 * Loads a YouTube transcript into the item on demand. Once loaded the page
 * re-renders with the transcript under "Original" and summaries regenerate
 * from it, so the button disappears.
 */
export function VideoTranscriptButton({ itemId }: VideoTranscriptButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/items/${itemId}/transcript`, { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message || "The transcript could not be loaded.");
      }
      // Full reload: the server re-renders Original with the transcript and the
      // regenerated summary, and this button no longer mounts.
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The transcript could not be loaded.");
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={load}
        disabled={loading}
        className="h-8 gap-1.5"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Captions className="h-3.5 w-3.5" />
        )}
        {loading ? "Loading transcript…" : "Load transcript"}
      </Button>
      <span className="text-xs text-muted-foreground">
        Adds the full transcript and a summary built from it.
      </span>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
