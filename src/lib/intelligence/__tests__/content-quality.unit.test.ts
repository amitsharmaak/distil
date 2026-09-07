import {
  createExtractiveSummary,
  isUsableArticleText,
  normalizePlaintext,
  prepareCaptureSummaryInput,
  validateSummaryOutput,
} from "../content-quality";

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

  it("accepts a substantive visible paywall excerpt after removing its shell", () => {
    expect(isUsableArticleText(`${source}\nSubscribe now`)).toBe(true);
    expect(normalizePlaintext(`${source}\nSubscribe now`)).toBe(source);
  });

  it("keeps exactly the first 36k and final 12k characters for long inputs", () => {
    const input = `${"a".repeat(36_000)}${"middle".repeat(1_000)}${"z".repeat(12_000)}`;
    const prepared = prepareCaptureSummaryInput(input);
    expect(prepared).toHaveLength(48_000);
    expect(prepared.slice(0, 36_000)).toBe("a".repeat(36_000));
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
