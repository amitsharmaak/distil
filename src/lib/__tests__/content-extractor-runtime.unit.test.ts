import { extractContentFromHtml, extractPlaintextFromHtml } from "@/lib/content-extractor";

describe("content extractor server runtime", () => {
  it("loads the real jsdom dependency and extracts article HTML", () => {
    const paragraphs = Array.from(
      { length: 8 },
      (_, index) =>
        `<p>Paragraph ${index + 1} provides enough meaningful article text for Readability to identify the main content.</p>`
    ).join("");

    const result = extractContentFromHtml(
      `<html><head><title>Runtime smoke</title></head><body><article><h1>Runtime smoke</h1>${paragraphs}</article></body></html>`,
      "https://example.com/runtime-smoke"
    );

    expect(result).not.toBeNull();
    expect(result?.title).toContain("Runtime smoke");
    expect(result?.textContent).toContain("meaningful article text");
  });

  it("preserves word boundaries between nested reader elements", () => {
    expect(
      extractPlaintextFromHtml(
        "<article><h2>Sign in</h2><p>to continue</p><p>Email or phone</p><p>Forgot email?</p></article>"
      )
    ).toMatch(/Sign in\s+to continue\s+Email or phone\s+Forgot email\?/);
  });
});
