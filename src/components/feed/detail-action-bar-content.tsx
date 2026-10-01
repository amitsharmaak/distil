"use client";

import { contentMutationRequest } from "@/lib/client-cache/mutation-request";

import { useCallback, useEffect, useRef, useState } from "react";
import { IntentLink as Link } from "@/components/navigation/intent-link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  ThumbsUp,
  ThumbsDown,
  Check,
  Link2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DeepResearch } from "@/components/feed/deep-research";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import { useItemMutation, useItemOverrides } from "@/lib/client-cache/item-mutations";
import { useContentCache } from "@/lib/client-cache/content-cache";

const def = (id: string, keys: ShortcutDef["keys"], label: string): ShortcutDef => ({
  id,
  keys,
  label,
  group: "Reading",
  scope: "reader",
});

const MARK_UNREAD = def("reader.markUnread", [{ key: "u", shift: true }], "Mark as unread");
const OPEN_ORIGINAL = def("reader.openOriginal", [{ key: "o" }], "Open original in new tab");
const LIKE = def("reader.like", [{ key: "+" }], "Like");
const DISLIKE = def("reader.dislike", [{ key: "-" }], "Dislike");
const DEEP_RESEARCH = def("reader.deepResearch", [{ key: "d", shift: true }], "Deep research");
const COPY_LINK = def("reader.copyLink", [{ key: "c", shift: true }], "Copy link");

const MARK_READ: ShortcutDef = {
  id: "reader.markRead",
  keys: [{ key: "r" }],
  label: "Mark as read and go to next",
  group: "Reading",
  scope: "reader",
};

export interface DetailActionBarProps {
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
  const cache = useContentCache();
  const { updateItem } = useItemMutation();
  const overrides = useItemOverrides(itemId);
  const suffix = filter ? `?filter=${filter}` : "";

  const [rating, setRating] = useState<number | null>(initialFeedback?.rating ?? null);
  const [submitting, setSubmitting] = useState(false);
  const read = overrides?.isRead ?? isRead;
  const [markingRead, setMarkingRead] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const researchBtn = useRef<HTMLButtonElement>(null);
  const handleResearchOpenChange = useCallback((next: boolean) => {
    setResearchOpen(next);
    if (!next) setTimeout(() => researchBtn.current?.focus(), 0);
  }, []);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  async function handleRate(value: number) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await contentMutationRequest("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, rating: value }),
      });
      if (res.ok) {
        setRating(value);
        void cache.invalidate(["feed"]);
        void cache.invalidate(["today"]);
      }
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
      await updateItem(itemId, { isRead: true });
      if (nextId) {
        router.push(`/feed/${nextId}${suffix}`);
      } else {
        router.push(`/feed${suffix}`);
      }
    } catch {
      // The shared cache restores the previous state on failure.
    } finally {
      setMarkingRead(false);
    }
  }, [read, markingRead, itemId, nextId, suffix, router, updateItem]);

  const handleMarkUnread = useCallback(async () => {
    if (!read || markingRead) return;
    setMarkingRead(true);
    try {
      await updateItem(itemId, { isRead: false });
    } catch {
      /* stays read */
    } finally {
      setMarkingRead(false);
    }
  }, [read, markingRead, itemId, updateItem]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  }, []);

  const openOriginal = useCallback(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  useShortcut(MARK_READ, () => void handleMarkRead(), !read);
  useShortcut(MARK_UNREAD, () => void handleMarkUnread(), read);
  useShortcut(OPEN_ORIGINAL, openOriginal);
  useShortcut(LIKE, () => void handleRate(1));
  useShortcut(DISLIKE, () => void handleRate(-1));
  useShortcut(DEEP_RESEARCH, () => setResearchOpen(true));
  useShortcut(COPY_LINK, () => void handleCopyLink());

  const iconBtn =
    "h-11 w-11 md:h-9 md:w-9 text-muted-foreground hover:text-foreground transition-colors";

  return (
    <TooltipProvider>
      <div className="distil-action-bar fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/80 backdrop-blur-xl md:left-16 lg:left-64 transition-[left] duration-300 pb-safe">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2">
          {/* ── Navigation ── */}
          <div className="flex items-center gap-1 sm:gap-2">
            {prevId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={iconBtn} asChild>
                    <Link
                      href={`/feed/${prevId}${suffix}`}
                      aria-label="Previous item"
                      aria-keyshortcuts="ArrowLeft k"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Previous item · K</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 md:h-9 md:w-9"
                aria-label="Previous item"
                disabled
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}

            {nextId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={iconBtn} asChild>
                    <Link
                      href={`/feed/${nextId}${suffix}`}
                      aria-label="Next item"
                      aria-keyshortcuts="ArrowRight j"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Next item · J</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 md:h-9 md:w-9"
                aria-label="Next item"
                disabled
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={iconBtn} asChild>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View original"
                    aria-keyshortcuts="o"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">View original · O</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconBtn}
                  ref={researchBtn}
                  aria-label="Deep research"
                  aria-keyshortcuts="Shift+D"
                  onClick={() => setResearchOpen(true)}
                >
                  <FlaskConical className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Deep research · Shift+D</TooltipContent>
            </Tooltip>
            <DeepResearch
              itemId={itemId}
              defaultQuery={title}
              open={researchOpen}
              onOpenChange={handleResearchOpenChange}
            >
              {null}
            </DeepResearch>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`${iconBtn} ${copied ? "text-green-500" : ""}`}
                  onClick={() => void handleCopyLink()}
                  aria-label="Copy link"
                  aria-keyshortcuts="Shift+C"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {copied ? "Copied" : "Copy link · Shift+C"}
              </TooltipContent>
            </Tooltip>
            <span role="status" className="sr-only">
              {copied ? "Copied" : ""}
            </span>

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
                  aria-label={rating === 1 ? "Liked" : "Like"}
                  aria-keyshortcuts="+"
                  disabled={submitting}
                >
                  <ThumbsUp className={`h-4 w-4 ${rating === 1 ? "fill-current" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{rating === 1 ? "Liked" : "Like"} · +</TooltipContent>
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
                  aria-label={rating === -1 ? "Disliked" : "Dislike"}
                  aria-keyshortcuts="-"
                  disabled={submitting}
                >
                  <ThumbsDown className={`h-4 w-4 ${rating === -1 ? "fill-current" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {rating === -1 ? "Disliked" : "Dislike"} · -
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="mx-1.5 h-4" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-11 w-11 md:h-9 md:w-9 transition-colors ${
                    read ? "text-green-500" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={handleMarkRead}
                  aria-label={read ? "Read" : "Mark as read"}
                  aria-keyshortcuts="r"
                  disabled={read || markingRead}
                >
                  <Check className={`h-4 w-4 ${read ? "stroke-[2.5]" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{read ? "Read" : "Mark as read · R"}</TooltipContent>
            </Tooltip>

            {read && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={iconBtn}
                    onClick={() => void handleMarkUnread()}
                    aria-label="Mark as unread"
                    aria-keyshortcuts="Shift+U"
                    disabled={markingRead}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Mark as unread · Shift+U</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
