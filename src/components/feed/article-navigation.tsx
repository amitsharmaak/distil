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

const NEXT_J: ShortcutDef = { ...NEXT, id: "reader.next.j", keys: [{ key: "j" }] };
const PREV_K: ShortcutDef = { ...PREV, id: "reader.prev.k", keys: [{ key: "k" }] };

export function ArticleNavigation({ prevId, nextId, filter }: ArticleNavigationProps) {
  const router = useRouter();
  const suffix = filter ? `?filter=${filter}` : "";

  useShortcut(PREV, () => router.push(`/feed/${prevId}${suffix}`), !!prevId);
  useShortcut(NEXT, () => router.push(`/feed/${nextId}${suffix}`), !!nextId);
  useShortcut(PREV_K, () => router.push(`/feed/${prevId}${suffix}`), !!prevId);
  useShortcut(NEXT_J, () => router.push(`/feed/${nextId}${suffix}`), !!nextId);

  return null;
}
