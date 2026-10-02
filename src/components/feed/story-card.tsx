"use client";

import { AreaBadge } from "@/components/feed/area-badge";
import { MarkReadButton } from "@/components/feed/mark-read-button";
import { IntentLink } from "@/components/navigation/intent-link";
import type { KnowledgeItem } from "@/components/phase2/types";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { cardExcerpt, displayTitle, publisherLabel, readTimeLabel } from "@/lib/display";
import { toSummaryDigest } from "@/lib/format";
import type { ContentItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface StoryCardProps {
  item: ContentItem | KnowledgeItem;
  variant?: "lead" | "standard" | "compact";
  className?: string;
  filter?: string;
  onMarkRead?: (id: string, read: boolean) => void;
  areaOpen?: boolean;
  onAreaOpenChange?: (open: boolean) => void;
}

/** One reading row for the edition and the feed; controls are siblings of its link. */
export function StoryCard({
  item,
  variant = "standard",
  className,
  filter,
  onMarkRead,
  areaOpen,
  onAreaOpenChange,
}: StoryCardProps) {
  const knowledgeItem = "href" in item;
  const processing = !knowledgeItem && item.processingStatus === "processing";
  if (!knowledgeItem && item.processingStatus === "rejected") return null;

  const lead = variant === "lead";
  const compact = variant === "compact";
  const title = displayTitle({ ...item, url: item.url ?? "" });
  const excerpt = cardExcerpt(item, lead ? 260 : 180);
  const points = lead ? toSummaryDigest(item.aiSummary || item.summary, 3).points : [];
  const readTime = readTimeLabel(item);
  const href = knowledgeItem
    ? item.href
    : `/feed/${item.id}${filter ? `?filter=${encodeURIComponent(filter)}` : ""}`;

  const headline = (
    <h3
      className={cn(
        "font-serif leading-snug tracking-tight text-pretty",
        lead ? "text-xl sm:text-2xl lg:text-page-title" : "text-lg sm:text-xl",
        item.isRead ? "font-normal text-foreground/85" : "font-semibold text-foreground"
      )}
    >
      {!item.isRead && !processing && (
        <span
          className="mr-2 inline-block size-1.5 rounded-full bg-primary align-middle"
          role="img"
          aria-label="Unread"
        />
      )}
      {title}
    </h3>
  );

  return (
    <article
      data-row
      data-item-id={item.id}
      data-story-variant={variant}
      className={cn(
        "relative min-w-0 border-b border-border py-2 sm:py-4",
        processing && "opacity-75",
        className
      )}
    >
      <div className="flex min-h-6 items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="min-w-0 truncate font-medium">{publisherLabel(item)}</p>
        {processing ? (
          <StatusBadge tone="info">Analyzing…</StatusBadge>
        ) : (
          <AreaBadge
            itemId={item.id}
            area={item.area}
            aiArea={item.aiArea}
            className="relative z-10 -my-2 -mr-2 shrink-0"
            open={areaOpen}
            onOpenChange={onAreaOpenChange}
          />
        )}
      </div>

      <div className={cn("mt-1 flex items-start gap-4", lead && "lg:flex-col lg:gap-4")}>
        <div className="min-w-0 flex-1">
          {processing ? (
            headline
          ) : (
            <IntentLink
              href={href}
              className="block rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {headline}
            </IntentLink>
          )}
          {!compact &&
            (processing ? (
              <div className="mt-2 space-y-2" aria-label="Preparing story">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ) : (
              excerpt && (
                <p
                  className={cn(
                    "mt-2 line-clamp-2 font-serif text-base leading-snug sm:leading-relaxed text-muted-foreground",
                    lead && "lg:line-clamp-none lg:text-lg"
                  )}
                >
                  {excerpt}
                </p>
              )
            ))}
          {lead && !processing && points.length > 0 && (
            <ul className="mt-3 hidden space-y-2 pl-4 font-serif text-base leading-snug sm:leading-relaxed text-muted-foreground lg:block">
              {points.map((point, index) => (
                <li key={`${index}-${point}`} className="list-disc marker:text-muted-foreground/60">
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
        {item.thumbnailUrl && (
          <div
            className={cn(
              "aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-md bg-muted/40 sm:w-28",
              lead && "w-24 sm:w-32 lg:order-first lg:aspect-[16/9] lg:w-full"
            )}
          >
            {/* Remote capture imagery is intentionally not proxied or optimized. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>

      <div className="mt-2 flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
        {readTime && <span>{readTime}</span>}
        {item.priority === "high" && (
          <>
            {readTime && <span aria-hidden="true">·</span>}
            <span>High priority</span>
          </>
        )}
        {!knowledgeItem && !processing && !item.isRead && (
          <span className="relative z-10 ml-auto -my-2 [&_button]:size-11">
            <MarkReadButton
              itemId={item.id}
              isRead={item.isRead}
              onRead={(read) => onMarkRead?.(item.id, read)}
            />
          </span>
        )}
      </div>
    </article>
  );
}
