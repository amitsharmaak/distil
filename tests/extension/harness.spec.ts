import { test, expect } from "../support/browser/extension-test";
import { closeExtension, launchExtension } from "../support/browser/extension";
import { DISTIL_EXTENSION_ID } from "../../src/lib/extension/constants";

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

/** Seeds a connected browser directly in storage; the handoff itself has its own tests. */
async function configureExtension(
  _context: import("@playwright/test").BrowserContext,
  _extensionId: string,
  token = "dst_cap_playwright_only",
  accountId = "account-alpha"
) {
  const worker = _context.serviceWorkers()[0];
  await worker.evaluate(
    async ({ token, accountId }) => {
      await chrome.storage.local.set({
        distilConfig: {
          origin: "http://localhost:3000",
          token,
          accountKey: `key-${accountId}`,
          accountId,
          accountEmail: "amit@example.com",
          connectionId: "conn-1",
          label: "Chrome on macOS",
          authPaused: false,
        },
      });
    },
    { token, accountId }
  );
}

const CONNECT_PAGE = `<!doctype html><title>connect</title><p id="result">pending</p><script>
const q = new URLSearchParams(location.search);
chrome.runtime.sendMessage(
  ${JSON.stringify(DISTIL_EXTENSION_ID)},
  {
    type: "distil-connect",
    state: q.get("sendState") || q.get("state"),
    origin: location.origin,
    token: q.get("token") || "dst_cap_from_handoff",
    connection: { id: "conn-2", label: "Chrome on macOS", createdAt: "2026-09-30T00:00:00Z", accountId: q.get("account") || "account-alpha" },
    accountEmail: "amit@example.com",
  },
  (response) => { document.getElementById("result").textContent = JSON.stringify(response || { error: chrome.runtime.lastError?.message }); }
);
</script>`;

async function serveConnectPage(context: import("@playwright/test").BrowserContext) {
  for (const origin of ["http://localhost:3000", "https://distilai.app"]) {
    await context.route(`${origin}/extension/connect*`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: CONNECT_PAGE })
    );
  }
}

async function startConnect(
  serviceWorker: import("@playwright/test").Worker,
  origin = DISTIL_ORIGIN
) {
  return serviceWorker.evaluate(
    async (value) =>
      (
        globalThis as typeof globalThis & {
          handleMessage(message: unknown): Promise<Record<string, unknown>>;
        }
      ).handleMessage({ type: "distil-start-connect", origin: value }),
    origin
  );
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

async function activeQueue(serviceWorker: import("@playwright/test").Worker) {
  return serviceWorker.evaluate(async () => {
    const stored = (await chrome.storage.local.get({
      distilConfig: null,
      distilCaptureQueues: {},
    })) as {
      distilConfig: { accountKey?: string } | null;
      distilCaptureQueues: Record<string, unknown[]>;
    };
    const { distilConfig, distilCaptureQueues } = stored;
    return distilConfig?.accountKey ? distilCaptureQueues[distilConfig.accountKey] || [] : [];
  });
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
  expect(manifest.host_permissions).toEqual(["https://distilai.app/*", "http://localhost:3000/*"]);
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

test("options page has no token field and validates the origin before sign-in", async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByLabel("Capture token")).toHaveCount(0);
  await expect(options.getByText("Not connected.")).toBeVisible();
  await options.getByText("Advanced").click();
  await expect(options.getByLabel("Distil origin")).toHaveValue("https://distilai.app");

  await options.getByLabel("Distil origin").fill("http://distil.example.com");
  await options.getByRole("button", { name: "Sign in to Distil" }).click();
  await expect(options.getByRole("status")).toContainText("Use HTTPS");
});

test("completes the connect handoff with the right state and stores the token privately", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await serveConnectPage(context);
  const started = await startConnect(serviceWorker);
  expect(started.ok).toBe(true);
  const page = await context.waitForEvent("page");
  await expect(page.locator("#result")).toContainText('"ok":true');

  const stored = await serviceWorker.evaluate(async () => {
    const values = await chrome.storage.local.get({
      distilConfig: null,
      distilPendingConnect: null,
    });
    return values as { distilConfig: Record<string, unknown>; distilPendingConnect: unknown };
  });
  expect(stored.distilPendingConnect).toBeNull();
  expect(stored.distilConfig).toMatchObject({
    origin: DISTIL_ORIGIN,
    token: "dst_cap_from_handoff",
    accountId: "account-alpha",
    connectionId: "conn-2",
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByText("Signed in as amit@example.com")).toBeVisible();
  await expect(options.getByText("dst_cap_from_handoff")).toHaveCount(0);
});

test("rejects a handoff with the wrong state, the wrong origin, or no pending request", async ({
  context,
  serviceWorker,
}) => {
  await serveConnectPage(context);
  const noPending = await context.newPage();
  await noPending.goto(`${DISTIL_ORIGIN}/extension/connect?state=${"a".repeat(64)}`);
  await expect(noPending.locator("#result")).toContainText('"ok":false');

  await startConnect(serviceWorker);
  const wrongState = await context.waitForEvent("page");
  await wrongState.goto(`${DISTIL_ORIGIN}/extension/connect?sendState=${"b".repeat(64)}`);
  await expect(wrongState.locator("#result")).toContainText('"ok":false');

  const pending = await serviceWorker.evaluate(async () => {
    const { distilPendingConnect } = await chrome.storage.local.get("distilPendingConnect");
    return distilPendingConnect as { state: string };
  });
  const wrongOrigin = await context.newPage();
  await wrongOrigin.goto(`https://distilai.app/extension/connect?state=${pending.state}`);
  await expect(wrongOrigin.locator("#result")).toContainText('"ok":false');

  const config = await serviceWorker.evaluate(() => chrome.storage.local.get("distilConfig"));
  expect(config.distilConfig).toBeUndefined();
});

test("rejects a handoff older than ten minutes", async ({ context, serviceWorker }) => {
  await serveConnectPage(context);
  await startConnect(serviceWorker);
  const opened = await context.waitForEvent("page");
  await opened.close();
  const state = await serviceWorker.evaluate(async () => {
    const { distilPendingConnect } = await chrome.storage.local.get("distilPendingConnect");
    const pending = distilPendingConnect as { state: string; startedAt: number };
    await chrome.storage.local.set({
      distilPendingConnect: { ...pending, startedAt: Date.now() - 11 * 60 * 1000 },
    });
    return pending.state;
  });
  const late = await context.newPage();
  await late.goto(`${DISTIL_ORIGIN}/extension/connect?state=${state}`);
  await expect(late.locator("#result")).toContainText('"ok":false');
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

  const queue = await activeQueue(serviceWorker);
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
    payload: {
      url: "https://www.example.com/offline/?utm_source=newsletter&b=2&a=1#one",
      title: "First",
    },
  });
  const second = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/offline?a=1&b=2#two", title: "Updated" },
  });
  expect(first.kind).toBe("queued");
  expect(second.kind).toBe("queued");

  const queued = await activeQueue(serviceWorker);
  expect(queued).toMatchObject([
    { normalizedUrl: "https://example.com/offline?a=1&b=2", title: "Updated", attempts: 2 },
  ]);

  await context.unroute(CAPTURE_ENDPOINT);
  await context.route(CAPTURE_ENDPOINT, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  const replay = await sendWorkerMessage(serviceWorker, { type: "distil-replay" });
  expect(replay.kind).toBe("saved");
  expect(replay.queued).toBe(0);
});

test("namespaces offline work by account and pauses it when another account connects", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await serveConnectPage(context);
  await context.route(CAPTURE_ENDPOINT, (route) => route.abort("failed"));
  await configureExtension(context, extensionId, "dst_cap_alpha", "account-alpha");
  await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/alpha-only" },
  });
  const alphaKey = await serviceWorker.evaluate(async () => {
    const { distilConfig } = await chrome.storage.local.get("distilConfig");
    return (distilConfig as { accountKey: string }).accountKey;
  });

  await startConnect(serviceWorker);
  const page = await context.waitForEvent("page");
  await page.goto(`${page.url()}&account=account-beta&token=dst_cap_beta`);
  await expect(page.locator("#result")).toContainText('"ok":true');

  const state = await sendWorkerMessage(serviceWorker, { type: "distil-get-state" });
  expect(state).toMatchObject({ queued: 0, pausedQueues: 1 });
  const queues = await serviceWorker.evaluate(async () => {
    const { distilCaptureQueues } = await chrome.storage.local.get("distilCaptureQueues");
    return distilCaptureQueues as Record<string, unknown[]>;
  });
  expect(queues[alphaKey]).toHaveLength(1);
});

test("continues replaying later captures after a retryable failure", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await context.route(CAPTURE_ENDPOINT, async (route) => {
    const body = route.request().postDataJSON() as { url: string };
    await route.fulfill({
      status: body.url.endsWith("/blocked") ? 429 : 202,
      contentType: "application/json",
      body: "{}",
    });
  });
  await configureExtension(context, extensionId);
  await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/blocked" },
  });
  await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/succeeds" },
  });

  const queue = await activeQueue(serviceWorker);
  expect(queue).toMatchObject([{ normalizedUrl: "https://example.com/blocked" }]);
});

test("replays an offline capture after restarting the browser context", async ({
  context,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await context.route(CAPTURE_ENDPOINT, (route) => route.abort("failed"));
  await configureExtension(context, extensionId);
  await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/restart" },
  });
  await context.close();

  const restarted = await launchExtension({ testInfo });
  try {
    await restarted.context.route(CAPTURE_ENDPOINT, (route) =>
      route.fulfill({ status: 202, contentType: "application/json", body: "{}" })
    );
    const replayed = await sendWorkerMessage(restarted.serviceWorker, {
      type: "distil-replay",
    });
    expect(replayed.kind).toBe("saved");
    expect(replayed.queued).toBe(0);
  } finally {
    await closeExtension(restarted, testInfo);
  }
});

test("clears the token on 401, keeps the queue, and resumes after the same account signs in again", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await serveConnectPage(context);
  let requests = 0;
  await context.route(CAPTURE_ENDPOINT, async (route) => {
    requests += 1;
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await configureExtension(context, extensionId, "dst_cap_revoked", "account-alpha");
  const unauthorized = await sendWorkerMessage(serviceWorker, {
    type: "distil-save",
    payload: { url: "https://example.com/private" },
  });
  expect(unauthorized.kind).toBe("auth-required");
  expect(unauthorized.queued).toBe(1);
  const cleared = await serviceWorker.evaluate(async () => {
    const { distilConfig } = await chrome.storage.local.get("distilConfig");
    return distilConfig as { token: string | null };
  });
  expect(cleared.token).toBeNull();

  await sendWorkerMessage(serviceWorker, { type: "distil-replay" });
  expect(requests).toBe(1);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("button", { name: "Sign in again" })).toBeVisible();

  await context.unroute(CAPTURE_ENDPOINT);
  await context.route(CAPTURE_ENDPOINT, (route) =>
    route.fulfill({ status: 202, contentType: "application/json", body: "{}" })
  );
  await startConnect(serviceWorker);
  const page = await context.waitForEvent("page");
  await expect(page.locator("#result")).toContainText('"ok":true');
  await expect
    .poll(async () => (await activeQueue(serviceWorker)).length, { timeout: 10_000 })
    .toBe(0);
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
