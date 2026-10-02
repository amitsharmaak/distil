import type { Page } from "@playwright/test";
import { test, expect } from "../support/browser/test";

const report = {
  id: "cache-report",
  query: "A cached research example",
  report: "## Findings\nA deterministic report for navigation checks.",
  status: "completed",
  sources: [],
  model: "fixture",
  createdAt: "2026-10-01T00:00:00Z",
  completedAt: "2026-10-01T00:01:00Z",
};

async function observeNavigation(page: Page, targetHeading: string) {
  await page.evaluate((heading) => {
    const state = window as unknown as { __cachedNavigationMs?: number };
    state.__cachedNavigationMs = undefined;
    document.addEventListener(
      "click",
      () => {
        const start = performance.now();
        const observer = new MutationObserver(() => {
          if ([...document.querySelectorAll("h1")].some((node) => node.textContent === heading)) {
            state.__cachedNavigationMs = performance.now() - start;
            observer.disconnect();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 10_000);
      },
      { once: true, capture: true }
    );
  }, targetHeading);
}

async function advanceBrowserClock(page: Page, milliseconds: number) {
  await page.evaluate((offset) => {
    const state = window as unknown as {
      __contentCacheRealNow?: () => number;
      __contentCacheClockOffset?: number;
    };
    state.__contentCacheRealNow ??= Date.now.bind(Date);
    state.__contentCacheClockOffset = offset;
    Date.now = () => state.__contentCacheRealNow!() + state.__contentCacheClockOffset!;
  }, milliseconds);
}

test("route shells outlive data freshness without gating cached Research content", async ({
  page,
}) => {
  test.skip(process.env.DISTIL_E2E_PRODUCTION !== "1", "Requires the production router cache.");
  const requests = { list: 0, suggestions: 0, report: 0, rsc: 0 };
  let holdResearchRefresh = false;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshObserved!: () => void;
  const observedRefresh = new Promise<void>((resolve) => {
    refreshObserved = resolve;
  });

  page.on("request", (request) => {
    if (new URL(request.url()).searchParams.has("_rsc")) requests.rsc++;
  });
  await page.route("**/api/ai/research/list", async (route) => {
    requests.list++;
    if (holdResearchRefresh) {
      refreshObserved();
      await refreshGate;
    }
    await route.fulfill({ json: { reports: [report] } });
  });
  await page.route("**/api/ai/research/suggestions", async (route) => {
    requests.suggestions++;
    if (holdResearchRefresh) await refreshGate;
    await route.fulfill({ json: { suggestions: [] } });
  });
  await page.route("**/api/ai/research/cache-report", async (route) => {
    requests.report++;
    await route.fulfill({ json: { report } });
  });

  try {
    await page.goto("/research");
    const listHeading = page.getByRole("heading", { name: "Research", exact: true });
    const card = page.locator('a[href="/research/cache-report"]');
    await expect(card).toBeVisible();
    await card.evaluate((element: HTMLAnchorElement) => element.click());
    const reportHeading = page.getByRole("heading", { name: report.query, exact: true });
    await expect(reportHeading).toBeVisible();

    const warm = { ...requests };
    await advanceBrowserClock(page, 301_000);
    holdResearchRefresh = true;
    await page
      .getByRole("link", { name: "Back", exact: true })
      .first()
      .evaluate((element: HTMLAnchorElement) => element.click());

    await expect(listHeading).toBeVisible({ timeout: 500 });
    await expect(card).toBeVisible({ timeout: 500 });
    await observedRefresh;
    expect(requests.rsc).toBe(warm.rsc);
    expect(requests.list).toBe(warm.list + 1);

    holdResearchRefresh = false;
    releaseRefresh();
    await expect.poll(() => requests.suggestions).toBe(warm.suggestions + 1);

    await card.evaluate((element: HTMLAnchorElement) => element.click());
    await expect(reportHeading).toBeVisible({ timeout: 500 });
    expect(requests.rsc).toBe(warm.rsc);
    expect(requests.report).toBe(warm.report);
  } finally {
    releaseRefresh();
  }
});

test("stale Feed data remains visible while its refresh is held", async ({ page }) => {
  test.skip(process.env.DISTIL_E2E_PRODUCTION !== "1", "Requires the production router cache.");
  const item = {
    id: "stale-feed-item",
    title: "Stale cached Feed item",
    summary: "Retained while Feed refreshes.",
    sourceType: "manual",
    contentType: "article",
    topics: [],
    url: "https://example.test/stale-feed",
    priority: "medium",
    isRead: false,
    processingStatus: "ready",
    createdAt: "2026-10-01T00:00:00Z",
    rank: { reasons: ["Saved for reading"], score: 1 },
  };
  let dataRequests = 0;
  let rscRequests = 0;
  let holdNextFeedRead = false;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshObserved!: () => void;
  const observedRefresh = new Promise<void>((resolve) => {
    refreshObserved = resolve;
  });

  page.on("request", (request) => {
    if (new URL(request.url()).searchParams.has("_rsc")) rscRequests++;
  });
  await page.route("**/api/v1/feed?*", async (route) => {
    dataRequests++;
    if (holdNextFeedRead) {
      holdNextFeedRead = false;
      refreshObserved();
      await refreshGate;
    }
    await route.fulfill({ json: { items: [item] } });
  });

  try {
    await page.goto("/feed");
    const cachedItem = page.getByText(item.title, { exact: true });
    await expect(cachedItem).toBeVisible();
    await page.getByRole("link", { name: "Today", exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    const warm = { dataRequests, rscRequests };

    await advanceBrowserClock(page, 121_000);
    holdNextFeedRead = true;
    await page
      .getByRole("link", { name: "Feed", exact: true })
      .filter({ visible: true })
      .evaluate((element: HTMLAnchorElement) => element.click());

    await expect(cachedItem).toBeVisible({ timeout: 500 });
    await observedRefresh;
    expect(rscRequests).toBe(warm.rscRequests);
    expect(dataRequests).toBe(warm.dataRequests + 1);
  } finally {
    releaseRefresh();
  }
});

test("Settings re-reads account authorization on every cached route return", async ({ page }) => {
  test.skip(process.env.DISTIL_E2E_PRODUCTION !== "1", "Requires the production router cache.");
  let accountRequests = 0;
  await page.route("**/api/v1/account", async (route) => {
    accountRequests++;
    await route.fulfill({ json: { account: { isAdmin: false } } });
  });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect.poll(() => accountRequests).toBe(1);
  await page.getByRole("link", { name: "Feed", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Feed", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect.poll(() => accountRequests).toBe(2);
});

test("fresh research navigation reuses data and explicit refresh keeps cached content", async ({
  page,
}, testInfo) => {
  const requests = { list: 0, suggestions: 0, report: 0, rsc: 0 };
  let failRefresh = false;
  page.on("request", (request) => {
    if (new URL(request.url()).searchParams.has("_rsc")) requests.rsc++;
  });
  await page.route("**/api/ai/research/list", async (route) => {
    requests.list++;
    await route.fulfill({
      status: failRefresh ? 503 : 200,
      json: failRefresh ? { error: "Unavailable" } : { reports: [report] },
    });
  });
  await page.route("**/api/ai/research/suggestions", async (route) => {
    requests.suggestions++;
    await route.fulfill({ json: { suggestions: [] } });
  });
  await page.route("**/api/ai/research/cache-report", async (route) => {
    requests.report++;
    await route.fulfill({ json: { report } });
  });
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "Research", exact: true })).toBeVisible();
  const card = page.locator('a[href="/research/cache-report"]');
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { name: report.query, exact: true })).toBeVisible();
  const initial = {
    list: requests.list,
    suggestions: requests.suggestions,
    report: requests.report,
  };
  if (process.env.DISTIL_E2E_PRODUCTION === "1")
    expect(initial).toEqual({ list: 1, suggestions: 1, report: 1 });
  else for (const count of Object.values(initial)) expect(count).toBeGreaterThanOrEqual(1);

  const returnSamples: number[] = [];
  for (let round = 0; round < 2; round++) {
    await observeNavigation(page, "Research");
    await page.getByRole("link", { name: "Back", exact: true }).first().click();
    await expect(card).toBeVisible();
    const duration = await page.evaluate(
      () => (window as unknown as { __cachedNavigationMs?: number }).__cachedNavigationMs
    );
    if (duration !== undefined) returnSamples.push(duration);
    await card.click();
    await expect(page.getByRole("heading", { name: report.query, exact: true })).toBeVisible();
  }
  expect(requests).toMatchObject(initial);
  await page.goBack();
  await expect(card).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: report.query, exact: true })).toBeVisible();
  expect(requests).toMatchObject(initial);

  await page.getByRole("link", { name: "Back", exact: true }).first().click();
  failRefresh = true;
  await page.getByRole("button", { name: "Refresh research" }).click();
  await expect(page.getByText("Refresh failed. Cached research is still shown.")).toBeVisible();
  await expect(card).toBeVisible();
  expect(requests).toMatchObject({
    list: initial.list + 1,
    suggestions: initial.suggestions + 1,
    report: initial.report,
  });
  await testInfo.attach("cache-navigation.json", {
    body: JSON.stringify(
      {
        requests,
        returnSamplesMs: returnSamples,
        productionBuild: process.env.DISTIL_E2E_PRODUCTION === "1",
      },
      null,
      2
    ),
    contentType: "application/json",
  });
});

test("Feed retains loaded pages and scroll while filters avoid RSC navigation", async ({
  page,
}, testInfo) => {
  let requests = 0;
  let filterRsc = 0;
  const items = Array.from({ length: 45 }, (_, index) => ({
    id: `navigation-${index}`,
    title: `Navigation article ${index}`,
    summary: "A saved article for browser cache checks.",
    sourceType: "manual",
    contentType: "article",
    topics: [],
    url: `https://example.test/article-${index}`,
    priority: "medium",
    isRead: false,
    processingStatus: "ready",
    createdAt: "2026-10-01T00:00:00Z",
    rank: { reasons: ["Saved for reading"], score: 1 },
  }));
  await page.route("**/api/v1/feed?*", async (route) => {
    requests++;
    const query = new URL(route.request().url()).searchParams;
    const data = query.has("q")
      ? [items[7]]
      : query.has("cursor")
        ? items.slice(30)
        : items.slice(0, 30);
    await route.fulfill({
      json: {
        items: data,
        nextCursor: !query.has("q") && !query.has("cursor") ? "page-2" : undefined,
      },
    });
  });
  await page.goto("/feed");
  await expect(page.getByText("Navigation article 0", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Navigation article 44", { exact: true })).toBeAttached();
  await page.evaluate(() => window.scrollTo(0, 800));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(800);
  await page.getByRole("link", { name: "Today", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  const beforeReturn = requests;
  await page.getByRole("link", { name: "Feed", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("Navigation article 44", { exact: true })).toBeAttached();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(800);
  expect(requests).toBe(beforeReturn);
  await page.evaluate(() => window.scrollTo(0, 0));
  const onRequest = (request: import("@playwright/test").Request) => {
    const url = new URL(request.url());
    // WebKit can dispatch the preceding Feed link's metadata prefetch after
    // cached content is already visible. Only navigation or filtered-route RSC
    // reads belong to this assertion; that delayed intent prefetch does not.
    const isIntentPrefetch = request.headers()["next-router-prefetch"] === "1";
    if (
      url.pathname === "/feed" &&
      url.searchParams.has("_rsc") &&
      (!isIntentPrefetch || url.searchParams.has("q"))
    )
      filterRsc++;
  };
  page.on("request", onRequest);
  await page.getByRole("searchbox").fill("Navigation article 7");
  await expect(page).toHaveURL(/q=Navigation/);
  await expect(page.getByText("Navigation article 7", { exact: true })).toBeVisible();
  await expect(page.getByText("Navigation article 0", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.getByText("Navigation article 44", { exact: true })).toBeAttached();
  expect(filterRsc).toBe(0);
  await testInfo.attach("feed-cache-navigation.json", {
    body: JSON.stringify({
      dataRequests: requests,
      filterRsc,
      restoredScrollY: 800,
      loadedItems: 45,
    }),
    contentType: "application/json",
  });
});
