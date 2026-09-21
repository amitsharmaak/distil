"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { config } from "@/lib/config";

interface DeepResearchProps {
  /** Optional — omit when starting research from the research page. */
  itemId?: string;
  /** Pre-filled query (usually the item title). */
  defaultQuery: string;
  /** Custom trigger element; defaults to "Deep Research" button. */
  children?: React.ReactNode;
}

export function DeepResearch({ itemId, defaultQuery, children }: DeepResearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), ...(itemId && { itemId }) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start research");
      }

      const data = await res.json();
      setOpen(false);
      router.push(`/research/${data.report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="default" className="gap-2">
            <Search className="h-4 w-4" /> Deep Research
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deep Research</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            The AI will search the web and compile a comprehensive research report on your topic.
          </p>
          <Textarea
            placeholder="What would you like to research?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-[100px]"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={loading || !query.trim()}>
              {loading ? "Starting..." : "Start Research"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
