export const VALID_AI_SUMMARY = {
  overview: "The article explains durable personal capture.",
  keyPoints: ["Persist a capture before publishing work.", "Make retries idempotent."],
  whyItMatters: "A saved URL should survive transient infrastructure failures.",
};

export const VALID_AI_JSON = JSON.stringify(VALID_AI_SUMMARY);

export const MALFORMED_AI_JSON = '{"overview":"The response is truncated","keyPoints":["one"';

export class FakeAIError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status?: number
  ) {
    super(message);
    this.name = "FakeAIError";
  }
}

export function createAITimeoutError(): FakeAIError {
  return new FakeAIError("AI request timed out", "AI_TIMEOUT", true);
}

export function createAIRateLimitError(): FakeAIError {
  return new FakeAIError("AI rate limit exceeded", "AI_RATE_LIMITED", true, 429);
}

export function createAIFailedError(): FakeAIError {
  return new FakeAIError("AI provider failed", "AI_PROVIDER_FAILED", false, 500);
}
