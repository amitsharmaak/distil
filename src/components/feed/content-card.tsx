"use client";

import { Play, Headphones } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkReadButton } from "@/components/feed/mark-read-button";
import { AreaBadge } from "@/components/feed/area-badge";
import { cn } from "@/lib/utils";
import { ContentItem, ContentType } from "@/lib/types";
import { detectStrategy } from "@/lib/content-strategies";
import { sourceIcons, sourceLabels, sourceColors, priorityColors } from "@/lib/constants";
import { timeAgo, stripMarkdown } from "@/lib/format";
import { IntentLink } from "@/components/navigation/intent-link";

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
  areaOpen,
  onAreaOpenChange,
}: {
  item: ContentItem;
  compact?: boolean;
  onMarkRead?: (id: string, read: boolean) => void;
  filter?: string;
  /** Controlled open state of the area menu (the `a` shortcut). */
  areaOpen?: boolean;
  onAreaOpenChange?: (open: boolean) => void;
}) {
  // Rejected items are handled in Settings for review — do not render.
  if (item.processingStatus === "rejected") {
    return null;
  }

  const SourceIcon = sourceIcons[item.sourceType];
  const strategy = detectStrategy(item.url);
  const href = `/feed/${item.id}${filter ? `?filter=${filter}` : ""}`;
  const isProcessing = item.processingStatus === "processing";

  // A stored AI summary always beats the raw excerpt (long X posts get one too).
  const displaySummary = item.aiSummary
    ? stripMarkdown(item.aiSummary).slice(0, strategy.card.summaryMaxChars)
    : (item.summary ?? "").slice(0, strategy.card.summaryMaxChars);

  const markRead =
    !isProcessing && !item.isRead ? (
      <span className="relative z-10">
        <MarkReadButton
          itemId={item.id}
          isRead={item.isRead}
          onRead={(read) => onMarkRead?.(item.id, read)}
        />
      </span>
    ) : null;

  if (compact) {
    const compactContent = (
      <>
        <SourceIcon className={`h-3.5 w-3.5 shrink-0 ${sourceColors[item.sourceType]}`} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            item.isRead ? "text-muted-foreground" : "font-medium"
          )}
        >
          {item.title}
        </span>
        {isProcessing ? (
          <Badge variant="secondary" className="text-[10px] text-muted-foreground">
            Analyzing…
          </Badge>
        ) : (
          <>
            {item.contentType !== "article" && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <ContentTypeIcon type={item.contentType} />
                {item.duration}
              </Badge>
            )}
            <Badge variant="outline" className={`text-[10px] ${priorityColors[item.priority]}`}>
              {item.priority}
            </Badge>
          </>
        )}
        <span className="w-14 text-right text-xs text-muted-foreground">
          {timeAgo(item.createdAt)}
        </span>
      </>
    );

    if (isProcessing) {
      return (
        <article
          data-row
          data-item-id={item.id}
          className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-75"
        >
          {compactContent}
        </article>
      );
    }

    return (
      <article
        data-row
        data-item-id={item.id}
        className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50"
      >
        <IntentLink
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {compactContent}
        </IntentLink>
        {markRead}
      </article>
    );
  }

  return (
    <article
      data-row
      data-item-id={item.id}
      className={cn(
        "group relative rounded-xl border border-border bg-card p-5 transition-all",
        !isProcessing && "hover:shadow-md",
        !item.isRead && !isProcessing && "border-l-2 border-l-primary",
        isProcessing && "opacity-75"
      )}
    >
      {/* Source & time */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceIcon className={`h-3.5 w-3.5 ${sourceColors[item.sourceType]}`} />
          <span>{sourceLabels[item.sourceType]}</span>
          {item.publication && (
            <>
              <span className="text-border">&middot;</span>
              <span>{item.publication}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="secondary" className="text-[10px] text-muted-foreground">
              Analyzing…
            </Badge>
          )}
          {!isProcessing && item.area && (
            <AreaBadge
              itemId={item.id}
              area={item.area}
              aiArea={item.aiArea}
              className="relative z-10"
              open={areaOpen}
              onOpenChange={onAreaOpenChange}
            />
          )}
          <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
        </div>
      </div>

      {/* Title & summary: the link covers the whole card via its stretched pseudo-element */}
      {isProcessing ? (
        <>
          <h3 className="font-serif text-lg font-semibold leading-snug tracking-tight line-clamp-2">
            {item.title}
          </h3>
          <div className="mt-1.5 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[80%]" />
            <Skeleton className="h-3 w-[75%]" />
          </div>
        </>
      ) : (
        <IntentLink
          href={href}
          className="block rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <h3
            className={cn(
              "font-serif text-lg font-semibold leading-snug tracking-tight line-clamp-2",
              item.isRead && "text-muted-foreground"
            )}
          >
            {item.title}
          </h3>
          <p className="mt-2 font-serif text-[15px] leading-relaxed text-foreground/80 line-clamp-3">
            {displaySummary}
          </p>
        </IntentLink>
      )}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!isProcessing && item.contentType !== "article" && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <ContentTypeIcon type={item.contentType} />
            {item.duration}
          </Badge>
        )}
        {isProcessing ? (
          <>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </>
        ) : (
          item.topics.slice(0, 3).map((topic) => (
            <span
              key={topic}
              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {topic}
            </span>
          ))
        )}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {!isProcessing && item.author && <span>{item.author}</span>}
          {!isProcessing && (
            <Badge variant="outline" className={`text-[10px] ${priorityColors[item.priority]}`}>
              {item.priority}
            </Badge>
          )}
          {markRead}
        </div>
      </div>
    </article>
  );
}
