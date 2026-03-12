/**
 * AI task and model configuration — single source of truth.
 * Edit this file to change which model handles each task, swap providers,
 * adjust fallbacks, or update per-model cost rates.
 * SERVER-SIDE ONLY.
 */

/** All AI task types in the application. */
export type AITask =
  | "summarize"
  | "summarize-complex"
  | "prioritize"
  | "research-plan"
  | "research-search"
  | "research-synthesize"
  | "research-gaps"
  | "preference-analysis"
  | "auto-tag"
  | "dedup-check";

export type ProviderName = "gemini" | "openai" | "anthropic";

export interface ModelAssignment {
  provider: ProviderName;
  model: string;
}

/** Optimal model for each task when all providers are available. */
export const DEFAULT_MODEL_CONFIG: Record<AITask, ModelAssignment> = {
  summarize: { provider: "gemini", model: "gemini-3-flash-preview" },
  "summarize-complex": { provider: "anthropic", model: "claude-sonnet-4-6" },
  prioritize: { provider: "openai", model: "gpt-4o-mini" },
  "research-plan": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "research-search": { provider: "gemini", model: "gemini-3-flash-preview" },
  "research-synthesize": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "research-gaps": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "preference-analysis": { provider: "openai", model: "gpt-4o-mini" },
  "auto-tag": { provider: "openai", model: "gpt-4o-mini" },
  "dedup-check": { provider: "gemini", model: "gemini-3.1-flash-lite-preview" },
};

/**
 * Cost per 1 million tokens (USD) for each model.
 * Used by the router to estimate per-call spend and enforce the daily budget.
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-3-flash-preview": { input: 0.15, output: 0.6 },
  "gemini-2.5-flash-lite": { input: 0.075, output: 0.3 },
  "gemini-3.1-flash-lite-preview": { input: 0.075, output: 0.3 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-3-5": { input: 0.8, output: 4.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

/**
 * Gemini model used for web-search-grounded generation.
 * Must support the googleSearch tool (Gemini 2.x+; Gemini 3 Flash also supported).
 */
export const GEMINI_SEARCH_MODEL = "gemini-3-flash-preview";

/** Best model for each task when only ONE provider is available. */
export const PROVIDER_FALLBACK_MODELS: Record<
  ProviderName,
  Record<AITask, string>
> = {
  gemini: {
    summarize: "gemini-2.5-flash",
    "summarize-complex": "gemini-2.5-flash",
    prioritize: "gemini-2.5-flash",
    "research-plan": "gemini-2.5-flash",
    "research-search": "gemini-2.5-flash",
    "research-synthesize": "gemini-2.5-flash",
    "research-gaps": "gemini-2.5-flash",
    "preference-analysis": "gemini-2.5-flash-lite",
    "auto-tag": "gemini-2.5-flash-lite",
    "dedup-check": "gemini-2.5-flash-lite",
  },
  openai: {
    summarize: "gpt-4o-mini",
    "summarize-complex": "gpt-4o",
    prioritize: "gpt-4o-mini",
    "research-plan": "gpt-4o",
    "research-search": "gpt-4o-mini",
    "research-synthesize": "gpt-4o",
    "research-gaps": "gpt-4o",
    "preference-analysis": "gpt-4o-mini",
    "auto-tag": "gpt-4o-mini",
    "dedup-check": "gpt-4o-mini",
  },
  anthropic: {
    summarize: "claude-haiku-4-5",
    "summarize-complex": "claude-sonnet-4-6",
    prioritize: "claude-haiku-4-5",
    "research-plan": "claude-sonnet-4-6",
    "research-search": "claude-haiku-4-5",
    "research-synthesize": "claude-sonnet-4-6",
    "research-gaps": "claude-sonnet-4-6",
    "preference-analysis": "claude-haiku-4-5",
    "auto-tag": "claude-haiku-4-5",
    "dedup-check": "claude-haiku-4-5",
  },
};
