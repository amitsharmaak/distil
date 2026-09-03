import { test as base } from "@playwright/test";
import { closeExtension, launchExtension, type ExtensionSession } from "./extension";

type ExtensionFixtures = Pick<ExtensionSession, "context" | "extensionId" | "serviceWorker">;

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, provide, testInfo) => {
    const session = await launchExtension({ testInfo });
    await provide(session.context);
    await closeExtension(session, testInfo);
  },
  extensionId: async ({ context }, provide) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
    await provide(new URL(worker.url()).hostname);
  },
  serviceWorker: async ({ context }, provide) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
    await provide(worker);
  },
});

export { expect } from "@playwright/test";
