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
import { AnthropicProviderImpl, GeminiProviderImpl, parseGroundingSources } from "../providers";
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
it("returns no sources when the grounded answer carries no grounding metadata", async () => {
  mockGenerateContent.mockResolvedValue({ response: { text: () => "memory notes" } });
  await expect(
    new GeminiProviderImpl("key").generateTextWithSearch("synthetic")
  ).resolves.toMatchObject({ value: "memory notes", sources: [] });
  expect(
    parseGroundingSources({ candidates: [{ groundingMetadata: { groundingChunks: "x" } }] })
  ).toEqual([]);
});
