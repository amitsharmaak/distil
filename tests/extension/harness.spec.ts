import { test, expect } from "../support/browser/extension-test";

declare const chrome: {
  runtime: {
    getManifest(): {
      background?: { service_worker?: string };
      manifest_version: number;
      name: string;
    };
    id: string;
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
};

test("launches and inspects the unpacked MV3 extension", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await context.route("http://localhost:3000/api/items", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ accepted: true }),
      contentType: "application/json",
      status: 202,
    });
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Distil" })).toBeVisible();

  const runtime = await serviceWorker.evaluate(() => {
    const manifest = chrome.runtime.getManifest();
    return {
      backgroundWorker: manifest.background?.service_worker,
      id: chrome.runtime.id,
      manifestVersion: manifest.manifest_version,
      name: manifest.name,
    };
  });

  expect(extensionId).toMatch(/^[a-p]{32}$/);
  expect(runtime).toEqual({
    backgroundWorker: "background.js",
    id: extensionId,
    manifestVersion: 3,
    name: "Distil — Save to Distil",
  });
  expect(serviceWorker.url()).toBe(`chrome-extension://${extensionId}/background.js`);
});

test("provides persistent extension storage", async ({ serviceWorker }) => {
  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({ playwrightHarness: "ready" });
  });

  const storedValue = await serviceWorker.evaluate(async () => {
    const result = await chrome.storage.local.get("playwrightHarness");
    return result.playwrightHarness;
  });

  expect(storedValue).toBe("ready");
});
