import { expectNoBlockingAccessibilityViolations } from "../support/browser/accessibility";
import { test, expect } from "../support/browser/test";

test("serves the real Next.js application", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Distil/);
  await expect(page.getByRole("heading", { name: "Today’s Brief", level: 1 })).toBeVisible();
});

test("has no serious or critical accessibility violations", async ({ page }, testInfo) => {
  await page.goto("/");
  await expectNoBlockingAccessibilityViolations(page, testInfo);
});
