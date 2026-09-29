/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AISummary } from "../ai-summary";
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => {} }));
beforeEach(() => jest.mocked(global.fetch).mockReset());

it("escapes plain original content instead of interpreting it as HTML", async () => {
  const { container } = render(
    <AISummary
      itemId="one"
      ogSummary="fallback"
      fullContent={'Plain text with <script data-test="unsafe">alert(1)</script>'}
      fullContentIsHtml={false}
    />
  );

  expect(container.querySelector("script[data-test=unsafe]")).toBeNull();
  expect(await screen.findByText(/Plain text with <script/)).toBeVisible();
});

it("keeps the original readable after generation fails", async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: false,
    json: async () => ({ error: "Service unavailable" }),
  } as Response);
  render(<AISummary itemId="one" ogSummary="Original article remains readable" />);
  fireEvent.click(screen.getByText("Generate AI Summary"));
  await screen.findByText("Service unavailable");
  expect(screen.getByText("Original article remains readable")).toBeVisible();
});
it("retries the failed Detailed request and preserves the existing brief summary", async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Temporary failure" } }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ summary: "Detailed result" }),
    } as Response);
  render(<AISummary itemId="one" ogSummary="original" initialBriefSummary="Existing brief" />);
  fireEvent.click(screen.getByText("Detailed"));
  await screen.findByText("Temporary failure");
  expect(screen.getByText("Existing brief")).toBeVisible();
  fireEvent.click(screen.getByText("Try Again"));
  await screen.findByText("Detailed result");
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(jest.mocked(global.fetch).mock.calls[1][1]!.body as string)).toEqual({
    itemId: "one",
    length: "detailed",
    force: false,
  });
});

it("styles content-aware brief sections by their shape, not their heading", () => {
  const brief = [
    "## TL;DR",
    "",
    "A short overview.",
    "",
    "## The three steps",
    "",
    "1. Install it",
    "2. Configure it",
    "",
    "## What changes for developers",
    "",
    "- Faster builds",
    "- Fewer flags",
    "",
    "## In their words",
    "",
    "> We shipped it in a week.",
  ].join("\n");
  const { container } = render(
    <AISummary itemId="one" ogSummary="original" initialBriefSummary={brief} />
  );

  expect(screen.getByText("The three steps")).toBeVisible();
  expect(screen.getByText("What changes for developers")).toBeVisible();
  const styles = [...container.querySelectorAll("[data-section-style]")].map((node) =>
    node.getAttribute("data-section-style")
  );
  expect(styles).toEqual(["steps", "bullets", "quotes"]);
});

it("keeps rendering stored v1 summaries with their fixed sections", () => {
  const v1 =
    '## TL;DR\n\nOverview.\n\n## Key Points\n\n- One\n- Two\n\n## Notable Quotes\n\n- "Quote"';
  const { container } = render(
    <AISummary itemId="one" ogSummary="original" initialBriefSummary={v1} />
  );

  expect(screen.getByText("Key Points")).toBeVisible();
  const styles = [...container.querySelectorAll("[data-section-style]")].map((node) =>
    node.getAttribute("data-section-style")
  );
  expect(styles).toEqual(["bullets", "quotes"]);
});

const briefMarkdown = "## TL;DR\n\nA short overview.\n\n## What changed\n\n- Faster builds";
const detailedMarkdown = [
  briefMarkdown,
  "## Going deeper",
  "## Where the speed comes from\n\n_Expands on: How did they get 2x?_\n\n- A new cache layer",
  "## Limits\n\nCold starts are unchanged.",
].join("\n\n");

it("stacks the detailed view: the brief once, a Going deeper divider, then the delta", () => {
  const { container } = render(
    <AISummary
      itemId="one"
      ogSummary="original"
      initialBriefSummary={briefMarkdown}
      initialDetailedSummary={detailedMarkdown}
    />
  );
  fireEvent.click(screen.getByText("Detailed"));

  expect(screen.getAllByText("A short overview.")).toHaveLength(1);
  const divider = screen.getByRole("separator", { name: "Going deeper" });
  expect(divider).toBeVisible();
  expect(screen.getByText("Expands on: How did they get 2x?")).toBeVisible();
  expect(screen.queryByText(/_Expands on/)).toBeNull();
  const text = container.textContent ?? "";
  expect(text.indexOf("What changed")).toBeLessThan(text.indexOf("Going deeper"));
  expect(text.indexOf("Going deeper")).toBeLessThan(text.indexOf("Where the speed comes from"));
  const styles = [...container.querySelectorAll("[data-section-style]")].map((node) =>
    node.getAttribute("data-section-style")
  );
  expect(styles).toEqual(["bullets", "bullets"]);
});

it("drops the detailed summary when the brief is regenerated, and takes a new brief from a detailed response", async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ summary: "## TL;DR\n\nNew brief.", cached: false }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        summary: "## TL;DR\n\nNewest brief.\n\n## Going deeper\n\n## More\n\n- Detail",
        briefSummary: "## TL;DR\n\nNewest brief.",
        cached: false,
      }),
    } as Response);
  render(
    <AISummary
      itemId="one"
      ogSummary="original"
      initialBriefSummary={briefMarkdown}
      initialDetailedSummary={detailedMarkdown}
    />
  );
  fireEvent.click(screen.getByText("Regenerate"));
  await screen.findByText("New brief.");

  // The old detailed summary was built from the old brief, so Detailed asks the server again.
  fireEvent.click(screen.getByText("Detailed"));
  await screen.findByText("- Detail");
  expect(JSON.parse(jest.mocked(global.fetch).mock.calls[1][1]!.body as string)).toMatchObject({
    length: "detailed",
  });
  fireEvent.click(screen.getByText("Brief"));
  expect(await screen.findByText("Newest brief.")).toBeVisible();
});
