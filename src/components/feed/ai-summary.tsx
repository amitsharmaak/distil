"use client";

import dynamic from "next/dynamic";
import type { AISummaryProps } from "@/components/feed/ai-summary-content";

const AISummaryContent = dynamic(() =>
  import("@/components/feed/ai-summary-content").then((module) => module.AISummary)
);

export function AISummary(props: AISummaryProps) {
  return <AISummaryContent {...props} />;
}
