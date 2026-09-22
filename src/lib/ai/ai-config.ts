/**
 * AI task and model configuration — single source of truth.
 * Edit this file to change which model handles each task, swap providers,
 * adjust fallbacks, or update per-model cost rates.
 * SERVER-SIDE ONLY.
 *
 * Provider policy (2026-09-22): Gemini is the default for every task and the only
 * provider a deployment must configure. Anthropic is an optional upgrade for the two
 * long-form writing tasks; without ANTHROPIC_API_KEY those tasks run on Gemini via
 * PROVIDER_FALLBACK_MODELS with no code change. OpenAI is not assigned to any task;
 * its provider and fallback table remain only so an OpenAI-only key still works.
 * Run `npm run audit:ai-models` to confirm every id below is callable with the
 * configured keys.
 */

/** All AI task types in the application. */
export type AITask =
  | "summarize"
  | "knowledge-answer"
  | "summarize-complex"
  | "prioritize"
  | "research-plan"
  | "research-search"
  | "research-synthesize"
  | "research-gaps"
  | "preference-analysis"
  | "auto-tag";

export type ProviderName = "gemini" | "openai" | "anthropic";

export interface ModelAssignment {
  provider: ProviderName;
  model: string;
}

/** Preferred model for each task; the router falls back per provider when its key is absent. */
export const DEFAULT_MODEL_CONFIG: Record<AITask, ModelAssignment> = {
  summarize: { provider: "gemini", model: "gemini-3.5-flash-lite" },
  "knowledge-answer": { provider: "gemini", model: "gemini-3.5-flash-lite" },
  // Optional Anthropic upgrade: long-form synthesis over many sources.
  "summarize-complex": { provider: "anthropic", model: "claude-sonnet-4-6" },
  prioritize: { provider: "gemini", model: "gemini-3.5-flash-lite" },
  "research-plan": { provider: "gemini", model: "gemini-3.5-flash" },
  "research-search": { provider: "gemini", model: "gemini-3-flash-preview" },
  // Optional Anthropic upgrade: the research report and RAG chat answers.
  "research-synthesize": { provider: "anthropic", model: "claude-sonnet-4-6" },
  "research-gaps": { provider: "gemini", model: "gemini-3.5-flash" },
  "preference-analysis": { provider: "gemini", model: "gemini-3.5-flash-lite" },
  "auto-tag": { provider: "gemini", model: "gemini-3.5-flash-lite" },
};

/**
 * Cost per 1 million tokens (USD) for each model.
 * Used by the router to estimate per-call spend and enforce the daily budget.
 * Every model id referenced in this file must have a row here.
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  // Estimate pending a checked price sheet; only used for budget accounting.
  "gemini-3.5-flash": { input: 0.5, output: 3.0 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3-flash-preview": { input: 0.15, output: 0.6 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

/**
 * Gemini model used for web-search-grounded generation.
 * Must support the googleSearch tool (Gemini 2.x+; Gemini 3 Flash also supported).
 */
export const GEMINI_SEARCH_MODEL = "gemini-3-flash-preview";

/**
 * Same-provider model the router retries a Gemini summary on after a quota, timeout
 * or server failure. Must differ from every Gemini summary assignment above.
 */
export const GEMINI_SUMMARY_FALLBACK_MODEL = "gemini-3.1-flash-lite";

/** Best model for each task when only ONE provider is available. */
export const PROVIDER_FALLBACK_MODELS: Record<ProviderName, Record<AITask, string>> = {
  // gemini-2.5-* is retired ("no longer available to new users", HTTP 404 as of
  // 2026-09-19); every fallback here must be a model the key can still call.
  gemini: {
    summarize: "gemini-3.5-flash-lite",
    "knowledge-answer": "gemini-3.5-flash-lite",
    "summarize-complex": "gemini-3.5-flash",
    prioritize: "gemini-3.5-flash-lite",
    "research-plan": "gemini-3.5-flash",
    "research-search": "gemini-3.5-flash",
    "research-synthesize": "gemini-3.5-flash",
    "research-gaps": "gemini-3.5-flash",
    "preference-analysis": "gemini-3.5-flash-lite",
    "auto-tag": "gemini-3.5-flash-lite",
  },
  openai: {
    summarize: "gpt-4o-mini",
    "knowledge-answer": "gpt-4o-mini",
    "summarize-complex": "gpt-4o",
    prioritize: "gpt-4o-mini",
    "research-plan": "gpt-4o",
    "research-search": "gpt-4o-mini",
    "research-synthesize": "gpt-4o",
    "research-gaps": "gpt-4o",
    "preference-analysis": "gpt-4o-mini",
    "auto-tag": "gpt-4o-mini",
  },
  anthropic: {
    summarize: "claude-haiku-4-5",
    "knowledge-answer": "claude-haiku-4-5",
    "summarize-complex": "claude-sonnet-4-6",
    prioritize: "claude-haiku-4-5",
    "research-plan": "claude-sonnet-4-6",
    "research-search": "claude-haiku-4-5",
    "research-synthesize": "claude-sonnet-4-6",
    "research-gaps": "claude-sonnet-4-6",
    "preference-analysis": "claude-haiku-4-5",
    "auto-tag": "claude-haiku-4-5",
  },
};

/**
 * Every model id this file can route a call to, grouped by provider.
 * Used by `scripts/check-ai-models.ts` and the config invariants test.
 */
export function listConfiguredModels(): Record<ProviderName, string[]> {
  const byProvider: Record<ProviderName, Set<string>> = {
    gemini: new Set([GEMINI_SEARCH_MODEL, GEMINI_SUMMARY_FALLBACK_MODEL]),
    openai: new Set(),
    anthropic: new Set(),
  };
  for (const assignment of Object.values(DEFAULT_MODEL_CONFIG)) {
    byProvider[assignment.provider].add(assignment.model);
  }
  for (const provider of Object.keys(PROVIDER_FALLBACK_MODELS) as ProviderName[]) {
    for (const model of Object.values(PROVIDER_FALLBACK_MODELS[provider])) {
      byProvider[provider].add(model);
    }
  }
  return {
    gemini: [...byProvider.gemini].sort(),
    openai: [...byProvider.openai].sort(),
    anthropic: [...byProvider.anthropic].sort(),
  };
}
