"use client";

import { useId, useState } from "react";
import { Play, ExternalLink, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ContentType } from "@/lib/types";

/**
 * Extracts a YouTube embed URL from a standard watch or short URL.
 * Returns null if the URL is not a recognizable YouTube link.
 */
function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Standard: youtube.com/watch?v=VIDEO_ID
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    // Short: youtu.be/VIDEO_ID
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Checks if the URL points to Twitter / X. */
function isTwitterUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "twitter.com" ||
      u.hostname === "www.twitter.com" ||
      u.hostname === "x.com" ||
      u.hostname === "www.x.com"
    );
  } catch {
    return false;
  }
}

interface VideoEmbedProps {
  url: string;
  contentType: ContentType;
  duration?: string;
}

export function VideoEmbed({ url, contentType, duration }: VideoEmbedProps) {
  if (contentType !== "video") return null;

  // YouTube embed
  const ytEmbed = getYouTubeEmbedUrl(url);
  if (ytEmbed) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <iframe
          src={ytEmbed}
          className="w-full aspect-video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video player"
        />
      </div>
    );
  }

  // Twitter / X — link card (embedding tweets requires Twitter's external widget JS)
  if (isTwitterUrl(url)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 gap-3">
          <div className="rounded-full bg-muted p-4">
            <svg className="h-8 w-8 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
          <p className="text-sm font-medium">View this post on X</p>
          {duration && <p className="text-xs text-muted-foreground">{duration}</p>}
          <Button variant="outline" size="sm" className="min-h-11 gap-2" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open on X
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Generic video fallback
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-12">
        <div className="rounded-full bg-muted p-4">
          <Play className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium">Watch Video</p>
        {duration && <p className="text-xs text-muted-foreground">{duration}</p>}
        <Button variant="outline" size="sm" className="mt-3 min-h-11 gap-2" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open Video
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Keep the reader about the text until its video player is requested. */
export function VideoDisclosure({
  nativeVideoUrl,
  ...video
}: VideoEmbedProps & { nativeVideoUrl?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [nativeFailed, setNativeFailed] = useState(false);
  const playerId = useId();
  return (
    <div className="mb-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={playerId}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Play className="h-4 w-4" />
        <span>{expanded ? "Hide video" : "Play video"}</span>
        {video.duration && <span className="text-xs">· {video.duration}</span>}
        <ChevronDown
          className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      <div id={playerId} hidden={!expanded}>
        {expanded && (
          <div className="mt-2 overflow-hidden rounded-lg">
            {nativeVideoUrl && !nativeFailed ? (
              <video
                src={nativeVideoUrl}
                controls
                autoPlay
                preload="metadata"
                className="aspect-video w-full bg-muted"
                onError={() => setNativeFailed(true)}
              />
            ) : (
              <VideoEmbed {...video} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
