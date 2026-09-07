const generateContent = jest.fn();
const embedContent = jest.fn();
const getGenerativeModel = jest.fn(() => ({ generateContent, embedContent }));
const mockOpenAICreate = jest.fn();
const mockAnthropicCreate = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel })),
}));

jest.mock("openai", () => jest.fn(() => ({ chat: { completions: { create: mockOpenAICreate } } })));

jest.mock("@anthropic-ai/sdk", () =>
  jest.fn(() => ({ messages: { create: mockAnthropicCreate } }))
);

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

import {
  DEFAULT_MODEL_CONFIG,
  GEMINI_SEARCH_MODEL,
  PROVIDER_FALLBACK_MODELS,
  TASK_MODEL_CANDIDATES,
} from "../ai-config";
import {
  AnthropicProviderImpl,
  GeminiProviderImpl,
  OpenAIProviderImpl,
  createProviders,
} from "../providers";
import type { ResponseSchema } from "@google/generative-ai";
import { cosineSimilarity, embedItem, generateEmbedding } from "../embeddings";
import { upsertItemEmbedding } from "@/lib/database";
import { config } from "@/lib/config";

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
    expect(TASK_MODEL_CANDIDATES.summarize?.gemini).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ]);
    expect([...configured, ...fallbacks, GEMINI_SEARCH_MODEL]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("preview")])
    );
  });

  it("does not retry quota failures within the same model", async () => {
    generateContent.mockRejectedValue(new Error("429 rate limit from provider"));

    await expect(
      new GeminiProviderImpl("test-key").generateText("prompt", "gemini-3.5-flash-lite")
    ).rejects.toMatchObject({ category: "quota", message: "AI provider quota exhausted" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("bounds generation calls and retries one transient server failure", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("503 unavailable"))
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

    const responseSchema = {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    } as unknown as ResponseSchema;
    await expect(
      provider.generateJSON<{ ok: boolean }>("prompt", "gemini-3.5-flash", { responseSchema })
    ).resolves.toEqual({ ok: true });
    expect(getGenerativeModel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseMimeType: "application/json",
          responseSchema,
        }),
      })
    );
    await expect(provider.generateTextWithSearch("question")).resolves.toBe("grounded");
    expect(getGenerativeModel).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "gemini-3.5-flash" })
    );
  });

  it("creates only the configured provider", () => {
    expect([...createProviders().keys()]).toEqual(["gemini"]);
  });

  it("creates every explicitly configured provider", () => {
    const mutableConfig = config as { openaiApiKey: string; anthropicApiKey: string };
    mutableConfig.openaiApiKey = "test-openai-key";
    mutableConfig.anthropicApiKey = "test-anthropic-key";

    expect([...createProviders().keys()]).toEqual(["gemini", "openai", "anthropic"]);

    mutableConfig.openaiApiKey = "";
    mutableConfig.anthropicApiKey = "";
  });
});

describe("non-Gemini provider release behavior", () => {
  it("generates OpenAI text and structured JSON with bounded defaults and overrides", async () => {
    mockOpenAICreate
      .mockResolvedValueOnce({ choices: [{ message: { content: "accepted" } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    const provider = new OpenAIProviderImpl("test-key");

    await expect(provider.generateText("prompt", "gpt-test")).resolves.toBe("accepted");
    await expect(
      provider.generateJSON<{ ok: boolean }>("prompt", "gpt-test", {
        maxTokens: 321,
        temperature: 0.2,
      })
    ).resolves.toEqual({ ok: true });
    expect(mockOpenAICreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ max_tokens: 4096, temperature: undefined })
    );
    expect(mockOpenAICreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ max_tokens: 321, temperature: 0.2 })
    );
  });

  it("sanitizes empty and malformed OpenAI responses", async () => {
    mockOpenAICreate
      .mockResolvedValueOnce({ choices: [] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "not-json" } }] });
    const provider = new OpenAIProviderImpl("test-key");

    await expect(provider.generateText("prompt", "gpt-test")).rejects.toMatchObject({
      category: "invalid_output",
    });
    await expect(provider.generateJSON("prompt", "gpt-test")).rejects.toMatchObject({
      category: "invalid_output",
    });
  });

  it("generates Anthropic text and structured JSON with bounded defaults and overrides", async () => {
    mockAnthropicCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "accepted" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: '[{"ok":true}]' }] });
    const provider = new AnthropicProviderImpl("test-key");

    await expect(provider.generateText("prompt", "claude-test")).resolves.toBe("accepted");
    await expect(
      provider.generateJSON<Array<{ ok: boolean }>>("prompt", "claude-test", {
        maxTokens: 654,
        temperature: 0.1,
      })
    ).resolves.toEqual([{ ok: true }]);
    expect(mockAnthropicCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ max_tokens: 4096, temperature: undefined })
    );
    expect(mockAnthropicCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ max_tokens: 654, temperature: 0.1 })
    );
  });

  it("sanitizes non-text and blank Anthropic responses", async () => {
    mockAnthropicCreate
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "tool-1" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "   " }] });
    const provider = new AnthropicProviderImpl("test-key");

    await expect(provider.generateText("prompt", "claude-test")).rejects.toMatchObject({
      category: "invalid_output",
    });
    await expect(provider.generateText("prompt", "claude-test")).rejects.toMatchObject({
      category: "invalid_output",
    });
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
