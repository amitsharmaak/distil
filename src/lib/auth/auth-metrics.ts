import type { AuthRepositoryPort } from "@/lib/auth/ports";
import type { NeonProxyProvider } from "@/lib/auth/neon-proxy";
import type { ProviderIdentityPort } from "@/lib/auth/request-context";
import { measurePhase, recordProviderCall } from "@/lib/observability/request-metrics";

export const PROXY_PROVIDER_PHASE = "proxy-auth-provider";
export const PROXY_DATABASE_PHASE = "proxy-auth-db";

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
          return (input: Parameters<AuthRepositoryPort["findAccountByIdentity"]>[0]) =>
            measurePhase(PROXY_DATABASE_PHASE, () => port.findAccountByIdentity(input));
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
