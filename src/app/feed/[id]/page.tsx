/**
 * Item detail page — /feed/[id]
 *
 * Unified reader-mode experience. Every content type (article, tweet, video,
 * podcast) gets the same structural layout: header → ornamental divider →
 * content body → sticky action bar. Only the content body varies by type.
 */

import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Headphones,
  Mail,
  Hash,
  Globe,
  Link as LinkIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getItemById, getItems, getFeedback, getAISummaries } from "@/lib/db";
import { detectStrategy } from "@/lib/content-strategies";
import type { SourceType } from "@/lib/types";
import { priorityColors } from "@/lib/constants";
import { AISummary } from "@/components/feed/ai-summary";
import { VideoEmbed } from "@/components/feed/video-embed";
import { ArticleNavigation } from "@/components/feed/article-navigation";
import { LazyArticleExtract } from "@/components/feed/lazy-article-extract";
import { DetailActionBar } from "@/components/feed/detail-action-bar";

/* ── Constants ── */

const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  "browser-extension": Globe,
  manual: LinkIcon,
};

const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  "browser-extension": "Extension",
  manual: "Link",
};


/* ── Helpers ── */

/**
 * Derives a display title, truncated at a word boundary.
 * Falls back to the first sentence of the summary when the title is missing
 * or is just a raw URL.
 */
function getDisplayTitle(
  title: string,
  summary: string,
  maxLen = 100,
): string {
  const isUrl = /^https?:\/\//.test(title);
  let text = !isUrl && title ? title : "";

  if (!text && summary) {
    const firstSentence = summary.split(/(?<=[.!?])\s/)[0];
    text = firstSentence || summary;
  }

  if (!text) return "Untitled";
  if (text.length <= maxLen) return text;

  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return (
    (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) +
    "\u2026"
  );
}

/** Tokenise tweet text into clickable @mentions, #hashtags, and URLs. */
function renderTweetText(text: string): React.ReactNode[] {
  const tokenPattern = /(https?:\/\/[^\s]+)|(@\w+)|(#\w+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const start = match.index!;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const token = match[0];
    const linkClass = "text-primary hover:underline";

    if (token.startsWith("http")) {
      const display = token.length > 40 ? token.slice(0, 40) + "\u2026" : token;
      nodes.push(
        <a
          key={start}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} break-all`}
        >
          {display}
        </a>,
      );
    } else if (token.startsWith("@")) {
      nodes.push(
        <a
          key={start}
          href={`https://x.com/${token.slice(1)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {token}
        </a>,
      );
    } else {
      nodes.push(
        <a
          key={start}
          href={`https://x.com/hashtag/${token.slice(1)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {token}
        </a>,
      );
    }
    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/* ── Page ── */

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { id } = await params;
  const { filter } = await searchParams;

  const item = getItemById(id);

  if (!item) {
    return (
      <div className="py-16 text-center">
        <h2 className="font-serif text-lg font-semibold">Item not found</h2>
        <Link
          href="/feed"
          className="mt-2 text-sm text-muted-foreground hover:underline"
        >
          Back to feed
        </Link>
      </div>
    );
  }

  const SourceIcon = sourceIcons[item.sourceType] ?? Globe;
  const strategy = detectStrategy(item.url);
  const aiSummaries = getAISummaries(item.id);
  const existingFeedback = getFeedback(item.id);

  const allItems = getItems();
  const navItems =
    filter === "all"
      ? allItems
      : allItems.filter((i) => !i.isRead || i.id === item.id);
  const currentIndex = navItems.findIndex((i) => i.id === item.id);
  const prevItem = currentIndex > 0 ? navItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex < navItems.length - 1 ? navItems[currentIndex + 1] : null;

  const displayTitle = getDisplayTitle(item.title, item.summary);
  const formattedDate = new Date(item.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="distil-reader-page mx-auto max-w-2xl pb-24 md:pb-20">
      {/* Back navigation */}
      <div className="sticky top-0 z-10 -mx-8 bg-background/80 px-8 py-3 backdrop-blur-sm">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
      </div>

      {/* Keyboard prev / next (invisible) */}
      <ArticleNavigation
        prevId={prevItem?.id ?? null}
        nextId={nextItem?.id ?? null}
        filter={filter}
      />

      {/* ── Unified header ── */}
      <header className="mt-2 mb-5 space-y-2">
        {/* Meta line: source · date · content type · priority */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceIcon className="h-3.5 w-3.5" />
          <span>{sourceLabels[item.sourceType] ?? item.sourceType}</span>
          <span className="text-border">&middot;</span>
          <time dateTime={item.createdAt}>{formattedDate}</time>
          {item.contentType !== "article" && (
            <>
              <span className="text-border">&middot;</span>
              {item.contentType === "video" ? (
                <Play className="h-3 w-3" />
              ) : (
                <Headphones className="h-3 w-3" />
              )}
              <span className="capitalize">{item.contentType}</span>
              {item.duration && (
                <>
                  <span className="text-border">&middot;</span>
                  <span>{item.duration}</span>
                </>
              )}
            </>
          )}
          <Badge
            variant="outline"
            className={`ml-auto h-4 py-0 text-[10px] leading-none ${priorityColors[item.priority]}`}
          >
            {item.priority}
          </Badge>
        </div>

        {/* Title — restrained serif, truncated at ~100 chars */}
        <h1
          className="font-serif text-xl font-medium leading-snug tracking-tight"
          title={item.title !== displayTitle ? item.title : undefined}
        >
          {displayTitle}
        </h1>

        {/* Author / publication */}
        {(item.author || item.publication) && (
          <p className="text-sm text-muted-foreground">
            {item.author}
            {item.author && item.publication && (
              <span className="mx-1.5 text-border">&middot;</span>
            )}
            {item.publication}
          </p>
        )}

        {/* Topics */}
        {item.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.topics.map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {topic}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Ornamental divider */}
      <div className="distil-ornament mb-5" aria-hidden="true">
        <span className="select-none text-[10px] text-border">&diams;</span>
      </div>

      {/* ── Content body ── */}
      <section className="min-h-[30vh]">
        {/* Video embed (when applicable) */}
        {strategy.detail.showEmbedPlayer && (
          <div className="mb-6">
            <VideoEmbed
              url={item.url}
              contentType={item.contentType}
              duration={item.duration}
            />
          </div>
        )}

        {strategy.detail.showTweetRenderer ? (
          /* Tweet — rendered directly in reader typography, with inline video if present */
          <div className="space-y-5">
            {(() => {
              const twitterVideo = (item.detectedMedia as Array<{ type: string; platform?: string; embedUrl?: string }> | undefined)
                ?.find((m) => m.type === "video" && m.platform === "twitter");
              return twitterVideo?.embedUrl ? (
                <video
                  src={twitterVideo.embedUrl}
                  controls
                  className="w-full rounded-xl border border-border"
                  style={{ maxHeight: 480 }}
                />
              ) : null;
            })()}
            <div className="distil-reader space-y-4">
              {item.summary.split(/\n\n+/).map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {renderTweetText(para)}
                </p>
              ))}
            </div>
          </div>
        ) : strategy.detail.showAISummary ? (
          /* Article — AI summary with lazy content extraction */
          <LazyArticleExtract
            itemId={item.id}
            url={item.url}
            hasFullContent={!!item.fullContent}
            contentExtractedAt={item.contentExtractedAt}
          >
            <AISummary
              itemId={item.id}
              ogSummary={item.summary}
              fullContent={item.fullContent}
              initialBriefSummary={aiSummaries.brief ?? null}
              initialDetailedSummary={aiSummaries.detailed ?? null}
            />
          </LazyArticleExtract>
        ) : item.contentType === "podcast" &&
          !strategy.detail.showEmbedPlayer ? (
          /* Podcast placeholder */
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12">
              <div className="rounded-full bg-primary/10 p-4">
                <Headphones className="h-8 w-8 text-primary" />
              </div>
              <p className="mt-3 text-sm font-medium">Listen to Podcast</p>
              {item.duration && (
                <p className="text-xs text-muted-foreground">{item.duration}</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* ── Sticky action bar ── */}
      <DetailActionBar
        itemId={item.id}
        url={item.url}
        title={item.title}
        isRead={item.isRead}
        prevId={prevItem?.id ?? null}
        nextId={nextItem?.id ?? null}
        filter={filter}
        initialFeedback={
          existingFeedback
            ? {
                rating: existingFeedback.rating,
                reason: existingFeedback.reason,
              }
            : null
        }
      />
    </div>
  );
}
