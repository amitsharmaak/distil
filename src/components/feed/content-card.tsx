"use client";

import { StoryCard, type StoryCardProps } from "@/components/feed/story-card";
import type { ContentItem } from "@/lib/types";

/** Compatibility entry point for the Feed's existing card/compact preference. */
export function ContentCard({
  compact = false,
  ...props
}: Omit<StoryCardProps, "variant" | "item"> & { item: ContentItem; compact?: boolean }) {
  return <StoryCard {...props} variant={compact ? "compact" : "standard"} />;
}
