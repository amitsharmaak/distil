/**
 * AI task and model configuration.
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
  "summarize-complex": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  prioritize: { provider: "openai", model: "gpt-4o-mini" },
  "research-plan": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "research-search": { provider: "gemini", model: "gemini-3-flash-preview" },
  "research-synthesize": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "research-gaps": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "preference-analysis": { provider: "openai", model: "gpt-4o-mini" },
  "auto-tag": { provider: "openai", model: "gpt-4o-mini" },
  "dedup-check": { provider: "gemini", model: "	gemini-3.1-flash-lite-preview" },
};

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
    summarize: "claude-haiku-3-5",
    "summarize-complex": "claude-sonnet-4-20250514",
    prioritize: "claude-haiku-3-5",
    "research-plan": "claude-sonnet-4-20250514",
    "research-search": "claude-haiku-3-5",
    "research-synthesize": "claude-sonnet-4-20250514",
    "research-gaps": "claude-sonnet-4-20250514",
    "preference-analysis": "claude-haiku-3-5",
    "auto-tag": "claude-haiku-3-5",
    "dedup-check": "claude-haiku-3-5",
  },
};
