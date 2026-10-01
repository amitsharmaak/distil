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
  expect(requests).toMatchObject({ list: 1, suggestions: 1, report: 1 });

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
  expect(requests).toMatchObject({ list: 1, suggestions: 1, report: 1 });
  await page.goBack();
  await expect(card).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: report.query, exact: true })).toBeVisible();
  expect(requests).toMatchObject({ list: 1, suggestions: 1, report: 1 });

  await page.getByRole("link", { name: "Back", exact: true }).first().click();
  failRefresh = true;
  await page.getByRole("button", { name: "Refresh research" }).click();
  await expect(page.getByText("Refresh failed. Cached research is still shown.")).toBeVisible();
  await expect(card).toBeVisible();
  expect(requests).toMatchObject({ list: 2, suggestions: 2, report: 1 });
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
