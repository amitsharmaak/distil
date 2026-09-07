import { expectNoBlockingAccessibilityViolations } from "../support/browser/accessibility";
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
