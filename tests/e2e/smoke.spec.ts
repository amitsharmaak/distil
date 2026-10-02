import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { expectNoBlockingAccessibilityViolations } from "../support/browser/accessibility";
import {
  addSessionCookie,
  removeFixtureItems,
  seedFixtureItems,
  seededSessionReady,
} from "../support/browser/tenant-fixtures";
import { test, expect } from "../support/browser/test";

test("serves the real Next.js application", async ({ page }) => {
  await page.route("**/api/v1/feed?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' })
  );
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Distil/);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
});

test("has no serious or critical accessibility violations", async ({ page }, testInfo) => {
  await page.goto("/");
  await expectNoBlockingAccessibilityViolations(page, testInfo);
});

function heading(page: Page, name: string) {
  return page.getByRole("heading", { name, level: 1 });
}

/**
 * Production renders in UTC and hydrates in the reader's timezone and locale. A server and a
 * browser that share a timezone (CI, or a laptop running both) cannot see a clock time that is
 * formatted during render, so this browser is moved to another zone and the launcher pins the
 * server to UTC. Where the local database and session exist, Today, Feed and the reader are
 * server-rendered with data, as in production; elsewhere (CI) they render empty islands.
 */
test.describe("hydration with the browser in another timezone than the server", () => {
  test.use({ timezoneId: "Asia/Kolkata", locale: "en-IN" });

  const label = `hydration-${randomUUID().slice(0, 8)}`;
  let seeded: string[] = [];
  test.beforeAll(() => {
    if (seededSessionReady) seeded = seedFixtureItems(label);
  });
  test.afterAll(() => removeFixtureItems(label, seeded));

  test("no hydration error on any main surface, and the dark theme survives", async ({ page }) => {
    const hydrationErrors: string[] = [];
    const record = (text: string) => {
      if (/hydrat|Minified React error #(418|419|421|422|423|425)\b/i.test(text))
        hydrationErrors.push(`${new URL(page.url()).pathname}: ${text.slice(0, 240)}`);
    };
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") record(message.text());
    });
    page.on("pageerror", (error) => record(error.message));
    await page.addInitScript(() => {
      try {
        localStorage.setItem("theme", "dark");
      } catch {
        // The theme assertion below reports a browser without storage.
      }
    });
    if (seededSessionReady) await addSessionCookie(page);
    else
      await page.route("**/api/v1/feed?*", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' })
      );

    const surfaces: Array<{ path: string; ready: () => Promise<void> }> = [
      { path: "/", ready: () => expect(heading(page, "Today")).toBeVisible() },
      { path: "/feed", ready: () => expect(heading(page, "Feed")).toBeVisible() },
      ...(seeded.length > 0
        ? [
            {
              path: `/feed/${seeded[0]}`,
              ready: () => expect(page.getByRole("button", { name: "Mark as read" })).toBeVisible(),
            },
          ]
        : []),
      { path: "/research", ready: () => expect(heading(page, "Research")).toBeVisible() },
      { path: "/archive", ready: () => expect(heading(page, "Archive")).toBeVisible() },
      { path: "/settings", ready: () => expect(heading(page, "Settings")).toBeVisible() },
    ];

    for (const surface of surfaces) {
      await page.goto(surface.path);
      await surface.ready();
      // Hydration has finished once the app answers a keyboard shortcut.
      await expect(async () => {
        await page.keyboard.press("?");
        await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible({
          timeout: 1_000,
        });
      }).toPass({ timeout: 15_000 });
      await page.keyboard.press("Escape");

      if (seeded.length > 0 && (surface.path === "/" || surface.path === "/feed")) {
        // The server sent a placeholder; the reader's local time fills it after hydration.
        await expect(page.getByText("Updated").locator("time")).toBeVisible();
      }
      await expect(page.locator("html"), `theme on ${surface.path}`).toHaveClass(
        /(^|\s)dark(\s|$)/
      );
      expect(hydrationErrors, `hydration on ${surface.path}`).toEqual([]);
    }
  });
});
