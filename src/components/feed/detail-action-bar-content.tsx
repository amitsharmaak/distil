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
  CircleCheck,
  Link2,
  Undo2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ReaderLibraryMenuItems,
  type ReaderLibraryInitial,
} from "@/components/phase2/reader-knowledge-controls";
import { useReaderExperience } from "@/components/feed/reader-experience";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DeepResearch } from "@/components/feed/deep-research";
import { useShortcut, useShortcutsSuspended } from "@/components/shortcuts/shortcuts-provider";
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
  knowledgeUiEnabled?: boolean;
  /** Server-read archive/priority state; lets the overflow menu open without a GET. */
  initialReaderState?: ReaderLibraryInitial;
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
  knowledgeUiEnabled = false,
  initialReaderState,
}: DetailActionBarProps) {
  const router = useRouter();
  const cache = useContentCache();
  const { updateItem } = useItemMutation();
  const overrides = useItemOverrides(itemId);
  const reader = useReaderExperience();
  const [menuOpen, setMenuOpen] = useState(false);
  useShortcutsSuspended(menuOpen);
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
        // Feedback is part of the server-rendered reader props.
        router.refresh();
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
      // The shared cache restores the previous state on failure; the story stays unread.
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

  const iconBtn = "h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground";

  return (
    <TooltipProvider>
      <div className="distil-action-bar fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl pb-safe">
        <div
          className="mx-auto flex w-full max-w-2xl items-center justify-center gap-0.5 px-1 py-2 sm:gap-2 sm:px-4"
          role="group"
          aria-label="Reader actions"
        >
          {prevId ? (
            <Button variant="ghost" size="icon" className={iconBtn} asChild>
              <Link
                href={`/feed/${prevId}${suffix}`}
                aria-label="Previous item"
                aria-keyshortcuts="ArrowLeft k"
                title="Previous item · K"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className={iconBtn}
              aria-label="Previous item"
              disabled
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {nextId ? (
            <Button variant="ghost" size="icon" className={iconBtn} asChild>
              <Link
                href={`/feed/${nextId}${suffix}`}
                aria-label="Next item"
                aria-keyshortcuts="ArrowRight j"
                title="Next item · J"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className={iconBtn} aria-label="Next item" disabled>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {/* A secondary control like its neighbours: the r shortcut does the same job, so the
              button only needs to be findable. The read state colours only the filled check;
              the label stays as muted as its siblings. */}
          <Button
            variant="ghost"
            className="h-11 shrink-0 gap-1.5 px-3 text-muted-foreground hover:text-foreground"
            onClick={() => void (read ? handleMarkUnread() : handleMarkRead())}
            aria-label={read ? "Mark as unread" : "Mark as read"}
            aria-keyshortcuts={read ? "Shift+U" : "r"}
            data-read={read ? "true" : "false"}
            disabled={markingRead}
            title={read ? "Mark as unread · Shift+U" : "Mark as read · R"}
          >
            {read ? (
              <CircleCheck className="h-4 w-4 fill-current text-success [&_path]:stroke-background" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {read ? "Mark unread" : "Mark read"}
            {!read && <Kbd className="hidden pointer-fine:inline-flex">r</Kbd>}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`${iconBtn} ${rating === 1 ? "text-success" : ""}`}
                onClick={() => void handleRate(1)}
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
                className={`${iconBtn} ${rating === -1 ? "text-danger" : ""}`}
                onClick={() => void handleRate(-1)}
                aria-label={rating === -1 ? "Disliked" : "Dislike"}
                aria-keyshortcuts="-"
                disabled={submitting}
              >
                <ThumbsDown className={`h-4 w-4 ${rating === -1 ? "fill-current" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{rating === -1 ? "Disliked" : "Dislike"} · -</TooltipContent>
          </Tooltip>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                ref={researchBtn}
                variant="ghost"
                size="icon"
                className={iconBtn}
                aria-label="More reader actions"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-64">
              {reader?.summaryAction && (
                <DropdownMenuItem
                  className="min-h-11"
                  aria-keyshortcuts="Shift+S"
                  disabled={reader.summaryAction.disabled}
                  onSelect={() => reader.summaryAction?.regenerate()}
                >
                  <RefreshCw />
                  Regenerate summary
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="min-h-11"
                aria-label="Copy link"
                aria-keyshortcuts="Shift+C"
                onSelect={() => void handleCopyLink()}
              >
                <Link2 />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-11">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View original"
                  aria-keyshortcuts="o"
                >
                  <ExternalLink />
                  Open original
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11"
                aria-label="Deep research"
                aria-keyshortcuts="Shift+D"
                onSelect={() => setResearchOpen(true)}
              >
                <FlaskConical />
                Deep research
              </DropdownMenuItem>
              {read && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="min-h-11"
                    aria-label="Mark as unread"
                    aria-keyshortcuts="Shift+U"
                    disabled={markingRead}
                    onSelect={() => void handleMarkUnread()}
                  >
                    <Undo2 />
                    Mark as unread
                  </DropdownMenuItem>
                </>
              )}
              {knowledgeUiEnabled && (
                <ReaderLibraryMenuItems itemId={itemId} initial={initialReaderState} />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <span role="status" className="sr-only">
            {copied ? "Copied" : ""}
          </span>
        </div>
      </div>
      <DeepResearch
        itemId={itemId}
        defaultQuery={title}
        open={researchOpen}
        onOpenChange={handleResearchOpenChange}
      >
        {null}
      </DeepResearch>
    </TooltipProvider>
  );
}
