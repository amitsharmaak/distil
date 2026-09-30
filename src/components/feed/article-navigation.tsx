"use client";

import { useRouter } from "next/navigation";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";

interface ArticleNavigationProps {
  prevId: string | null;
  nextId: string | null;
  filter?: string;
}

const PREV: ShortcutDef = {
  id: "reader.prev",
  keys: [{ key: "ArrowLeft" }],
  label: "Previous item",
  group: "Reading",
  scope: "reader",
};
const NEXT: ShortcutDef = {
  id: "reader.next",
  keys: [{ key: "ArrowRight" }],
  label: "Next item",
  group: "Reading",
  scope: "reader",
};

export function ArticleNavigation({ prevId, nextId, filter }: ArticleNavigationProps) {
  const router = useRouter();
  const suffix = filter ? `?filter=${filter}` : "";

  useShortcut(PREV, () => router.push(`/feed/${prevId}${suffix}`), !!prevId);
  useShortcut(NEXT, () => router.push(`/feed/${nextId}${suffix}`), !!nextId);

  return null;
}
