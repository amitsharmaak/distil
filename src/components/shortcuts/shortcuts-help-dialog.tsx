"use client";

import { Fragment } from "react";
import { isMacPlatform } from "@/lib/shortcuts/match";
import type { ShortcutDef, ShortcutKey } from "@/lib/shortcuts/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { useRegisteredShortcuts, useShortcutScope, useShortcutsHelp } from "./shortcuts-provider";
import { setSingleKeyShortcuts, useSingleKeyShortcuts } from "./shortcuts-preference";

const KEY_NAMES: Record<string, string> = {
  Escape: "Esc",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "Enter",
  " ": "Space",
  Backspace: "Backspace",
  Delete: "Del",
  Tab: "Tab",
};

function keyParts(k: ShortcutKey, mac: boolean): string[] {
  const parts: string[] = [];
  if (k.mod) parts.push(mac ? "⌘" : "Ctrl");
  const name = KEY_NAMES[k.key] ?? k.key;
  if (k.shift) {
    if (name.length === 1) {
      parts.push("Shift", name.toUpperCase());
      return parts;
    }
    parts.push("Shift");
  }
  parts.push(name);
  return parts;
}

function groupShortcuts(defs: ShortcutDef[], scope: string): [string, ShortcutDef[]][] {
  const groups = new Map<string, ShortcutDef[]>();
  for (const def of defs) {
    const list = groups.get(def.group);
    if (list) list.push(def);
    else groups.set(def.group, [def]);
  }
  const all = Array.from(groups.entries());
  const current = all.filter(([, list]) => list.some((d) => d.scope === scope));
  const rest = all.filter(([, list]) => !list.some((d) => d.scope === scope));
  return [...current, ...rest];
}

export function ShortcutsHelpDialog() {
  const { open, setOpen } = useShortcutsHelp();
  const defs = useRegisteredShortcuts();
  const scope = useShortcutScope();
  const singleKey = useSingleKeyShortcuts();
  const mac = isMacPlatform();
  const groups = groupShortcuts(defs, scope);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-shortcuts-help className="max-h-[80vh] overflow-y-auto">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <label htmlFor="single-key-shortcuts" className="text-sm font-medium">
              Single-key shortcuts
            </label>
            <DialogDescription>
              Turn off if single letters conflict with your browser or assistive tech.
            </DialogDescription>
          </div>
          <Switch
            id="single-key-shortcuts"
            checked={singleKey}
            onCheckedChange={setSingleKeyShortcuts}
          />
        </div>
        {groups.map(([group, list]) => (
          <section key={group} aria-label={group} className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {group}
            </h3>
            <ul className="space-y-1.5">
              {list.map((def) => (
                <li key={def.id} className="flex items-center justify-between gap-4 text-sm">
                  <span>{def.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {def.keys.map((k, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span className="text-muted-foreground text-xs">then</span>}
                        {keyParts(k, mac).map((part, j) => (
                          <Kbd key={j}>{part}</Kbd>
                        ))}
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
