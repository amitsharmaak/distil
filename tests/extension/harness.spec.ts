import { test, expect } from "../support/browser/extension-test";

declare const chrome: {
  alarms: {
    get(name: string): Promise<{ name: string; periodInMinutes?: number } | undefined>;
  };
  permissions: {
    contains(permissions: { origins: string[] }): Promise<boolean>;
  };
  runtime: {
    getManifest(): {
      background?: { service_worker?: string };
      host_permissions?: string[];
      manifest_version: number;
      name: string;
      optional_host_permissions?: string[];
      options_ui?: { page?: string };
      permissions?: string[];
    };
    id: string;
    sendMessage(message: unknown): Promise<Record<string, unknown>>;
  };
  storage: {
    local: {
      get(key: string | Record<string, unknown>): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
};

const DISTIL_ORIGIN = "http://localhost:3000";
const CAPTURE_ENDPOINT = `${DISTIL_ORIGIN}/api/v1/captures`;

async function configureExtension(
  context: import("@playwright/test").BrowserContext,
  extensionId: string,
  token = "dst_cap_playwright_only"
) {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Distil origin").fill(DISTIL_ORIGIN);
  await options.getByLabel("Capture token").fill(token);
  await options.getByRole("button", { name: "Save connection" }).click();
  await expect(options.getByRole("status")).toContainText("Connection saved");
  await expect(options.getByLabel("Capture token")).toHaveValue("");
  await options.close();
}

async function sendWorkerMessage(
  serviceWorker: import("@playwright/test").Worker,
  message: unknown
) {
  return serviceWorker.evaluate(
    async (value) =>
      (
        globalThis as typeof globalThis & {
          handleMessage(message: unknown): Promise<Record<string, unknown>>;
        }
      ).handleMessage(value),
    message
  );
}

test("launches and inspects the unpacked MV3 extension", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await context.route(CAPTURE_ENDPOINT, async (route) => {
    await route.fulfill({
      body: JSON.stringify({ accepted: true }),
      contentType: "application/json",
      status: 202,
    });
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, "close", { value: () => undefined });
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

  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.permissions).toEqual(
    expect.arrayContaining(["activeTab", "alarms", "contextMenus", "storage"])
  );
  expect(manifest.host_permissions).toEqual(["http://localhost:3000/*"]);
  expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  expect(manifest.options_ui?.page).toBe("options.html");
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

test("configures a runtime origin permission without rendering the saved token", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await configureExtension(context, extensionId);

  const configured = await serviceWorker.evaluate(async () => {
    const { distilConfig } = await chrome.storage.local.get("distilConfig");
    return {
      origin: (distilConfig as { origin: string }).origin,
      hasToken: Boolean((distilConfig as { token: string }).token),
      permission: await chrome.permissions.contains({ origins: ["http://localhost:3000/*"] }),
    };
  });
  expect(configured).toEqual({ origin: DISTIL_ORIGIN, hasToken: true, permission: true });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByLabel("Capture token")).toHaveValue("");
  await expect(options.getByText("dst_cap_playwright_only")).toHaveCount(0);
});

test("posts the v1 capture contract and removes successful captures", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const requests: Array<{ body: unknown; authorization?: string }> = [];
  await context.route(CAPTURE_ENDPOINT, async (route) => {
    requests.push({
      body: route.request().postDataJSON(),
      authorization: route.request().headers().authorization,
    });
    await route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
  });
  await configureExtension(context, extensionId);

  const state = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: {
      url: "https://example.com/article#reading-position",
      title: "An article",
      notes: "Remember this",
      topics: ["testing"],
      priority: "high",
    },
  });
  expect(state.kind).toBe("saved");
  expect(requests).toEqual([
    {
      authorization: "Bearer dst_cap_playwright_only",
      body: {
        url: "https://example.com/article",
        title: "An article",
        notes: "Remember this",
        topics: ["testing"],
        priority: "high",
        source: "browser-extension",
      },
    },
  ]);

  const queue = await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get("distilCaptureQueue")).distilCaptureQueue
  );
  expect(queue).toEqual([]);
});

test("deduplicates normalized offline captures and replays them from persistent storage", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await context.route(CAPTURE_ENDPOINT, (route) => route.abort("failed"));
  await configureExtension(context, extensionId);

  const first = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/offline#one", title: "First" },
  });
  const second = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/offline#two", title: "Updated" },
  });
  expect(first.kind).toBe("queued");
  expect(second.kind).toBe("queued");

  const queued = await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get("distilCaptureQueue")).distilCaptureQueue
  );
  expect(queued).toMatchObject([
    { normalizedUrl: "https://example.com/offline", title: "Updated", attempts: 2 },
  ]);

  await context.unroute(CAPTURE_ENDPOINT);
  await context.route(CAPTURE_ENDPOINT, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  const replay = await sendWorkerMessage(serviceWorker, { type: "distil-replay" });
  expect(replay.kind).toBe("saved");
  expect(replay.queued).toBe(0);
});

test("preserves and pauses unauthorized captures until configuration is refreshed", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  let requests = 0;
  await context.route(CAPTURE_ENDPOINT, async (route) => {
    requests += 1;
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await configureExtension(context, extensionId);
  const unauthorized = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/private" },
  });
  expect(unauthorized.kind).toBe("auth-required");
  expect(unauthorized.queued).toBe(1);

  await sendWorkerMessage(serviceWorker, { type: "distil-replay" });
  expect(requests).toBe(1);

  await context.unroute(CAPTURE_ENDPOINT);
  await context.route(CAPTURE_ENDPOINT, (route) =>
    route.fulfill({ status: 202, contentType: "application/json", body: "{}" })
  );
  await serviceWorker.evaluate(async () => {
    const { distilConfig } = await chrome.storage.local.get("distilConfig");
    await chrome.storage.local.set({
      distilConfig: { ...(distilConfig as object), authPaused: false },
    });
  });
  const replayed = await sendWorkerMessage(serviceWorker, { type: "distil-replay" });
  expect(replayed.kind).toBe("saved");
  expect(replayed.queued).toBe(0);
});

test("drops terminal validation failures and retains rate-limited captures", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  let status = 422;
  await context.route(CAPTURE_ENDPOINT, (route) =>
    route.fulfill({ status, contentType: "application/json", body: "{}" })
  );
  await configureExtension(context, extensionId);

  const rejected = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/rejected" },
  });
  expect(rejected.kind).toBe("rejected");
  expect(rejected.queued).toBe(0);

  status = 429;
  const limited = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/rate-limited" },
  });
  expect(limited.kind).toBe("queued");
  expect(limited.status).toBe(429);
  expect(limited.queued).toBe(1);

  const alarm = await serviceWorker.evaluate(() => chrome.alarms.get("distil-replay-captures"));
  expect(alarm?.periodInMinutes).toBe(5);
});
