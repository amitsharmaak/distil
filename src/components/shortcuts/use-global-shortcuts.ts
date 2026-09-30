"use client";

import { useRouter } from "next/navigation";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import { useShortcut } from "./shortcuts-provider";

const nav = (id: string, letter: string, label: string): ShortcutDef => ({
  id,
  keys: [{ key: "g" }, { key: letter }],
  label,
  group: "Navigation",
  scope: "global",
});

const GO_TODAY = nav("nav.today", "t", "Go to Today");
const GO_FEED = nav("nav.feed", "f", "Go to Feed");
const GO_RESEARCH = nav("nav.research", "r", "Go to Research");
const GO_SETTINGS = nav("nav.settings", "s", "Go to Settings");

const SIDEBAR: ShortcutDef = {
  id: "nav.sidebar",
  keys: [{ key: "[" }],
  label: "Collapse or expand sidebar",
  group: "Navigation",
  scope: "global",
};

const SEARCH: ShortcutDef = {
  id: "search.focus",
  keys: [{ key: "/" }],
  label: "Search",
  group: "General",
  scope: "global",
  alwaysOn: true,
};

/** Registers the app-wide navigation, sidebar and search shortcuts. */
export function useGlobalShortcuts(toggleSidebar: () => void): void {
  const router = useRouter();
  // The Today page lives at "/" (there is no /today route).
  useShortcut(GO_TODAY, () => router.push("/"));
  useShortcut(GO_FEED, () => router.push("/feed"));
  useShortcut(GO_RESEARCH, () => router.push("/research"));
  useShortcut(GO_SETTINGS, () => router.push("/settings"));
  useShortcut(SIDEBAR, toggleSidebar);
  useShortcut(SEARCH, () => {
    const input = document.querySelector<HTMLElement>("[data-search-input]");
    if (input) input.focus();
    else router.push("/feed?focus=search");
  });
}
