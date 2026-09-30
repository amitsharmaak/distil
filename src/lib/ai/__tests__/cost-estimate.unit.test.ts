import { GEMINI_SEARCH_QUERY_COST } from "../ai-config";
import { geminiUsage } from "../providers";
import { estimateCost } from "../router";

describe("geminiUsage", () => {
  it("bills thinking tokens as output", () => {
    const usage = geminiUsage({
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 260 },
    });
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 300 });
  });

  it("counts the Google Search queries a grounded call ran", () => {
    const usage = geminiUsage({
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      candidates: [{ groundingMetadata: { webSearchQueries: ["a", "b", "c"] } }],
    });
    expect(usage.searchQueries).toBe(3);
  });

  it("reports zero usage when metadata is missing", () => {
    expect(geminiUsage({})).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("estimateCost", () => {
  it("prices input and output per million tokens", () => {
    // gemini-3.5-flash: $1.50 in, $9.00 out
    expect(
      estimateCost("gemini-3.5-flash", { inputTokens: 1_000_000, outputTokens: 1_000_000 })
    ).toBeCloseTo(10.5);
  });

  it("adds the per-query grounding fee", () => {
    const tokensOnly = estimateCost("gemini-3-flash-preview", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    const grounded = estimateCost("gemini-3-flash-preview", {
      inputTokens: 1000,
      outputTokens: 500,
      searchQueries: 2,
    });
    expect(grounded - tokensOnly).toBeCloseTo(2 * GEMINI_SEARCH_QUERY_COST);
    expect(GEMINI_SEARCH_QUERY_COST).toBeCloseTo(0.014);
  });

  it("prices Anthropic cache writes at 1.25× and cache reads at 0.1× of the input rate", () => {
    // claude-sonnet-4-6: $3.00 in. 1M uncached + 1M written + 1M read = 3.00 + 3.75 + 0.30.
    expect(
      estimateCost("claude-sonnet-4-6", {
        inputTokens: 3_000_000,
        outputTokens: 0,
        cacheWriteTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
      })
    ).toBeCloseTo(7.05);
  });

  it("charges nothing for tokens on an unpriced model", () => {
    expect(estimateCost("unknown-model", { inputTokens: 1000, outputTokens: 1000 })).toBe(0);
  });
});
