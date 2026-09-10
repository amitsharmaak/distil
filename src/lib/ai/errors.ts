/** Sanitized AI failure categories safe to expose to operational logs. */
export type AIProviderFailureCategory =
  | "quota"
  | "timeout"
  | "server"
  | "authentication"
  | "invalid_request"
  | "invalid_output"
  | "budget"
  | "unknown";

const SAFE_MESSAGES: Record<AIProviderFailureCategory, string> = {
  quota: "AI provider quota exhausted",
  timeout: "AI provider request timed out",
  server: "AI provider service unavailable",
  authentication: "AI provider authentication failed",
  invalid_request: "AI provider rejected the request",
  invalid_output: "AI provider returned invalid output",
  budget: "Application AI budget exhausted",
  unknown: "AI provider request failed",
};

/** Typed provider error that deliberately omits raw provider payloads. */
export class AIProviderError extends Error {
  readonly name = "AIProviderError";
  readonly code: string;

  constructor(
    readonly category: AIProviderFailureCategory,
    readonly provider?: string,
    readonly model?: string
  ) {
    super(SAFE_MESSAGES[category]);
    this.code = `AI_${category.toUpperCase()}`;
  }
}

function numericStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : undefined;
}

/** Normalize SDK-specific errors without retaining their potentially sensitive payloads. */
export function classifyProviderFailure(error: unknown): AIProviderFailureCategory {
  if (error instanceof AIProviderError) return error.category;

  const status = numericStatus(error);
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (status === 429 || /\b429\b|rate.?limit|quota|resource.?exhausted/.test(message)) {
    return "quota";
  }
  if (
    /timeout|timed out|aborted|aborterror|econnreset|econnrefused|network|fetch failed/.test(
      message
    )
  ) {
    return "timeout";
  }
  if (
    status === 401 ||
    status === 403 ||
    /unauthori[sz]ed|forbidden|api.?key|authentication/.test(message)
  ) {
    return "authentication";
  }
  if (status !== undefined && status >= 500) return "server";
  if (/\b50[0234]\b|internal server|service unavailable|bad gateway/.test(message)) {
    return "server";
  }
  if (status !== undefined && status >= 400) return "invalid_request";
  if (/bad request|invalid argument|malformed request|not found/.test(message)) {
    return "invalid_request";
  }
  return "unknown";
}

export function toAIProviderError(
  error: unknown,
  provider?: string,
  model?: string
): AIProviderError {
  if (error instanceof AIProviderError) return error;
  return new AIProviderError(classifyProviderFailure(error), provider, model);
}

export function isRetryableProviderFailure(error: unknown): boolean {
  const category = classifyProviderFailure(error);
  return category === "timeout" || category === "server";
}
