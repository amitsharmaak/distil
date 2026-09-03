import { expect, test as base } from "@playwright/test";

const LOCAL_PROTOCOLS = new Set(["about:", "blob:", "chrome-extension:", "data:"]);

function isAllowedRequest(rawUrl: string, baseURL: string | undefined): boolean {
  const url = new URL(rawUrl);
  if (LOCAL_PROTOCOLS.has(url.protocol)) return true;
  if (baseURL === undefined) return false;
  return url.origin === new URL(baseURL).origin;
}

type BrowserFixtures = {
  _externalNetworkGuard: void;
};

/**
 * E2E test base that fails closed when page code tries to reach anything other
 * than the configured Next.js server. Tests needing another origin must mock
 * it explicitly instead of weakening this guard.
 */
export const test = base.extend<BrowserFixtures>({
  _externalNetworkGuard: [
    async ({ context, baseURL }, use) => {
      const blockedRequests: string[] = [];

      await context.route("**/*", async (route) => {
        const url = route.request().url();
        if (isAllowedRequest(url, baseURL)) {
          await route.continue();
          return;
        }

        blockedRequests.push(url);
        await route.abort("blockedbyclient");
      });

      await use();

      expect(
        blockedRequests,
        `Unexpected external browser requests:\n${blockedRequests.join("\n")}`
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
