"use client";

import Link from "next/link";
import { Play, Headphones } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MarkReadButton } from "@/components/feed/mark-read-button";
import { cn } from "@/lib/utils";
import { ContentItem, SourceType, ContentType } from "@/lib/types";
import { detectStrategy } from "@/lib/content-strategies";
import { sourceIcons, sourceLabels, sourceColors, priorityColors } from "@/lib/constants";
import { timeAgo, stripMarkdown } from "@/lib/format";

function ContentTypeIcon({ type }: { type: ContentType }) {
  if (type === "video") return <Play className="h-3.5 w-3.5" />;
  if (type === "podcast") return <Headphones className="h-3.5 w-3.5" />;
  return null;
}

export function ContentCard({
  item,
  compact = false,
  onMarkRead,
  filter,
}: {
  item: ContentItem;
  compact?: boolean;
  onMarkRead?: (id: string) => void;
  filter?: string;
}) {
  const SourceIcon = sourceIcons[item.sourceType];
  const strategy = detectStrategy(item.url);
  const filterSuffix = filter ? `?filter=${filter}` : "";

  const displaySummary = item.aiSummary
    ? stripMarkdown(item.aiSummary).slice(0, strategy.card.summaryMaxChars)
    : item.summary;

  if (compact) {
    return (
      <Link
        href={`/feed/${item.id}${filterSuffix}`}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50"
      >
        <SourceIcon
          className={`h-3.5 w-3.5 shrink-0 ${sourceColors[item.sourceType]}`}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            item.isRead ? "text-muted-foreground" : "font-medium",
          )}
        >
          {item.title}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {item.contentType !== "article" && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <ContentTypeIcon type={item.contentType} />
              {item.duration}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] ${priorityColors[item.priority]}`}
          >
            {item.priority}
          </Badge>
          <span className="w-14 text-right text-xs text-muted-foreground">
            {timeAgo(item.createdAt)}
          </span>
          {!item.isRead && (
            <MarkReadButton
              itemId={item.id}
              isRead={item.isRead}
              onRead={() => onMarkRead?.(item.id)}
            />
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/feed/${item.id}${filterSuffix}`} className="group block">
      <article
        className={cn(
          "relative rounded-xl border border-border bg-card p-5 transition-all hover:shadow-md",
          !item.isRead && "border-l-2 border-l-primary",
        )}
      >
        {/* Source & time */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SourceIcon
              className={`h-3.5 w-3.5 ${sourceColors[item.sourceType]}`}
            />
            <span>{sourceLabels[item.sourceType]}</span>
            {item.publication && (
              <>
                <span className="text-border">&middot;</span>
                <span>{item.publication}</span>
              </>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {timeAgo(item.createdAt)}
          </span>
        </div>

        {/* Title */}
        <h3
          className={cn(
            "font-serif text-base font-semibold leading-snug tracking-tight line-clamp-2",
            item.isRead && "text-muted-foreground",
          )}
        >
          {item.title}
        </h3>

        {/* Summary */}
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground line-clamp-2">
          {displaySummary}
        </p>

        {/* Footer */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.contentType !== "article" && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <ContentTypeIcon type={item.contentType} />
              {item.duration}
            </Badge>
          )}
          {item.topics.slice(0, 3).map((topic) => (
            <span
              key={topic}
              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {topic}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            {item.author && <span>{item.author}</span>}
            <Badge
              variant="outline"
              className={`text-[10px] ${priorityColors[item.priority]}`}
            >
              {item.priority}
            </Badge>
            {!item.isRead && (
              <MarkReadButton
                itemId={item.id}
                isRead={item.isRead}
                onRead={() => onMarkRead?.(item.id)}
              />
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
