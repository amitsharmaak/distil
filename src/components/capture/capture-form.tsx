"use client";

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import type { CaptureReceipt, CreateCaptureResponse } from "@/lib/contracts/capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CaptureReceiptCard } from "@/components/capture/capture-receipt";

interface ErrorEnvelope {
  error?: { message?: string };
}

export function CaptureForm() {
  const [receipt, setReceipt] = useState<CaptureReceipt>();
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          url: form.get("url"),
          title: String(form.get("title") ?? "").trim() || undefined,
          notes: String(form.get("notes") ?? "").trim() || undefined,
          source: "web",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CreateCaptureResponse &
        ErrorEnvelope;
      if (!response.ok || !payload.receipt) {
        throw new Error(payload.error?.message ?? "Could not save this article.");
      }
      setReceipt(payload.receipt);
      setDuplicate(payload.duplicate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this article.");
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div className="space-y-4">
        {duplicate && (
          <p className="rounded-lg bg-muted p-3 text-sm">This article was already in Distil.</p>
        )}
        <CaptureReceiptCard initialReceipt={receipt} />
        <Button
          variant="ghost"
          onClick={() => {
            setReceipt(undefined);
            setDuplicate(false);
          }}
        >
          Save another article
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="capture-url" className="text-sm font-medium">
          Article URL
        </label>
        <Input
          id="capture-url"
          name="url"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="https://example.com/article"
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="capture-title" className="text-sm font-medium">
          Title <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="capture-title"
          name="title"
          autoComplete="off"
          placeholder="A helpful title"
          maxLength={300}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="capture-notes" className="text-sm font-medium">
          Why are you saving this? <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="capture-notes"
          name="notes"
          placeholder="A thought to remember…"
          maxLength={2_000}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="min-h-11 w-full sm:w-auto" disabled={submitting}>
        <BookmarkPlus className="h-4 w-4" />
        {submitting ? "Saving…" : "Save to Distil"}
      </Button>
    </form>
  );
}
