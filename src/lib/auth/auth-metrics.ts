import type { AuthRepositoryPort } from "@/lib/auth/ports";
import type { NeonProxyProvider } from "@/lib/auth/neon-proxy";
import type { ProviderIdentityPort } from "@/lib/auth/request-context";
import { measurePhase, recordProviderCall } from "@/lib/observability/request-metrics";

export const PROXY_PROVIDER_PHASE = "proxy-auth-provider";
export const PROXY_DATABASE_PHASE = "proxy-auth-db";

/**
 * Wrap the proxy's authorization dependencies so provider round trips and the
 * account lookup are timed as named phases. Behaviour is unchanged: every call
 * is forwarded verbatim and the same provider and repository objects answer.
 */
export function instrumentNeonProxyDependencies(dependencies: {
  provider: NeonProxyProvider;
  repositories: AuthRepositoryPort;
}): { provider: NeonProxyProvider; repositories: AuthRepositoryPort } {
  const { provider, repositories } = dependencies;
  const instrumentedProvider: NeonProxyProvider = {
    middleware(config) {
      const handler = provider.middleware(config);
      return (request) =>
        measurePhase(PROXY_PROVIDER_PHASE, () => {
          recordProviderCall();
          return handler(request);
        });
    },
    getSession: (input) =>
      measurePhase(PROXY_PROVIDER_PHASE, () => {
        recordProviderCall();
        return provider.getSession(input);
      }),
  };
  // A Proxy rather than a spread: the PostgreSQL adapter is a class instance
  // whose methods live on the prototype and would not survive `{ ...repositories }`.
  const instrumentedRepositories = new Proxy(repositories, {
    get(target, property) {
      if (property === "findAccountByIdentity") {
        return (input: Parameters<AuthRepositoryPort["findAccountByIdentity"]>[0]) =>
          measurePhase(PROXY_DATABASE_PHASE, () => target.findAccountByIdentity(input));
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { provider: instrumentedProvider, repositories: instrumentedRepositories };
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
