"use client";

import Link from "next/link";
import {
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
  Globe,
  Link as LinkIcon,
  Play,
  Headphones,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockItems } from "@/lib/mock-data";
import { SourceType, ContentType } from "@/lib/types";

const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  whatsapp: MessageCircle,
  twitter: Twitter,
  linkedin: Linkedin,
  "browser-extension": Globe,
  manual: LinkIcon,
};

const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500",
  slack: "text-purple-500",
  whatsapp: "text-green-500",
  twitter: "text-sky-500",
  linkedin: "text-blue-600",
  "browser-extension": "text-orange-500",
  manual: "text-gray-500",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-200",
  medium: "bg-amber-500/10 text-amber-600 border-amber-200",
  low: "bg-green-500/10 text-green-600 border-green-200",
};

function ContentTypeIcon({ type }: { type: ContentType }) {
  if (type === "video") return <Play className="h-3 w-3" />;
  if (type === "podcast") return <Headphones className="h-3 w-3" />;
  return null;
}

export function PriorityFeed() {
  const priorityItems = mockItems
    .filter((item) => !item.isRead)
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">
          Priority Reading
        </CardTitle>
        <Link
          href="/feed"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {priorityItems.map((item) => {
          const SourceIcon = sourceIcons[item.sourceType];
          return (
            <Link
              key={item.id}
              href={`/feed/${item.id}`}
              className="group flex gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
            >
              <div className="mt-0.5 shrink-0">
                <SourceIcon
                  className={`h-4 w-4 ${sourceColors[item.sourceType]}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <h3 className="text-sm font-medium leading-snug line-clamp-1 flex-1">
                    {item.title}
                  </h3>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${priorityColors[item.priority]}`}
                  >
                    {item.priority}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {item.summary}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {item.contentType !== "article" && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <ContentTypeIcon type={item.contentType} />
                      {item.duration}
                    </Badge>
                  )}
                  {item.topics.slice(0, 2).map((topic) => (
                    <Badge
                      key={topic}
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {topic}
                    </Badge>
                  ))}
                  {item.author && (
                    <span className="text-[10px] text-muted-foreground">
                      by {item.author}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
