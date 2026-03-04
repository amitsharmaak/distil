"use client";

import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { config } from "@/lib/config";

interface FeedbackButtonsProps {
  itemId: string;
  /** Pre-loaded feedback from server (if any exists). */
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
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Your feedback:</span>
            <span className="flex items-center gap-1.5">
              {rating === 1 ? (
                <ThumbsUp className="h-4 w-4 text-green-500 fill-green-500" />
              ) : (
                <ThumbsDown className="h-4 w-4 text-red-500 fill-red-500" />
              )}
              {rating === 1 ? "Liked" : "Disliked"}
            </span>
            {reason && (
              <span className="text-muted-foreground italic truncate max-w-xs">
                — &quot;{reason}&quot;
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs"
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
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Was this helpful?</span>
            <div className="flex gap-1.5">
              <Button
                variant={pendingRating === 1 ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => handleRate(1)}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                Like
              </Button>
              <Button
                variant={pendingRating === -1 ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => handleRate(-1)}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                Dislike
              </Button>
            </div>
          </div>

          {showReasonInput && (
            <div className="space-y-2">
              <Textarea
                placeholder={
                  pendingRating === 1
                    ? "What did you find useful? (optional)"
                    : "What wasn't relevant? (optional)"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[60px] text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowReasonInput(false);
                    setPendingRating(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={submitFeedback}
                  disabled={submitting}
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting ? "Sending..." : "Submit"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
