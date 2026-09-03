import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

export function artifactSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "artifact";
}

/**
 * Store manually requested screenshots below the test's isolated output path.
 * Playwright's automatic failure screenshots use the same project/test folder.
 */
export async function captureNamedScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<string> {
  const screenshotPath = testInfo.outputPath("screenshots", `${artifactSlug(name)}.png`);
  await mkdir(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}
