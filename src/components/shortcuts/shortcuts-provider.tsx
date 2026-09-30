"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import type { ShortcutDef, ShortcutScope } from "@/lib/shortcuts/types";
import { eventToKey, isEditableTarget } from "@/lib/shortcuts/match";
import { SequenceMatcher } from "@/lib/shortcuts/sequence";
import { readSingleKeyShortcuts } from "./shortcuts-preference";

type Handler = (e: KeyboardEvent) => void;
type Entry = { def: ShortcutDef; handler: Handler; enabled: boolean };

type Registry = {
  register(entry: { current: Entry }): () => void;
  subscribe(cb: () => void): () => void;
  getSnapshot(): ShortcutDef[];
  suspend(): () => void;
  isSuspended(): boolean;
  entries: Map<string, { current: Entry }>;
};

const RegistryContext = createContext<Registry | null>(null);
const ScopeContext = createContext<ShortcutScope>("global");
const HelpContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

const EMPTY: ShortcutDef[] = [];

export function scopeForPathname(pathname: string): ShortcutScope {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/feed" || path === "/today") return "list";
  if (path.startsWith("/feed/")) return "reader";
  if (path === "/research" || path.startsWith("/research/")) return "research";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  return "global";
}

function createRegistry(): Registry {
  const entries = new Map<string, { current: Entry }>();
  const listeners = new Set<() => void>();
  let snapshot: ShortcutDef[] = EMPTY;
  let suspended = 0;
  let warned = false;

  function refresh() {
    snapshot = Array.from(entries.values(), (r) => r.current.def);
    listeners.forEach((l) => l());
  }

  return {
    register(ref) {
      const id = ref.current.def.id;
      if (entries.has(id) && !warned) {
        warned = true;
        console.warn(`Duplicate shortcut id "${id}"; last registration wins.`);
      }
      entries.set(id, ref);
      refresh();
      return () => {
        if (entries.get(id) === ref) {
          entries.delete(id);
          refresh();
        }
      };
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot: () => snapshot,
    suspend() {
      suspended += 1;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          suspended -= 1;
        }
      };
    },
    isSuspended: () => suspended > 0,
    entries,
  };
}

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const registry = useMemo(() => createRegistry(), []);
  const pathname = usePathname();
  const scope = scopeForPathname(pathname ?? "");
  const [helpOpen, setHelpOpen] = useState(false);

  const help = useMemo(() => ({ open: helpOpen, setOpen: setHelpOpen }), [helpOpen]);

  useEffect(() => {
    let helpOnly = false;
    const matcher = new SequenceMatcher(() => {
      const singleKey = readSingleKeyShortcuts();
      const defs: ShortcutDef[] = [];
      for (const ref of registry.entries.values()) {
        const { def, enabled } = ref.current;
        if (!enabled) continue;
        if (helpOnly && !def.id.startsWith("help.")) continue;
        if (!singleKey && !def.alwaysOn && !def.keys[0]?.mod) continue;
        defs.push(def);
      }
      return defs;
    });

    function onKeyDown(e: KeyboardEvent) {
      if (registry.isSuspended()) return;
      const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
      if (openDialog && !openDialog.hasAttribute("data-shortcuts-help")) return;
      helpOnly = openDialog !== null;
      if (isEditableTarget(e.target)) return;
      const key = eventToKey(e);
      if (!key) return;
      const def = matcher.feed(key);
      if (!def) return;
      const ref = registry.entries.get(def.id);
      if (!ref) return;
      e.preventDefault();
      ref.current.handler(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      matcher.reset();
    };
  }, [registry]);

  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);

  return (
    <RegistryContext.Provider value={registry}>
      <ScopeContext.Provider value={scope}>
        <HelpContext.Provider value={help}>
          <HelpShortcuts toggle={toggleHelp} />
          {children}
        </HelpContext.Provider>
      </ScopeContext.Provider>
    </RegistryContext.Provider>
  );
}

const HELP_QUESTION: ShortcutDef = {
  id: "help.open",
  keys: [{ key: "?" }],
  label: "Show keyboard shortcuts",
  group: "General",
  scope: "global",
  alwaysOn: true,
};
const HELP_MOD: ShortcutDef = {
  id: "help.open.mod",
  keys: [{ key: "/", mod: true }],
  label: "Show keyboard shortcuts",
  group: "General",
  scope: "global",
  alwaysOn: true,
};

function HelpShortcuts({ toggle }: { toggle: () => void }) {
  useShortcut(HELP_QUESTION, toggle);
  useShortcut(HELP_MOD, toggle);
  return null;
}

function useRegistry(): Registry {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error("Shortcut hooks must be used inside <ShortcutsProvider>.");
  return registry;
}

export function useShortcut(def: ShortcutDef, handler: Handler, enabled = true): void {
  const registry = useRegistry();
  const ref = useRef<Entry>({ def, handler, enabled });
  const { id } = def;

  useEffect(() => {
    ref.current = { def, handler, enabled };
  });

  useEffect(() => {
    if (!enabled) return;
    return registry.register(ref);
  }, [registry, id, enabled]);
}

export function useShortcutsSuspended(suspended: boolean): void {
  const registry = useRegistry();
  useEffect(() => {
    if (!suspended) return;
    return registry.suspend();
  }, [registry, suspended]);
}

export function useRegisteredShortcuts(): ShortcutDef[] {
  const registry = useRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot, () => EMPTY);
}

export function useShortcutsHelp(): { open: boolean; setOpen: (v: boolean) => void } {
  return useContext(HelpContext);
}

export function useShortcutScope(): ShortcutScope {
  return useContext(ScopeContext);
}
