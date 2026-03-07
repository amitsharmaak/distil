"use client";

import Link from "next/link";
import {
  Mail,
  Hash,
  Twitter,
  Globe,
  Link as LinkIcon,
  Play,
  Headphones,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContentItem, SourceType, ContentType } from "@/lib/types";

const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  twitter: Twitter,
  "browser-extension": Globe,
  manual: LinkIcon,
};

const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500",
  slack: "text-purple-500",
  twitter: "text-sky-500",
  "browser-extension": "text-orange-500",
  manual: "text-gray-500",
};

const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  twitter: "Twitter",
  "browser-extension": "Extension",
  manual: "Manual",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-200",
  medium: "bg-amber-500/10 text-amber-600 border-amber-200",
  low: "bg-green-500/10 text-green-600 border-green-200",
};

/** Strips markdown formatting to produce plain preview text. */
function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

function ContentTypeIcon({ type }: { type: ContentType }) {
  if (type === "video") return <Play className="h-3.5 w-3.5" />;
  if (type === "podcast") return <Headphones className="h-3.5 w-3.5" />;
  return null;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ContentCard({ item, compact = false }: { item: ContentItem; compact?: boolean }) {
  const SourceIcon = sourceIcons[item.sourceType] ?? Globe;

  if (compact) {
    return (
      <Link
        href={`/feed/${item.id}`}
        className="flex items-center gap-4 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
      >
        <SourceIcon className={`h-4 w-4 shrink-0 ${sourceColors[item.sourceType]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium line-clamp-1 ${item.isRead ? "text-muted-foreground" : ""}`}
            >
              {item.title}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.contentType !== "article" && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <ContentTypeIcon type={item.contentType} />
              {item.duration}
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] ${priorityColors[item.priority]}`}>
            {item.priority}
          </Badge>
          <span className="text-xs text-muted-foreground w-14 text-right">
            {timeAgo(item.createdAt)}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/feed/${item.id}`}>
      <Card
        className={`transition-colors hover:bg-accent/50 ${!item.isRead ? "border-l-2 border-l-primary" : ""}`}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="mt-1 shrink-0">
              <SourceIcon className={`h-5 w-5 ${sourceColors[item.sourceType]}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={`text-sm font-semibold leading-snug ${item.isRead ? "text-muted-foreground" : ""}`}
                >
                  {item.title}
                </h3>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] ${priorityColors[item.priority]}`}
                >
                  {item.priority}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                {item.aiSummary ? stripMarkdown(item.aiSummary).slice(0, 200) : item.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {sourceLabels[item.sourceType]}
                </Badge>
                {item.contentType !== "article" && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <ContentTypeIcon type={item.contentType} />
                    {item.duration}
                  </Badge>
                )}
                {item.topics.slice(0, 3).map((topic) => (
                  <Badge key={topic} variant="outline" className="text-[10px]">
                    {topic}
                  </Badge>
                ))}
                <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  {item.author && <span>{item.author}</span>}
                  {item.author && item.publication && <span>·</span>}
                  {item.publication && <span>{item.publication}</span>}
                  <span>·</span>
                  <Clock className="h-3 w-3" />
                  <span>{timeAgo(item.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
