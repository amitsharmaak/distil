import type { AuthRepositoryPort } from "@/lib/auth/ports";
import type { NeonProxyProvider } from "@/lib/auth/neon-proxy";
import type { ProviderIdentityPort } from "@/lib/auth/request-context";
import {
  currentRequestMetrics,
  measurePhase,
  recordProviderCall,
  runWithRequestMetrics,
  type RequestMetrics,
} from "@/lib/observability/request-metrics";

export const PROXY_PROVIDER_PHASE = "proxy-auth-provider";
export const PROXY_CONNECTION_PHASE = "proxy-auth-connect";
export const PROXY_DATABASE_PHASE = "proxy-auth-db";

type IdentityLookupInput = Parameters<AuthRepositoryPort["findAccountByIdentity"]>[0];

/**
 * postgres.js invokes its debug hook from the pooled connection's async
 * lifecycle, which can retain the phase that established that connection.
 * For this temporary sequential diagnostic, derive the phase's query count
 * from the request-total delta and undo any stale phase attribution.
 */
async function measureP8QueryPhase<T>(
  metrics: RequestMetrics | undefined,
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!metrics) return operation();

  const queriesBefore = metrics.queries;
  const phaseQueriesBefore = new Map(
    [...metrics.phases].map(([phaseName, entry]) => [phaseName, entry.queries])
  );
  try {
    return await runWithRequestMetrics(() => measurePhase(name, operation), metrics);
  } finally {
    const queryDelta = Math.max(0, metrics.queries - queriesBefore);
    for (const [phaseName, entry] of metrics.phases) {
      entry.queries = phaseQueriesBefore.get(phaseName) ?? 0;
    }
    const measured = metrics.phases.get(name);
    if (measured) measured.queries = (phaseQueriesBefore.get(name) ?? 0) + queryDelta;
  }
}

/**
 * P8 diagnostic only: repeat the exact identity lookup so Preview can compare
 * the connection-establishing call with the same query on an established
 * connection. The second result is the real lookup result.
 */
export async function measureP8ProxyIdentityLookup(
  repositories: AuthRepositoryPort,
  input: IdentityLookupInput
): ReturnType<AuthRepositoryPort["findAccountByIdentity"]> {
  const metrics = currentRequestMetrics();
  try {
    await measureP8QueryPhase(metrics, PROXY_CONNECTION_PHASE, () =>
      repositories.findAccountByIdentity(input)
    );
  } catch {
    // The first call is diagnostic only. The second lookup remains the
    // authoritative result on the Neon path and must run even after failure.
  }
  return measureP8QueryPhase(metrics, PROXY_DATABASE_PHASE, () =>
    repositories.findAccountByIdentity(input)
  );
}

/**
 * Wrap the proxy's authorization dependencies so the provider round trip and
 * the account lookup are timed as named phases. Behaviour is unchanged: every
 * call is forwarded verbatim and the same provider and repository objects
 * answer. The repositories stay lazy so a public path never loads them.
 */
export function instrumentNeonProxyDependencies(dependencies: {
  provider: NeonProxyProvider;
  repositories: () => Promise<AuthRepositoryPort>;
}): { provider: NeonProxyProvider; repositories: () => Promise<AuthRepositoryPort> } {
  const { provider, repositories } = dependencies;
  const instrumentedProvider: NeonProxyProvider = {
    verifySession: (request) =>
      measurePhase(PROXY_PROVIDER_PHASE, () => {
        recordProviderCall();
        return provider.verifySession(request);
      }),
  };
  // A Proxy rather than a spread: the PostgreSQL adapter is a class instance
  // whose methods live on the prototype and would not survive `{ ...repositories }`.
  const instrument = (target: AuthRepositoryPort): AuthRepositoryPort =>
    new Proxy(target, {
      get(port, property) {
        if (property === "findAccountByIdentity") {
          return (input: IdentityLookupInput) => measureP8ProxyIdentityLookup(port, input);
        }
        const value = Reflect.get(port, property, port) as unknown;
        return typeof value === "function" ? value.bind(port) : value;
      },
    });
  return {
    provider: instrumentedProvider,
    repositories: () => repositories().then(instrument),
  };
}

/** Count every provider session lookup a route makes; no phase of its own. */
export function countProviderCalls(provider: ProviderIdentityPort): ProviderIdentityPort {
  return {
    getSession: (input) => {
      recordProviderCall();
      return provider.getSession(input);
    },
  };
}
