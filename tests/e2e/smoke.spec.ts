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

test("the phone top bar and the installed-app manifest carry the logo", async ({
  page,
  request,
  viewport,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  for (const icon of manifest.icons) {
    expect(icon.src).toMatch(/^\/icons\/[\w-]+\.png\?v=\w+$/);
    expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  }

  test.skip((viewport?.width ?? 0) >= 768, "The top bar is replaced by the sidebar from md up.");
  await page.goto("/");
  const logo = page.getByRole("banner").locator('svg[aria-label="Distil logo"]');
  await expect(logo).toBeVisible();
  await expect(logo.locator("path")).toHaveCount(2);
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
    else {
      // Without a user the content APIs answer 401, which replaces the page with the session
      // notice. Answer them with empty lists so each surface renders its own layout.
      const empty = (body: string) => ({ status: 200, contentType: "application/json", body });
      await page.route("**/api/v1/feed?*", (route) => route.fulfill(empty('{"items":[]}')));
      await page.route("**/api/ai/research/list", (route) =>
        route.fulfill(empty('{"reports":[]}'))
      );
      await page.route("**/api/ai/research/suggestions", (route) =>
        route.fulfill(empty('{"suggestions":[]}'))
      );
    }

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
      // Archive exists only with the knowledge UI flag, which CI leaves off.
      ...(process.env.FEATURE_KNOWLEDGE_UI === "true"
        ? [{ path: "/archive", ready: () => expect(heading(page, "Archive")).toBeVisible() }]
        : []),
      { path: "/settings", ready: () => expect(heading(page, "Settings")).toBeVisible() },
    ];

    for (const surface of surfaces) {
      await page.goto(surface.path);
      await surface.ready();
      // Hydration runs as soon as the scripts arrive; give it and its error report time to land.
      await page.waitForLoadState("load");
      await page.waitForTimeout(1_000);

      expect(hydrationErrors, `hydration on ${surface.path}`).toEqual([]);
      await expect(page.locator("html"), `theme on ${surface.path}`).toHaveClass(
        /(^|\s)dark(\s|$)/
      );
      if (seeded.length > 0 && (surface.path === "/" || surface.path === "/feed")) {
        // The server sent a placeholder; the reader's local time fills it after hydration.
        await expect(page.getByText("Updated").locator("time")).toBeVisible();
      }
    }
  });
});
