"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, type QueryKey } from "@tanstack/react-query";
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
  deactivate: () => void;
  writes: Set<Promise<void>>;
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
  if (response.status === 401) scope.expire();
  if (!response.ok) throw new Error(`Unable to refresh (${response.status})`);
  const raw: unknown = await response.json();
  // Even a transport which ignores cancellation cannot fill a previous account's cache.
  if (signal.aborted || !scope.active) throw new Error("Request cancelled");
  return options.transform ? options.transform(raw) : (raw as T);
}

export function ContentCacheProvider({
  accountKey,
  children,
}: {
  accountKey: string | null;
  children: React.ReactNode;
}) {
  return (
    <AccountCache key={accountKey ?? "anonymous"} accountKey={accountKey}>
      {children}
    </AccountCache>
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
      activate: () => {
        value.active = true;
      },
      deactivate: () => {
        value.active = false;
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
      scope.deactivate();
      window.removeEventListener(CONTENT_AUTH_EVENT, clear);
      window.removeEventListener("storage", storage);
      unsubscribe();
      // React Strict Mode replays effects. Clear on a real unmount, after the
      // replay has had a chance to reactivate this same account scope.
      queueMicrotask(() => {
        if (!scope.active) {
          void scope.client.cancelQueries();
          scope.client.clear();
        }
      });
    };
  }, [scope]);
  return (
    <ScopeContext.Provider value={scope}>
      <QueryClientProvider client={scope.client}>
        {expired ? (
          <main className="mx-auto max-w-md p-8">
            <p>Your session changed.</p>
            <a className="underline" href="/sign-in">
              Continue to sign in
            </a>
          </main>
        ) : (
          children
        )}
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
    }),
    [scope]
  );
}
