const generateContent = jest.fn();
const embedContent = jest.fn();
const getGenerativeModel = jest.fn(() => ({ generateContent, embedContent }));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel })),
}));

jest.mock("@/lib/config", () => ({
  config: {
    geminiApiKey: "test-gemini-key",
    openaiApiKey: "",
    anthropicApiKey: "",
  },
}));

jest.mock("@/lib/database", () => ({
  getRecentEmbeddings: jest.fn(),
  upsertItemEmbedding: jest.fn(),
}));

import { DEFAULT_MODEL_CONFIG, GEMINI_SEARCH_MODEL, PROVIDER_FALLBACK_MODELS } from "../ai-config";
import { GeminiProviderImpl, createProviders } from "../providers";
import { cosineSimilarity, embedItem, generateEmbedding } from "../embeddings";
import { upsertItemEmbedding } from "@/lib/database";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Gemini Preview release configuration", () => {
  it("uses supported stable generation models for every Gemini assignment", () => {
    const configured = Object.values(DEFAULT_MODEL_CONFIG)
      .filter((assignment) => assignment.provider === "gemini")
      .map((assignment) => assignment.model);
    const fallbacks = Object.values(PROVIDER_FALLBACK_MODELS.gemini);

    expect([...configured, ...fallbacks, GEMINI_SEARCH_MODEL]).toEqual(
      expect.arrayContaining(["gemini-3.5-flash", "gemini-3.5-flash-lite"])
    );
    expect([...configured, ...fallbacks, GEMINI_SEARCH_MODEL]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("preview")])
    );
  });

  it("bounds generation calls and retries one rate limit without leaking it", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("429 rate limit from provider"))
      .mockResolvedValue({ response: { text: () => "accepted" } });

    await expect(
      new GeminiProviderImpl("test-key").generateText("prompt", "gemini-3.5-flash")
    ).resolves.toBe("accepted");
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent).toHaveBeenCalledWith("prompt", { timeout: 8_000 });
  });

  it("parses JSON and uses the stable search model", async () => {
    generateContent
      .mockResolvedValueOnce({ response: { text: () => 'prefix {"ok":true} suffix' } })
      .mockResolvedValueOnce({ response: { text: () => "grounded" } });
    const provider = new GeminiProviderImpl("test-key");

    await expect(
      provider.generateJSON<{ ok: boolean }>("prompt", "gemini-3.5-flash")
    ).resolves.toEqual({ ok: true });
    await expect(provider.generateTextWithSearch("question")).resolves.toBe("grounded");
    expect(getGenerativeModel).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "gemini-3.5-flash" })
    );
  });

  it("creates only the configured provider", () => {
    expect([...createProviders().keys()]).toEqual(["gemini"]);
  });
});

describe("Gemini embeddings", () => {
  it("uses the supported embedding model with a bounded request", async () => {
    embedContent.mockResolvedValue({ embedding: { values: [0.1, 0.2, 0.3] } });

    await expect(generateEmbedding(" article ")).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(getGenerativeModel).toHaveBeenCalledWith({ model: "gemini-embedding-001" });
    expect(embedContent).toHaveBeenCalledWith("article", { timeout: 5_000 });
  });

  it("persists the accepted model and computes similarity safely", async () => {
    embedContent.mockResolvedValue({ embedding: { values: [1, 0] } });

    await embedItem("item-1", "Title", "Summary");
    expect(upsertItemEmbedding).toHaveBeenCalledWith("item-1", [1, 0], "gemini-embedding-001");
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow("same length");
  });

  it("rejects empty input and empty provider responses", async () => {
    await expect(generateEmbedding("   ")).rejects.toThrow("empty text");
    embedContent.mockResolvedValue({ embedding: { values: [] } });
    await expect(generateEmbedding("article")).rejects.toThrow("empty embedding");
  });
});
