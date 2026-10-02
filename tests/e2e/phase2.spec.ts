import { createSessionToken } from "../../src/lib/auth/session";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/constants";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/browser/test";

const allPhase2UiEnabled = ["FEATURE_KNOWLEDGE_UI", "FEATURE_DIGESTS"].every(
  (name) => process.env[name]?.trim().toLowerCase() === "true"
);

async function mockTodayFeed(page: Page) {
  await page.route("**/api/v1/feed?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"items":[],"resurfacedItems":[]}',
    })
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

test("renders enabled Phase 2 navigation and deterministic core states", async ({
  page,
  isMobile,
}) => {
  test.skip(!allPhase2UiEnabled, "Run with all Phase 2 UI flags enabled.");
  await mockTodayFeed(page);
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
  // Search lives in the Feed and Today headers; there is no separate Search destination.
  await expect(page.locator('a[href="/search"]')).toHaveCount(0);
  // Ask Distil was removed; the phone bar is Today / Feed / Save / Settings.
  await expect(page.getByRole("link", { name: "Ask" })).toHaveCount(0);
  if (isMobile) {
    await expect(page.getByRole("link", { name: "Save" })).toBeVisible();
  }
  // Digests left primary navigation in the 2026-09 simplification; Settings links to it.
  await expect(page.getByRole("link", { name: "Digests" })).toHaveCount(0);

  // Old Search links land on the equivalent Feed view.
  await page.goto("/search?q=padel");
  await expect(page).toHaveURL(/\/feed\?q=padel$/);

  await page.goto("/digests");
  await expect(page.getByRole("heading", { name: "No digest yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible();

  // The reader resolves authentication on the server even when the proxy's test mode is on.
  // Use the local session, as the real PostgreSQL keyboard flow does.
  if (process.env.DISTIL_SESSION_SECRET && process.env.DISTIL_LEGACY_USER_ID) {
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: await createSessionToken(process.env.DISTIL_SESSION_SECRET),
        url: test.info().project.use.baseURL ?? "http://127.0.0.1:3100",
      },
    ]);
  }
  const readerResponse = await page.goto("/feed/phase2-fixture");
  expect(readerResponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Item not found" })).toBeVisible();
});
