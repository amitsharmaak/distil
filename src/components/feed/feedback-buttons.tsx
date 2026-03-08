"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { config } from "@/lib/config";

interface FeedbackButtonsProps {
  itemId: string;
  initialFeedback?: { rating: number; reason: string | null } | null;
}

export function FeedbackButtons({ itemId, initialFeedback }: FeedbackButtonsProps) {
  const [rating, setRating] = useState<number | null>(initialFeedback?.rating ?? null);
  const [reason, setReason] = useState(initialFeedback?.reason ?? "");
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!initialFeedback);

  function handleRate(value: number) {
    setPendingRating(value);
    setShowReasonInput(true);
  }

  async function submitFeedback() {
    const ratingToSubmit = pendingRating ?? rating;
    if (!ratingToSubmit) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          rating: ratingToSubmit,
          reason: reason.trim() || undefined,
        }),
      });
      if (res.ok) {
        setRating(ratingToSubmit);
        setSubmitted(true);
        setShowReasonInput(false);
        setPendingRating(null);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted && !showReasonInput) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {rating === 1 ? (
          <ThumbsUp className="h-3.5 w-3.5 text-green-500 fill-green-500" />
        ) : (
          <ThumbsDown className="h-3.5 w-3.5 text-red-500 fill-red-500" />
        )}
        <span className="text-muted-foreground">
          {rating === 1 ? "Liked" : "Disliked"}
        </span>
        {reason && (
          <span className="text-muted-foreground italic truncate max-w-xs text-xs">
            — &quot;{reason}&quot;
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-1.5"
          onClick={() => {
            setSubmitted(false);
            setShowReasonInput(false);
            setRating(null);
            setReason("");
            setPendingRating(null);
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Helpful?</span>
      <Button
        variant={pendingRating === 1 ? "default" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => handleRate(1)}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={pendingRating === -1 ? "default" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => handleRate(-1)}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>

      {showReasonInput && (
        <div className="flex items-center gap-1.5 ml-1">
          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitFeedback()}
            className="h-7 text-xs w-44"
          />
          <Button
            size="sm"
            className="h-7 w-7 p-0"
            onClick={submitFeedback}
            disabled={submitting}
          >
            <Send className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              setShowReasonInput(false);
              setPendingRating(null);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
