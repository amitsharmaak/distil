import type { Page } from "@playwright/test";
import { test, expect } from "../support/browser/test";

const allPhase2UiEnabled = [
  "FEATURE_KNOWLEDGE_UI",
  "FEATURE_SEARCH",
  "FEATURE_ANSWERS",
  "FEATURE_DIGESTS",
].every((name) => process.env[name]?.trim().toLowerCase() === "true");

async function mockTodayFeed(page: Page) {
  await page.route("**/api/v1/feed?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' })
  );
}

test("keeps disabled Phase 2 destinations out of browser navigation and direct routes", async ({
  page,
}) => {
  test.skip(allPhase2UiEnabled, "This run enables every Phase 2 UI feature.");
  await mockTodayFeed(page);
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Ask" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Digests" })).not.toBeVisible();
  await expect(page.locator('a[href="/search"]')).toHaveCount(0);

  await page.goto("/digests");
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
});

test("renders enabled Phase 2 navigation and deterministic core states", async ({ page }) => {
  test.skip(!allPhase2UiEnabled, "Run with all Phase 2 UI flags enabled.");
  await mockTodayFeed(page);
  await page.route("**/api/v1/search?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: "padel",
        results: [
          {
            itemId: "fixture-item",
            chunkId: "fixture-chunk",
            contentVersionId: "fixture-version",
            title: "Fixture padel article",
            url: "https://example.test/padel",
            sourceType: "manual",
            excerpt: "A deterministic passage about padel.",
            excerptStart: 0,
            excerptEnd: 37,
            score: 1,
            reasons: ["keyword:chunk_text"],
            retrievalMode: "keyword",
            degradation: [],
          },
        ],
        retrievalMode: "keyword",
        degradation: [],
      }),
    })
  );
  await page.route("**/api/v1/preferences", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        preferences: {
          digestEnabled: true,
          digestTimezone: "UTC",
          personalizationEnabled: true,
          updatedAt: "2026-09-07T00:00:00.000Z",
        },
      }),
    })
  );
  await page.route("**/api/v1/digests?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"digests":[]}' })
  );

  await page.goto("/");
  await expect(page.locator('a[href="/search"]:visible')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Ask" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Digests" })).toBeVisible();

  await page.goto("/search?q=padel");
  await expect(page.getByRole("heading", { name: "Search your knowledge" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fixture padel article" })).toBeVisible();

  await page.goto("/digests");
  await expect(page.getByRole("heading", { name: "No digest yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible();

  const readerResponse = await page.goto("/feed/phase2-fixture");
  expect(readerResponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Item not found" })).toBeVisible();
});
