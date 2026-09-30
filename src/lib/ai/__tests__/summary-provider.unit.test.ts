const mockGenerateContent = jest.fn();
const mockGetModel = jest.fn(() => ({ generateContent: mockGenerateContent }));
const mockAnthropicCreate = jest.fn();
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: mockGetModel })),
}));
jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn(() => ({ messages: { create: mockAnthropicCreate } })),
}));
import {
  AnthropicProviderImpl,
  GeminiProviderImpl,
  geminiText,
  geminiThinkingConfig,
  parseGroundingSources,
} from "../providers";
import { AIProviderError, classifyProviderFailure } from "../errors";
import { sanitizeLogError } from "@/lib/logger";
beforeEach(() => {
  jest.clearAllMocks();
});
it("marks the stable Sonnet system preamble as ephemeral cache content", async () => {
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "answer" }],
    usage: {
      input_tokens: 10,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 30,
      output_tokens: 4,
    },
  });
  await expect(
    new AnthropicProviderImpl("key").generateText("question", "claude-sonnet-4-6")
  ).resolves.toEqual({ value: "answer", usage: { inputTokens: 60, outputTokens: 4 } });
  expect(mockAnthropicCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      system: [expect.objectContaining({ cache_control: { type: "ephemeral" } })],
    }),
    { timeout: 15_000 }
  );
});
it("requests native JSON with a finite timeout and the supplied schema", async () => {
  mockGenerateContent.mockResolvedValue({ response: { text: () => '{"ok":true}' } });
  const provider = new GeminiProviderImpl("synthetic-key");
  await expect(
    provider.generateJSON("synthetic", "synthetic-model", {
      responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } } } as never,
    })
  ).resolves.toEqual({ value: { ok: true }, usage: { inputTokens: 0, outputTokens: 0 } });
  expect(mockGetModel).toHaveBeenCalledWith(
    expect.objectContaining({
      generationConfig: expect.objectContaining({
        responseMimeType: "application/json",
        responseSchema: expect.any(Object),
      }),
    })
  );
  expect(mockGenerateContent).toHaveBeenCalledWith("synthetic", { timeout: 15000 });
});
it("returns a safe error code for malformed model output", async () => {
  mockGenerateContent.mockResolvedValue({ response: { text: () => "<private invalid body>" } });
  await expect(
    new GeminiProviderImpl("key").generateJSON("synthetic", "model")
  ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
});
it("does not spend retries on exhausted quota or expose the raw provider error", async () => {
  mockGenerateContent.mockRejectedValue(
    Object.assign(new Error("private-key private-content"), { status: 429 })
  );
  const error = await new GeminiProviderImpl("key")
    .generateJSON("synthetic", "model")
    .catch((e) => e);
  expect(error).toBeInstanceOf(AIProviderError);
  expect(sanitizeLogError(error)).toEqual({ type: "AIProviderError", code: "AI_QUOTA" });
  expect(JSON.stringify(error)).not.toMatch(/private-key|private-content/);
  expect(mockGenerateContent).toHaveBeenCalledTimes(1);
});
it("retries one transient provider failure", async () => {
  mockGenerateContent
    .mockRejectedValueOnce(Object.assign(new Error("temporary"), { status: 503 }))
    .mockResolvedValueOnce({ response: { text: () => '{"ok":true}' } });
  await expect(new GeminiProviderImpl("key").generateJSON("synthetic", "model")).resolves.toEqual({
    value: { ok: true },
    usage: { inputTokens: 0, outputTokens: 0 },
  });
  expect(mockGenerateContent).toHaveBeenCalledTimes(2);
});
it.each([
  [401, "authentication"],
  [400, "invalid_request"],
  [500, "server"],
  [429, "quota"],
])("classifies status %s", (status, category) => {
  expect(classifyProviderFailure(Object.assign(new Error("redacted"), { status }))).toBe(category);
});
it.each([
  [new Error("request timed out"), "timeout"],
  [new Error("api key invalid"), "authentication"],
  [new Error("service unavailable"), "server"],
  [new Error("bad request"), "invalid_request"],
  [null, "unknown"],
  [new Error("unclassified"), "unknown"],
  [{ statusCode: 429 }, "quota"],
  [new AIProviderError("invalid_output"), "invalid_output"],
])("classifies SDK errors without retaining payloads", (error, category) => {
  expect(classifyProviderFailure(error)).toBe(category);
});
it("returns grounding chunks with the grounded answer, de-duplicated and validated", async () => {
  const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
  mockGenerateContent.mockResolvedValue({
    response: {
      text: () => "grounded notes",
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
      candidates: [
        {
          groundingMetadata: {
            webSearchQueries: ["q1", "q2"],
            groundingChunks: [
              { web: { uri: redirect, title: " who.int " } },
              { web: { uri: redirect, title: "duplicate" } },
              { web: { uri: "ftp://not-web.example", title: "x" } },
              { web: { title: "no uri" } },
              { retrievedContext: { uri: "https://other.example" } },
              { web: { uri: "https://direct.example/page" } },
            ],
          },
        },
      ],
    },
  });
  await expect(
    new GeminiProviderImpl("key").generateTextWithSearch("synthetic", { timeoutMs: 45_000 })
  ).resolves.toEqual({
    value: "grounded notes",
    usage: { inputTokens: 12, outputTokens: 7, searchQueries: 2 },
    sources: [
      { url: redirect, title: "who.int" },
      { url: "https://direct.example/page", title: "" },
    ],
  });
  expect(mockGenerateContent).toHaveBeenCalledWith("synthetic", { timeout: 45_000 });
});
it("rejects a Gemini answer cut off at the token limit when asked to", async () => {
  const truncated = {
    response: {
      text: () => " tail of reasoning [1].",
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: " tail" }] } }],
    },
  };
  mockGenerateContent.mockResolvedValue(truncated);
  await expect(
    new GeminiProviderImpl("key").generateText("synthetic", "model", {
      maxTokens: 12_000,
      rejectTruncated: true,
    })
  ).rejects.toMatchObject({ category: "invalid_output" });
  expect(mockGetModel).toHaveBeenCalledWith(
    expect.objectContaining({
      generationConfig: expect.objectContaining({ maxOutputTokens: 12_000 }),
    })
  );
  // Without the flag the text is returned as before.
  await expect(
    new GeminiProviderImpl("key").generateText("synthetic", "model")
  ).resolves.toMatchObject({ value: " tail of reasoning [1]." });
});
it("rejects an Anthropic answer stopped at max_tokens when asked to", async () => {
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "partial" }],
    stop_reason: "max_tokens",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  await expect(
    new AnthropicProviderImpl("key").generateText("q", "claude-sonnet-4-6", {
      rejectTruncated: true,
    })
  ).rejects.toMatchObject({ category: "invalid_output" });
  await expect(
    new AnthropicProviderImpl("key").generateText("q", "claude-sonnet-4-6")
  ).resolves.toMatchObject({ value: "partial" });
});
it("makes one Anthropic attempt with the caller's abort signal when maxAttempts is 1", async () => {
  // The SDK's default 2 retries each rerun the full timeout; research synthesis (45 s) must not.
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "## Report" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  const controller = new AbortController();
  await new AnthropicProviderImpl("key").generateText("q", "claude-sonnet-4-6", {
    timeoutMs: 45_000,
    maxAttempts: 1,
    signal: controller.signal,
  });
  expect(mockAnthropicCreate).toHaveBeenCalledWith(expect.anything(), {
    timeout: 45_000,
    maxRetries: 0,
    signal: controller.signal,
  });
});
it("applies the serving provider's output-budget override", async () => {
  const options = {
    maxTokens: 2_400,
    rejectTruncated: false,
    providerOverrides: { gemini: { maxTokens: 8_192, rejectTruncated: true } },
  };
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "## Report cut" }],
    stop_reason: "max_tokens",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  // Claude keeps a report that reached its cap (it is not a thinking fragment).
  await expect(
    new AnthropicProviderImpl("key").generateText("q", "claude-sonnet-4-6", options)
  ).resolves.toMatchObject({ value: "## Report cut" });
  expect(mockAnthropicCreate).toHaveBeenCalledWith(
    expect.objectContaining({ max_tokens: 2_400 }),
    expect.anything()
  );
  mockGenerateContent.mockResolvedValue({
    response: {
      text: () => "tail",
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "tail" }] } }],
    },
  });
  await expect(
    new GeminiProviderImpl("key").generateText("q", "model", options)
  ).rejects.toMatchObject({ category: "invalid_output" });
  expect(mockGetModel).toHaveBeenCalledWith(
    expect.objectContaining({
      generationConfig: expect.objectContaining({ maxOutputTokens: 8_192 }),
    })
  );
});
it("excludes thought parts from Gemini answer text", () => {
  const parts = [{ text: "planning…", thought: true }, { text: "## Report" }, { text: "\nBody" }];
  expect(
    geminiText({
      text: () => parts.map((part) => part.text).join(""),
      candidates: [{ content: { parts } }],
    })
  ).toBe("## Report\nBody");
  expect(geminiText({ text: () => "plain" })).toBe("plain");
});
it("returns no sources when the grounded answer carries no grounding metadata", async () => {
  mockGenerateContent.mockResolvedValue({ response: { text: () => "memory notes" } });
  await expect(
    new GeminiProviderImpl("key").generateTextWithSearch("synthetic")
  ).resolves.toMatchObject({ value: "memory notes", sources: [] });
  expect(
    parseGroundingSources({ candidates: [{ groundingMetadata: { groundingChunks: "x" } }] })
  ).toEqual([]);
});
it("maps the thinking option to Gemini's thinkingConfig for the model generation", () => {
  expect(geminiThinkingConfig("gemini-3.5-flash", "low")).toEqual({
    thinkingConfig: { thinkingLevel: "low" },
  });
  expect(geminiThinkingConfig("gemini-3-flash-preview", "high")).toEqual({
    thinkingConfig: { thinkingLevel: "high" },
  });
  expect(geminiThinkingConfig("gemini-2.5-flash", "low")).toEqual({
    thinkingConfig: { thinkingBudget: 1024 },
  });
  // Models without a thinking control, and no option, send nothing.
  expect(geminiThinkingConfig("gemini-2.0-flash", "low")).toEqual({});
  expect(geminiThinkingConfig("gemini-3.5-flash", undefined)).toEqual({});
});
it("sends thinkingConfig with text and JSON calls only when asked", async () => {
  mockGenerateContent.mockResolvedValue({ response: { text: () => '{"ok":true}' } });
  const provider = new GeminiProviderImpl("key");
  await provider.generateText("synthetic", "gemini-3.5-flash", { thinking: "low" });
  await provider.generateJSON("synthetic", "gemini-3.5-flash", { thinking: "low" });
  await provider.generateText("synthetic", "gemini-3.5-flash");
  const configs = mockGetModel.mock.calls.map(
    (call) =>
      (call as unknown as [{ generationConfig: Record<string, unknown> }])[0].generationConfig
  );
  expect(configs[0]).toMatchObject({ thinkingConfig: { thinkingLevel: "low" } });
  expect(configs[1]).toMatchObject({
    responseMimeType: "application/json",
    thinkingConfig: { thinkingLevel: "low" },
  });
  expect(configs[2]).not.toHaveProperty("thinkingConfig");
});
it("limits Anthropic SDK retries when the caller bounds the attempts", async () => {
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "answer" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  await new AnthropicProviderImpl("key").generateText("q", "claude-sonnet-4-6", {
    timeoutMs: 40_000,
    maxAttempts: 1,
    thinking: "low",
  });
  expect(mockAnthropicCreate).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ thinking: expect.anything() }),
    { timeout: 40_000, maxRetries: 0 }
  );
});
it("applies a Gemini thinking level and budget given through providerOverrides", async () => {
  mockGenerateContent.mockResolvedValue({ response: { text: () => "answer" } });
  await new GeminiProviderImpl("key").generateText("synthetic", "gemini-3.5-flash", {
    maxTokens: 2_000,
    providerOverrides: { gemini: { maxTokens: 5_000, thinking: "low" } },
  });
  expect(mockGetModel).toHaveBeenLastCalledWith(
    expect.objectContaining({
      generationConfig: expect.objectContaining({
        maxOutputTokens: 5_000,
        thinkingConfig: { thinkingLevel: "low" },
      }),
    })
  );
});
