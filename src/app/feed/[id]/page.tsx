/**
 * Item detail page — /feed/[id]
 *
 * Editorial reading experience with serif headlines, clear metadata,
 * AI summaries, and feedback. Server Component with embedded Client Components.
 */

import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Play,
  Headphones,
  Clock,
  Mail,
  Hash,
  Twitter,
  Globe,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getItemById, getItems, getFeedback, getAISummaries } from "@/lib/db";
import { detectStrategy } from "@/lib/content-strategies";
import type { SourceType } from "@/lib/types";
import { AISummary } from "@/components/feed/ai-summary";
import { FeedbackButtons } from "@/components/feed/feedback-buttons";
import { DeepResearch } from "@/components/feed/deep-research";
import { VideoEmbed } from "@/components/feed/video-embed";
import { ArticleNavigation } from "@/components/feed/article-navigation";
import { LazyArticleExtract } from "@/components/feed/lazy-article-extract";

const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  "browser-extension": Globe,
  manual: LinkIcon,
};

const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  "browser-extension": "Browser Extension",
  manual: "Manual Link",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-200",
  medium: "bg-amber-500/10 text-amber-600 border-amber-200",
  low: "bg-green-500/10 text-green-600 border-green-200",
};

function renderTweetText(text: string): React.ReactNode[] {
  const tokenPattern = /(https?:\/\/[^\s]+)|(@\w+)|(#\w+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const start = match.index!;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const token = match[0];
    if (token.startsWith("http")) {
      const display = token.length > 40 ? token.slice(0, 40) + "\u2026" : token;
      nodes.push(
        <a
          key={start}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
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
          className="text-primary hover:underline"
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
          className="text-primary hover:underline"
        >
          {token}
        </a>,
      );
    }
    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function TweetContent({
  text,
  author,
  createdAt,
}: {
  text: string;
  author?: string;
  createdAt: string;
}) {
  const paragraphs = text.split(/\n\n+/);

  return (
    <Card className="border-primary/10">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Twitter className="h-4 w-4 text-primary" />
          {author && (
            <span className="font-medium text-foreground">{author}</span>
          )}
          <span>&middot;</span>
          <time dateTime={createdAt}>
            {new Date(createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>
        <div className="space-y-4">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-base leading-7 whitespace-pre-line">
              {renderTweetText(para)}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

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

  // Don't block render on extraction — page paints immediately. Missing fullContent
  // is filled asynchronously via LazyArticleExtract + POST /api/items/[id]/extract.

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back navigation */}
      <div className="sticky top-0 z-10 -mx-8 bg-background/80 px-8 py-3 backdrop-blur-sm">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
      </div>

      {/* Keyboard navigation */}
      <ArticleNavigation
        prevId={prevItem?.id ?? null}
        nextId={nextItem?.id ?? null}
        filter={filter}
      />

      {/* Item header */}
      {strategy.detail.showTweetRenderer ? (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-xs">
              <SourceIcon className="h-3 w-3" />
              {sourceLabels[item.sourceType]}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${priorityColors[item.priority]}`}
            >
              {item.priority} priority
            </Badge>
            {item.topics.map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {topic}
              </span>
            ))}
          </div>
          <TweetContent
            text={item.summary}
            author={item.author}
            createdAt={item.createdAt}
          />
        </>
      ) : (
        <>
          {/* Metadata badges */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-xs">
              <SourceIcon className="h-3 w-3" />
              {sourceLabels[item.sourceType] ?? item.sourceType}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${priorityColors[item.priority]}`}
            >
              {item.priority} priority
            </Badge>
            {item.contentType !== "article" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {item.contentType === "video" ? (
                  <Play className="h-3 w-3" />
                ) : (
                  <Headphones className="h-3 w-3" />
                )}
                {item.contentType} &middot; {item.duration}
              </Badge>
            )}
          </div>

          {/* Title — large serif */}
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight">
            {item.title}
          </h1>

          {/* Author + date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {item.author && <span>{item.author}</span>}
            {item.author && item.publication && <span>&middot;</span>}
            {item.publication && <span>{item.publication}</span>}
            <span>&middot;</span>
            <Clock className="h-3.5 w-3.5" />
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>

          {/* Topics */}
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

          <Separator />

          {/* AI Summary — extract fullContent in background when missing so page renders fast */}
          {strategy.detail.showAISummary && (
            <LazyArticleExtract
              itemId={item.id}
              url={item.url}
              hasFullContent={!!item.fullContent}
              contentExtractedAt={item.contentExtractedAt}
            >
              <AISummary
                itemId={item.id}
                isRead={item.isRead}
                ogSummary={item.summary}
                fullContent={item.fullContent}
                initialBriefSummary={aiSummaries.brief ?? null}
                initialDetailedSummary={aiSummaries.detailed ?? null}
              />
            </LazyArticleExtract>
          )}
        </>
      )}

      {/* Feedback */}
      <FeedbackButtons
        itemId={item.id}
        initialFeedback={
          existingFeedback
            ? {
                rating: existingFeedback.rating,
                reason: existingFeedback.reason,
              }
            : null
        }
      />

      {/* Video embed or podcast placeholder */}
      {strategy.detail.showEmbedPlayer ? (
        <VideoEmbed
          url={item.url}
          contentType={item.contentType}
          duration={item.duration}
        />
      ) : item.contentType === "podcast" ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12">
            <div className="rounded-full bg-primary/10 p-4">
              <Headphones className="h-8 w-8 text-primary" />
            </div>
            <p className="mt-3 text-sm font-medium">Listen to Podcast</p>
            <p className="text-xs text-muted-foreground">{item.duration}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> View Original
          </a>
        </Button>
        <DeepResearch itemId={item.id} defaultQuery={item.title} />
      </div>
    </div>
  );
}
