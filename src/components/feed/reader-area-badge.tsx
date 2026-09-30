"use client";

import { useState } from "react";
import { AreaBadge, type AreaBadgeProps } from "@/components/feed/area-badge";
import { useShortcut, useShortcutsSuspended } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";

const CHANGE_AREA: ShortcutDef = {
  id: "reader.area",
  keys: [{ key: "a" }],
  label: "Change area",
  group: "Reading",
  scope: "reader",
};

/** The reader's AreaBadge with the `a` shortcut wired to its menu. */
export function ReaderAreaBadge(props: AreaBadgeProps) {
  const [open, setOpen] = useState(false);
  useShortcutsSuspended(open);
  useShortcut(CHANGE_AREA, () => setOpen(true));
  return (
    <span title="Change area · A" className="inline-flex">
      <AreaBadge {...props} open={open} onOpenChange={setOpen} />
    </span>
  );
}
