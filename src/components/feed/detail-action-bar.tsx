"use client";

import dynamic from "next/dynamic";
import type { DetailActionBarProps } from "@/components/feed/detail-action-bar-content";

const DetailActionBarContent = dynamic(() =>
  import("@/components/feed/detail-action-bar-content").then((module) => module.DetailActionBar)
);

export function DetailActionBar(props: DetailActionBarProps) {
  return <DetailActionBarContent {...props} />;
}
