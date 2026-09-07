import { AIProviderError, classifyProviderFailure, toAIProviderError } from "../errors";

describe("AI provider failure classification", () => {
  it.each<[unknown, string]>([
    [Object.assign(new Error("resource exhausted"), { status: 429 }), "quota"],
    [new Error("request timeout"), "timeout"],
    [Object.assign(new Error("unavailable"), { status: 503 }), "server"],
    [Object.assign(new Error("gateway"), { statusCode: 502 }), "server"],
    [Object.assign(new Error("denied"), { status: 401 }), "authentication"],
    [Object.assign(new Error("bad request"), { status: 400 }), "invalid_request"],
    [new AIProviderError("invalid_output"), "invalid_output"],
    [new AIProviderError("budget"), "budget"],
    [new Error("unexpected failure"), "unknown"],
    [null, "unknown"],
  ])("classifies without exposing provider details", (error, category) => {
    expect(classifyProviderFailure(error)).toBe(category);
    expect(toAIProviderError(error).message).not.toContain("resource exhausted");
    expect(toAIProviderError(error).message).not.toContain("unexpected failure");
  });
});
