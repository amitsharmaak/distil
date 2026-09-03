"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { timeAgo, stripMarkdown } from "@/lib/format";
import { MarkReadButton } from "@/components/feed/mark-read-button";
import type { ContentItem } from "@/lib/types";

const priorityDot: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-teal-500",
};

export function InsightCard({
  item,
  onMarkRead,
  filter,
}: {
  item: ContentItem;
  onMarkRead?: (id: string) => void;
  filter?: string;
}) {
  const filterSuffix = filter ? `?filter=${filter}` : "";
  const displaySummary = item.aiSummary
    ? stripMarkdown(item.aiSummary).slice(0, 180)
    : item.summary?.slice(0, 180);

  const meta = [
    item.author,
    item.publication,
    timeAgo(item.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/feed/${item.id}${filterSuffix}`} className="group block">
      <div
        className={cn(
          "flex gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-accent/40",
          !item.isRead && "bg-card",
        )}
      >
        {/* Left gutter — priority dot */}
        <div className="flex flex-col items-center pt-[7px]">
          <div
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              priorityDot[item.priority] ?? "bg-muted-foreground/40",
              item.isRead && "opacity-30",
            )}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "font-serif text-[15px] leading-snug tracking-tight line-clamp-2",
              item.isRead
                ? "font-normal text-muted-foreground"
                : "font-semibold text-foreground",
            )}
          >
            {item.title}
          </h3>

          {displaySummary && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
              {displaySummary}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground/60">
            <span>{meta}</span>
            {item.topics.slice(0, 2).map((topic) => (
              <span key={topic} className="text-primary/50">
                · {topic}
              </span>
            ))}
          </div>
        </div>

        {/* Mark read */}
        {!item.isRead && (
          <div className="shrink-0 self-start pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <MarkReadButton
              itemId={item.id}
              isRead={item.isRead}
              onRead={() => onMarkRead?.(item.id)}
            />
          </div>
        )}
      </div>
    </Link>
  );
}
