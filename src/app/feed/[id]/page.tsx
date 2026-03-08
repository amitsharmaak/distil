/**
 * Item detail page — /feed/[id]
 *
 * Shows the full details of a single content item: title, metadata, AI summary,
 * feedback buttons, and a list of related items sharing the same topics.
 *
 * This is an async Server Component. It fetches data directly from the database
 * without going through an HTTP round-trip, which is the idiomatic App Router
 * pattern for pages that have no client-side interactivity.
 *
 * Interactive parts (AI summary generation, feedback) are Client Components
 * rendered within this server page.
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
import { getItemById, getItems, getFeedback, getAISummaries, updateItem } from "@/lib/db";
import { fetchOG } from "@/lib/og";
import { extractContent } from "@/lib/content-extractor";
import { detectStrategy } from "@/lib/content-strategies";
import type { SourceType } from "@/lib/types";
import { AISummary } from "@/components/feed/ai-summary";
import { FeedbackButtons } from "@/components/feed/feedback-buttons";
import { DeepResearch } from "@/components/feed/deep-research";
import { VideoEmbed } from "@/components/feed/video-embed";
import { ArticleNavigation } from "@/components/feed/article-navigation";
import { MarkReadButton } from "@/components/feed/mark-read-button";

// ── Source icon + label mappings ───────────────────────────────────────────────

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

// ── Tweet content renderer ──────────────────────────────────────────────────────

/**
 * Converts raw tweet text into React elements with clickable links,
 * @mentions, #hashtags, and preserved line breaks.
 */
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
      const display = token.length > 40 ? token.slice(0, 40) + "…" : token;
      nodes.push(
        <a
          key={start}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-500 hover:underline break-all"
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
          className="text-sky-500 hover:underline"
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
          className="text-sky-500 hover:underline"
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
    <Card className="border-sky-200/50 dark:border-sky-800/30">
      <CardContent className="p-6">
        {/* Author + date attribution */}
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Twitter className="h-4 w-4 text-sky-500" />
          {author && <span className="font-medium text-foreground">{author}</span>}
          <span>·</span>
          <time dateTime={createdAt}>
            {new Date(createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>

        {/* Tweet body */}
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

// ── Page component ─────────────────────────────────────────────────────────────

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch the item directly from SQLite — no HTTP call needed in server context.
  const item = getItemById(id);

  // If the item doesn't exist, show a simple 404 message.
  if (!item) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-lg font-semibold">Item not found</h2>
        <Link href="/feed" className="text-sm text-muted-foreground hover:underline">
          Back to feed
        </Link>
      </div>
    );
  }

  // Lazily fetch and persist content + OG metadata if missing (e.g. Slack items).
  if (!item.fullContent && item.url) {
    const [extraction, og] = await Promise.all([
      extractContent(item.url),
      !item.thumbnailUrl ? fetchOG(item.url) : Promise.resolve(null),
    ]);

    const patch: Record<string, unknown> = {};
    if (extraction?.content) {
      patch.fullContent = extraction.content;
      item.fullContent = extraction.content;
    }
    if (extraction?.extractedLinks) {
      patch.extractedLinks = extraction.extractedLinks;
      item.extractedLinks = extraction.extractedLinks;
    }
    if (og?.image && !item.thumbnailUrl) {
      patch.thumbnailUrl = og.image;
      item.thumbnailUrl = og.image;
    }
    if (og?.siteName && !item.publication) {
      patch.publication = og.siteName;
      item.publication = og.siteName;
    }
    if (Object.keys(patch).length > 0) {
      updateItem(item.id, patch);
    }
  }

  const SourceIcon = sourceIcons[item.sourceType] ?? Globe;

  // Determine rendering strategy based on URL.
  const strategy = detectStrategy(item.url);

  // Fetch both brief and detailed AI summaries for this item.
  const aiSummaries = getAISummaries(item.id);
  const existingFeedback = getFeedback(item.id);

  // Fetch the full feed to determine prev/next navigation and related items.
  const allItems = getItems();
  const currentIndex = allItems.findIndex((i) => i.id === item.id);
  const prevItem = currentIndex > 0 ? allItems[currentIndex - 1] : null;
  const nextItem = currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null;

  const relatedItems = allItems
    .filter((i) => i.id !== item.id && i.topics.some((t) => item.topics.includes(t)))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back navigation */}
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to feed
      </Link>

      {/* Keyboard-only prev/next navigation (arrow keys) */}
      <ArticleNavigation
        prevId={prevItem?.id ?? null}
        nextId={nextItem?.id ?? null}
      />

      {/* Item header */}
      {strategy.detail.showTweetRenderer ? (
        <>
          {/* Twitter: compact header — just badges, then straight into the tweet */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-xs">
              <SourceIcon className="h-3 w-3" />
              {sourceLabels[item.sourceType]}
            </Badge>
            <Badge variant="outline" className={`text-xs ${priorityColors[item.priority]}`}>
              {item.priority} priority
            </Badge>
            {item.topics.map((topic) => (
              <Badge key={topic} variant="outline" className="text-xs">
                {topic}
              </Badge>
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
          {/* Non-Twitter: full header with title, metadata, topics */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="gap-1 text-xs">
                <SourceIcon className="h-3 w-3" />
                {sourceLabels[item.sourceType] ?? item.sourceType}
              </Badge>
              <Badge variant="outline" className={`text-xs ${priorityColors[item.priority]}`}>
                {item.priority} priority
              </Badge>
              {item.contentType !== "article" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {item.contentType === "video" ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <Headphones className="h-3 w-3" />
                  )}
                  {item.contentType} · {item.duration}
                </Badge>
              )}
            </div>

            <h1 className="text-2xl font-bold tracking-tight">{item.title}</h1>

            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              {item.author && <span>{item.author}</span>}
              {item.author && item.publication && <span>·</span>}
              {item.publication && <span>{item.publication}</span>}
              <span>·</span>
              <Clock className="h-3.5 w-3.5" />
              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.topics.map((topic) => (
                <Badge key={topic} variant="outline" className="text-xs">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />
          {strategy.detail.showAISummary && (
            <AISummary
              itemId={item.id}
              ogSummary={item.summary}
              fullContent={item.fullContent}
              initialBriefSummary={aiSummaries.brief ?? null}
              initialDetailedSummary={aiSummaries.detailed ?? null}
            />
          )}
        </>
      )}

      {/* Feedback — like/dislike with optional reason */}
      <FeedbackButtons
        itemId={item.id}
        initialFeedback={
          existingFeedback
            ? { rating: existingFeedback.rating, reason: existingFeedback.reason }
            : null
        }
      />

      {/* Video embed (YouTube / Twitter) or podcast placeholder */}
      {strategy.detail.showEmbedPlayer ? (
        <VideoEmbed url={item.url} contentType={item.contentType} duration={item.duration} />
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
        <MarkReadButton itemId={item.id} isRead={item.isRead} showLabel />
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> View Original
          </a>
        </Button>
        <DeepResearch itemId={item.id} defaultQuery={item.title} />
      </div>

      {/* Related items */}
      {relatedItems.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold mb-3">Related</h2>
            <div className="space-y-2">
              {relatedItems.map((related) => {
                const RelIcon = sourceIcons[related.sourceType] ?? Globe;
                return (
                  <Link
                    key={related.id}
                    href={`/feed/${related.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <RelIcon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{related.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {related.author} · {related.publication}
                      </p>
                    </div>
                    {/* Show shared topic tags */}
                    <div className="flex gap-1">
                      {related.topics
                        .filter((t) => item.topics.includes(t))
                        .slice(0, 2)
                        .map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
