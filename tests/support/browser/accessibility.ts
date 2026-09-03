import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

export interface AccessibilityOptions {
  include?: string | string[];
  exclude?: string | string[];
}

/** Run axe and fail only on the serious/critical acceptance threshold. */
export async function expectNoBlockingAccessibilityViolations(
  page: Page,
  testInfo: TestInfo,
  options: AccessibilityOptions = {}
) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

  if (options.include !== undefined) builder = builder.include(options.include);
  if (options.exclude !== undefined) builder = builder.exclude(options.exclude);

  const results = await builder.analyze();
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact != null && BLOCKING_IMPACTS.has(impact)
  );

  await testInfo.attach("axe-accessibility.json", {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: "application/json",
  });

  const summary = blockingViolations
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} node(s)`)
    .join("\n");

  expect(blockingViolations, summary || "No serious or critical accessibility violations").toEqual(
    []
  );

  return results;
}
