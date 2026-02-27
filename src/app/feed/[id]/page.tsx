"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Play,
  Headphones,
  Search,
  Clock,
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
  Globe,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { mockItems } from "@/lib/mock-data";
import { SourceType } from "@/lib/types";

const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  whatsapp: MessageCircle,
  twitter: Twitter,
  linkedin: Linkedin,
  "browser-extension": Globe,
  manual: LinkIcon,
};

const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  whatsapp: "WhatsApp",
  twitter: "Twitter",
  linkedin: "LinkedIn",
  "browser-extension": "Browser Extension",
  manual: "Manual Link",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-200",
  medium: "bg-amber-500/10 text-amber-600 border-amber-200",
  low: "bg-green-500/10 text-green-600 border-green-200",
};

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const item = mockItems.find((i) => i.id === id);

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

  const SourceIcon = sourceIcons[item.sourceType];
  const relatedItems = mockItems
    .filter(
      (i) =>
        i.id !== item.id &&
        i.topics.some((t) => item.topics.includes(t))
    )
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to feed
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-3">
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

      {/* AI Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center">
              <Zap className="h-3 w-3 text-primary" />
            </div>
            AI Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {item.summary}
          </p>
          {item.fullContent && (
            <p className="mt-4 text-sm leading-relaxed">{item.fullContent}</p>
          )}
        </CardContent>
      </Card>

      {/* Video/Podcast embed placeholder */}
      {item.contentType !== "article" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12">
            <div className="rounded-full bg-primary/10 p-4">
              {item.contentType === "video" ? (
                <Play className="h-8 w-8 text-primary" />
              ) : (
                <Headphones className="h-8 w-8 text-primary" />
              )}
            </div>
            <p className="mt-3 text-sm font-medium">
              {item.contentType === "video" ? "Watch Video" : "Listen to Podcast"}
            </p>
            <p className="text-xs text-muted-foreground">{item.duration}</p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="gap-2" asChild>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> View Original
          </a>
        </Button>
        <Button variant="default" className="gap-2">
          <Search className="h-4 w-4" /> Deep Research
        </Button>
      </div>

      {/* Related Items */}
      {relatedItems.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold mb-3">Related</h2>
            <div className="space-y-2">
              {relatedItems.map((related) => {
                const RelIcon = sourceIcons[related.sourceType];
                return (
                  <Link
                    key={related.id}
                    href={`/feed/${related.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <RelIcon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">
                        {related.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {related.author} · {related.publication}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {related.topics
                        .filter((t) => item.topics.includes(t))
                        .slice(0, 2)
                        .map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="text-[10px]"
                          >
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

function Zap(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}
