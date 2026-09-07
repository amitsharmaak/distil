import {
  createExtractiveSummary,
  isUsableArticleText,
  normalizeArticleText,
  normalizePlaintext,
  prepareCaptureSummaryInput,
  validateSummaryOutput,
} from "../content-quality";
import { extractContentFromHtml } from "@/lib/content-extractor";

const source =
  "The first sentence contains enough substantive information for a reader to understand the topic. " +
  "The second sentence explains the evidence and consequences in concrete terms. " +
  'The third sentence says, "Verified words from the source."';

describe("content quality", () => {
  it("normalizes Unicode and removes isolated browser chrome", () => {
    expect(
      normalizePlaintext("Ａ test\u200B\nAccept all cookies\nUseful prose remains here.")
    ).toBe("A test\n\nUseful prose remains here.");
  });

  it("rejects blank, HTML, and short shell content", () => {
    expect(isUsableArticleText("   ")).toBe(false);
    expect(
      isUsableArticleText("<div>This is HTML content with many words that must not leak.</div>")
    ).toBe(false);
    expect(isUsableArticleText("Sign in to continue")).toBe(false);
  });

  it("rejects a fragmented account-login shell with no substantive prose", () => {
    const loginShell =
      "Use your Google Account Email or phone Forgot email? Not your computer? " +
      "Use Guest mode to sign in privately. Create account Next";

    expect(normalizeArticleText(loginShell)).toBe("");
    expect(isUsableArticleText(loginShell)).toBe(false);
  });

  it("rejects a script-dependent Microsoft account shell", () => {
    const loginShell =
      "Microsoft account requires JavaScript to sign in. This web browser either does not " +
      "support JavaScript, or scripts are being blocked. Sign in to your Microsoft account.";

    expect(normalizeArticleText(loginShell)).toBe("");
    expect(isUsableArticleText(loginShell)).toBe(false);
  });

  it("accepts a substantive visible paywall excerpt after removing its shell", () => {
    expect(isUsableArticleText(`${source}\nSubscribe now`)).toBe(true);
    expect(normalizePlaintext(`${source}\nSubscribe now`)).toBe(source);
  });

  it("removes shell phrases concatenated with a substantive excerpt", () => {
    const readabilityStyleText =
      `Sign in to continue reading. ${source} ` +
      "Subscribe now for unlimited access to our journalism. Already a subscriber? Log in.";

    expect(normalizeArticleText(readabilityStyleText)).toBe(source);
    expect(isUsableArticleText(readabilityStyleText)).toBe(true);
  });

  it("does not strip ordinary prose that discusses subscriptions or login behavior", () => {
    const prose =
      "The product lets users subscribe for weekly research updates without opening the application. " +
      "Administrators sign in to access dashboards that explain delivery and engagement trends.";

    expect(normalizeArticleText(prose)).toBe(prose);
  });

  it.each([
    "Sign in to continue reading. Subscribe now for unlimited access to award-winning journalism. Already a subscriber? Log in.",
    "Checking your browser. Verify that you are human. Please wait while we check your connection. Enable JavaScript and cookies to continue.",
    "We use cookies to improve your experience. By continuing, you agree to our cookie policy. Manage cookie preferences.",
  ])("rejects a document-level access shell: %s", (shell) => {
    expect(normalizeArticleText(shell)).toBe("");
    expect(isUsableArticleText(shell)).toBe(false);
  });

  it("handles shell and excerpt text produced by actual Readability extraction", () => {
    const html = `<!doctype html><html><head><title>Subscriber story</title></head><body>
      <article>
        <p>Sign in to continue reading.</p>
        <p>${source}</p>
        <p>Subscribe now for unlimited access to our journalism.</p>
        <p>Already a subscriber? Log in.</p>
      </article>
    </body></html>`;
    const extracted = extractContentFromHtml(html, "https://example.com/subscriber-story");

    expect(extracted).not.toBeNull();
    expect(normalizeArticleText(extracted!.textContent)).toBe(source);
    expect(isUsableArticleText(extracted!.textContent)).toBe(true);
  });

  it("rejects an actual Readability extraction containing only a challenge shell", () => {
    const html = `<!doctype html><html><head><title>Security check</title></head><body>
      <main><article>
        <h1>Checking your browser</h1>
        <p>Verify that you are human.</p>
        <p>Please wait while we check your connection.</p>
        <p>Enable JavaScript and cookies to continue.</p>
      </article></main>
    </body></html>`;
    const extracted = extractContentFromHtml(html, "https://example.com/security-check");

    expect(extracted).not.toBeNull();
    expect(isUsableArticleText(extracted!.textContent)).toBe(false);
  });

  it("keeps bounded opening and final 12k characters for long inputs", () => {
    const input = `${"a".repeat(36_000)}${"middle".repeat(1_000)}${"z".repeat(12_000)}`;
    const prepared = prepareCaptureSummaryInput(input);
    expect(prepared).toHaveLength(48_000);
    expect(prepared).toContain("[... middle omitted ...]");
    expect(prepared.startsWith("a".repeat(35_000))).toBe(true);
    expect(prepared.slice(-12_000)).toBe("z".repeat(12_000));
  });

  it("validates structured summaries and drops unsupported quotes", () => {
    expect(
      validateSummaryOutput(
        {
          overview: "This is the first overview sentence. This is the second overview sentence.",
          keyPoints: ["Point one", "Point two", "Point three"],
          notableQuotes: ['"Verified words from the source."', '"Invented words that are absent."'],
        },
        source
      )
    ).toEqual({
      overview: "This is the first overview sentence. This is the second overview sentence.",
      keyPoints: ["Point one", "Point two", "Point three"],
      notableQuotes: ['"Verified words from the source."'],
    });
  });

  it.each([
    { overview: "Only one sentence.", keyPoints: ["One", "Two", "Three"] },
    {
      overview: "First sentence. Second sentence.",
      keyPoints: ["One", "Two"],
    },
    {
      overview: "First sentence. Second sentence.",
      keyPoints: ["One", "<b>HTML</b>", "Three"],
    },
  ])("rejects malformed or unsafe structured output %#", (output) => {
    expect(() => validateSummaryOutput(output, source)).toThrow("Invalid structured summary");
  });

  it("creates a bounded fallback from two or three complete sentences", () => {
    const fallback = createExtractiveSummary(source);
    expect(fallback).toBe(source);
    expect(fallback!.length).toBeLessThanOrEqual(500);
  });

  it("refuses to truncate a long sentence into an unsafe fragment", () => {
    const oneLongSentence = `${"word ".repeat(120)}ends here. A second sentence is complete.`;
    expect(createExtractiveSummary(oneLongSentence)).toBeNull();
  });
});
