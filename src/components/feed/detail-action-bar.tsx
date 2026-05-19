"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  ThumbsUp,
  ThumbsDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DeepResearch } from "@/components/feed/deep-research";
import { config } from "@/lib/config";

interface DetailActionBarProps {
  itemId: string;
  url: string;
  title: string;
  isRead: boolean;
  prevId: string | null;
  nextId: string | null;
  filter?: string;
  initialFeedback?: { rating: number; reason: string | null } | null;
}

export function DetailActionBar({
  itemId,
  url,
  title,
  isRead,
  prevId,
  nextId,
  filter,
  initialFeedback,
}: DetailActionBarProps) {
  const router = useRouter();
  const suffix = filter ? `?filter=${filter}` : "";

  const [rating, setRating] = useState<number | null>(
    initialFeedback?.rating ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [read, setRead] = useState(isRead);
  const [markingRead, setMarkingRead] = useState(false);

  async function handleRate(value: number) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, rating: value }),
      });
      if (res.ok) setRating(value);
    } catch {
      /* retry later */
    } finally {
      setSubmitting(false);
    }
  }

  const handleMarkRead = useCallback(async () => {
    if (read || markingRead) return;
    setMarkingRead(true);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      if (res.ok) {
        setRead(true);
        if (nextId) {
          router.push(`/feed/${nextId}${suffix}`);
        } else {
          router.push(`/feed${suffix}`);
        }
      }
    } finally {
      setMarkingRead(false);
    }
  }, [read, markingRead, itemId, nextId, suffix, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "r" && e.key !== "R") return;
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;
      e.preventDefault();
      handleMarkRead();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleMarkRead]);

  const iconBtn =
    "h-11 w-11 md:h-9 md:w-9 text-muted-foreground hover:text-foreground transition-colors";

  return (
    <div className="distil-action-bar fixed bottom-16 left-0 right-0 z-50 border-t border-border/40 bg-background/80 backdrop-blur-xl md:bottom-0 md:left-16 lg:left-64 transition-[left] duration-300 pb-safe">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2">
        {/* ── Navigation ── */}
        <div className="flex items-center gap-1 sm:gap-2">
          {prevId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={iconBtn} asChild>
                  <Link href={`/feed/${prevId}${suffix}`}>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Previous</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9" disabled>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}

          {nextId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={iconBtn} asChild>
                  <Link href={`/feed/${nextId}${suffix}`}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Next</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9" disabled>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={iconBtn} asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">View original</TooltipContent>
          </Tooltip>

          <DeepResearch itemId={itemId} defaultQuery={title}>
            <Button
              variant="ghost"
              size="icon"
              className={iconBtn}
              title="Deep research"
            >
              <Search className="h-4 w-4" />
            </Button>
          </DeepResearch>

          <Separator orientation="vertical" className="mx-1.5 h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-11 w-11 md:h-9 md:w-9 transition-colors ${
                  rating === 1
                    ? "text-green-500 hover:text-green-600"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handleRate(1)}
                disabled={submitting}
              >
                <ThumbsUp
                  className={`h-4 w-4 ${rating === 1 ? "fill-current" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {rating === 1 ? "Liked" : "Like"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-11 w-11 md:h-9 md:w-9 transition-colors ${
                  rating === -1
                    ? "text-red-500 hover:text-red-600"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handleRate(-1)}
                disabled={submitting}
              >
                <ThumbsDown
                  className={`h-4 w-4 ${rating === -1 ? "fill-current" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {rating === -1 ? "Disliked" : "Dislike"}
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1.5 h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-11 w-11 md:h-9 md:w-9 transition-colors ${
                  read
                    ? "text-green-500"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={handleMarkRead}
                disabled={read || markingRead}
              >
                <Check
                  className={`h-4 w-4 ${read ? "stroke-[2.5]" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {read ? "Read" : "Mark as read (R)"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
