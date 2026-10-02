"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, type QueryKey } from "@tanstack/react-query";
import { replaceFullPage } from "@/lib/browser-navigation";
import { CONTENT_AUTH_EVENT, CONTENT_AUTH_STORAGE_KEY } from "./auth-events";

export const CACHE_FRESHNESS = {
  feed: 120_000,
  library: 300_000,
  detail: 1_800_000,
  preferences: 900_000,
} as const;
const RETENTION_MS = 45 * 60_000;
const MAX_INACTIVE_QUERIES = 60;

export interface ContentQueryOptions<T> {
  key: QueryKey;
  url: string;
  staleTime: number;
  initialData?: T;
  initialDataUpdatedAt?: number;
  enabled?: boolean;
  transform?: (raw: unknown) => T;
}

interface CacheScope {
  client: QueryClient;
  account: string | null;
  active: boolean;
  expire: () => void;
  activate: () => void;
  dispose: () => void;
  writes: Set<Promise<void>>;
  itemWrites: Map<string, Promise<unknown>>;
}
const ScopeContext = createContext<CacheScope | null>(null);

function scopedKey(scope: CacheScope, key: QueryKey): QueryKey {
  return ["content", scope.account, ...key];
}

function trimInactive(client: QueryClient) {
  const inactive = client
    .getQueryCache()
    .getAll()
    .filter((query) => query.getObserversCount() === 0 && query.state.fetchStatus === "idle")
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  for (const query of inactive.slice(MAX_INACTIVE_QUERIES)) client.getQueryCache().remove(query);
}

async function readContent<T>(
  scope: CacheScope,
  options: ContentQueryOptions<T>,
  signal: AbortSignal
): Promise<T> {
  if (!scope.active) throw new Error("Session changed");
  // Reads begun during an optimistic write wait for it to settle. Reads which
  // began before it are cancelled by the mutation helper.
  while (scope.writes.size) await Promise.all(scope.writes);
  if (signal.aborted || !scope.active) throw new Error("Request cancelled");
  const response = await fetch(options.url, { signal });
  if (response.status === 401 || response.status === 403) scope.expire();
  if (!response.ok) throw new Error(`Unable to refresh (${response.status})`);
  const raw: unknown = await response.json();
  // Even a transport which ignores cancellation cannot fill a previous account's cache.
  if (signal.aborted || !scope.active) throw new Error("Request cancelled");
  // Mutation overrides bridge old RSC props across navigation. A later,
  // authoritative read must also replace those overrides, not be masked by them.
  const envelope = raw as {
    items?: Array<Record<string, unknown>>;
    resurfacedItems?: Array<Record<string, unknown>>;
    state?: Record<string, unknown>;
  } | null;
  const reconcile = (id: string, state: Record<string, unknown>) => {
    scope.client.setQueryData<Record<string, unknown>>(
      scopedKey(scope, ["item", id, "changes"]),
      (previous) => {
        if (!previous) return undefined;
        const next = { ...previous };
        for (const field of ["isRead", "readingProgress", "manualPriority", "area"]) {
          if (field in state) next[field] = state[field];
        }
        if ("archived" in state) next.archived = state.archived;
        else if ("archivedAt" in state) next.archived = Boolean(state.archivedAt);
        return next;
      }
    );
  };
  if (options.key[0] === "item" && options.key[2] === "state" && envelope?.state) {
    reconcile(String(options.key[1]), envelope.state);
  } else if (
    (options.key[0] === "feed" || options.key[0] === "today" || options.key[0] === "library") &&
    Array.isArray(envelope?.items)
  ) {
    for (const item of [...envelope.items, ...(envelope.resurfacedItems ?? [])]) {
      if (typeof item.id === "string")
        reconcile(item.id, {
          ...item,
          manualPriority: item.manualPriority ?? null,
          archived: Boolean(item.archivedAt),
          area: item.area,
        });
    }
  }
  return options.transform ? options.transform(raw) : (raw as T);
}

export function ContentCacheProvider({
  accountKey,
  children,
}: {
  accountKey: string | null;
  children: React.ReactNode;
}) {
  // The signed-in account this document first rendered for. If a later server render (a
  // `router.refresh()` after sign-out, or a session replaced from elsewhere) reports another
  // account or none, the router cache may still hold route output rendered for the first one,
  // for up to `experimental.staleTimes`. Re-keying the data cache is then not enough: reload
  // the document so that cache is discarded and the server decides what this URL may show.
  const [documentAccount, setDocumentAccount] = useState(accountKey);
  if (documentAccount === null && accountKey !== null) setDocumentAccount(accountKey);
  const accountChanged = documentAccount !== null && accountKey !== documentAccount;
  useEffect(() => {
    if (accountChanged) replaceFullPage(window.location.href, window.location);
  }, [accountChanged]);
  if (accountChanged) return <SessionChanged />;
  return (
    <AccountCache key={accountKey ?? "anonymous"} accountKey={accountKey}>
      {children}
    </AccountCache>
  );
}

/** Shown in place of all content; its only exit is a document load, never a cached route. */
function SessionChanged() {
  return (
    <main className="mx-auto max-w-md p-8">
      <p>Your session changed.</p>
      <a className="underline" href="/sign-in">
        Continue to sign in
      </a>
    </main>
  );
}

function AccountCache({
  accountKey,
  children,
}: {
  accountKey: string | null;
  children: React.ReactNode;
}) {
  const [expired, setExpired] = useState(false);
  const [scope] = useState<CacheScope>(() => {
    let lifecycle = 0;
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: RETENTION_MS,
          staleTime: CACHE_FRESHNESS.library,
          retry: false,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
        },
      },
    });
    const value: CacheScope = {
      client,
      account: accountKey,
      active: true,
      writes: new Set(),
      itemWrites: new Map(),
      activate: () => {
        lifecycle += 1;
        value.active = true;
      },
      dispose: () => {
        const disposing = ++lifecycle;
        queueMicrotask(() => {
          if (disposing !== lifecycle) return;
          value.active = false;
          void client.cancelQueries();
          client.clear();
        });
      },
      expire: () => {
        value.active = false;
        void client.cancelQueries();
        client.clear();
        setExpired(true);
      },
    };
    return value;
  });
  useEffect(() => {
    scope.activate();
    const clear = () => scope.expire();
    const storage = (event: StorageEvent) => {
      if (event.key === CONTENT_AUTH_STORAGE_KEY && event.newValue) clear();
    };
    window.addEventListener(CONTENT_AUTH_EVENT, clear);
    window.addEventListener("storage", storage);
    const unsubscribe = scope.client.getQueryCache().subscribe((event) => {
      if (
        event.type === "observerRemoved" ||
        (event.type === "updated" && event.action.type === "success")
      ) {
        trimInactive(scope.client);
      }
    });
    return () => {
      scope.dispose();
      window.removeEventListener(CONTENT_AUTH_EVENT, clear);
      window.removeEventListener("storage", storage);
      unsubscribe();
    };
  }, [scope]);
  return (
    <ScopeContext.Provider value={scope}>
      <QueryClientProvider client={scope.client}>
        {expired ? <SessionChanged /> : children}
      </QueryClientProvider>
    </ScopeContext.Provider>
  );
}

function useScope() {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("Content queries require ContentCacheProvider");
  return scope;
}

export function useContentQuery<T>(options: ContentQueryOptions<T>) {
  const scope = useScope();
  return useQuery<T>({
    queryKey: scopedKey(scope, options.key),
    queryFn: ({ signal }) => readContent(scope, options, signal),
    staleTime: options.staleTime,
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialDataUpdatedAt,
    enabled: scope.active && options.enabled !== false,
  });
}

export function useContentCache() {
  const scope = useScope();
  return useMemo(
    () => ({
      get<T>(key: QueryKey): T | undefined {
        return scope.client.getQueryData<T>(scopedKey(scope, key));
      },
      set<T>(key: QueryKey, value: T | ((old: T | undefined) => T | undefined)): void {
        if (scope.active) scope.client.setQueryData<T>(scopedKey(scope, key), value);
      },
      async invalidate(prefix: QueryKey = []): Promise<void> {
        await scope.client.invalidateQueries({ queryKey: scopedKey(scope, prefix) });
      },
      async cancel(prefix: QueryKey = []): Promise<void> {
        await scope.client.cancelQueries({ queryKey: scopedKey(scope, prefix) });
      },
      async prefetch<T>(options: ContentQueryOptions<T>): Promise<void> {
        if (!scope.active) return;
        await scope.client.prefetchQuery({
          queryKey: scopedKey(scope, options.key),
          queryFn: ({ signal }) => readContent(scope, options, signal),
          staleTime: options.staleTime,
        });
      },
      async fetch<T>(options: ContentQueryOptions<T>): Promise<T> {
        if (!scope.active) throw new Error("Session changed");
        return scope.client.fetchQuery({
          queryKey: scopedKey(scope, options.key),
          queryFn: ({ signal }) => readContent(scope, options, signal),
          staleTime: options.staleTime,
        });
      },
      entries<T>(prefix: QueryKey = []): Array<[QueryKey, T | undefined]> {
        return scope.client
          .getQueriesData<T>({ queryKey: scopedKey(scope, prefix) })
          .map(([key, value]) => [key.slice(2), value]);
      },
      beginWrite(): () => void {
        let finish!: () => void;
        const pending = new Promise<void>((resolve) => {
          finish = resolve;
        });
        scope.writes.add(pending);
        return () => {
          scope.writes.delete(pending);
          finish();
        };
      },
      enqueueItemWrite<T>(id: string, write: () => Promise<T>): Promise<T> {
        const previous = scope.itemWrites.get(id) ?? Promise.resolve();
        const operation = previous
          .catch(() => undefined)
          .then(() => {
            if (!scope.active) throw new Error("Session changed");
            return write();
          });
        scope.itemWrites.set(id, operation);
        void operation
          .finally(() => {
            if (scope.itemWrites.get(id) === operation) scope.itemWrites.delete(id);
          })
          .catch(() => undefined);
        return operation;
      },
    }),
    [scope]
  );
}
