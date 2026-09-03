import { http, passthrough, type RequestHandler } from "msw";
import { setupServer, type SetupServer } from "msw/node";

export interface StrictMswServerOptions {
  handlers?: RequestHandler[];
  /** Exact local origins that may bypass MSW, normally fixture servers only. */
  allowedLocalOrigins?: string[];
}

/**
 * Create an MSW server that throws on every request without an explicit mock.
 * A test-owned local fixture server may be allowlisted by exact origin.
 */
export function createStrictMswServer(options: StrictMswServerOptions = {}): SetupServer {
  const localPassthroughHandlers = (options.allowedLocalOrigins ?? []).map((origin) => {
    const url = new URL(origin);
    if (url.origin !== origin || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)) {
      throw new Error(`Only exact loopback fixture origins may bypass MSW: ${origin}`);
    }
    return http.all(`${origin}/*`, () => passthrough());
  });
  const server = setupServer(...(options.handlers ?? []), ...localPassthroughHandlers);

  server.listen({ onUnhandledRequest: "error" });

  return server;
}

export function resetStrictMswServer(server: SetupServer): void {
  server.resetHandlers();
}

export function closeStrictMswServer(server: SetupServer): void {
  server.close();
}
