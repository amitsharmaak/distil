"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { useShortcutsHelp } from "@/components/shortcuts/shortcuts-provider";
import {
  setSingleKeyShortcuts,
  useSingleKeyShortcuts,
} from "@/components/shortcuts/shortcuts-preference";

export function KeyboardShortcutsCard() {
  const singleKey = useSingleKeyShortcuts();
  const help = useShortcutsHelp();

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold">Keyboard shortcuts</h3>
      <div className="flex items-start justify-between gap-4">
        <div>
          <label htmlFor="single-key-shortcuts" className="text-sm font-medium">
            Single-key shortcuts
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Use plain keys like j, k and r. Turn off if they clash with your assistive technology.
          </p>
        </div>
        <Switch
          id="single-key-shortcuts"
          checked={singleKey}
          onCheckedChange={setSingleKeyShortcuts}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="min-h-9 gap-2"
        aria-keyshortcuts="?"
        onClick={() => help.setOpen(true)}
      >
        View all shortcuts <Kbd>?</Kbd>
      </Button>
    </div>
  );
}
