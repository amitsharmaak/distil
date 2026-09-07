/**
 * AI model router — selects the best provider + model for each task.
 * Uses globalThis singleton pattern for hot-reload safety.
 * SERVER-SIDE ONLY.
 */

import { randomUUID } from "crypto";
import type { AIProvider, GenerateOptions } from "./providers";
import { createProviders } from "./providers";
import type { GeminiProvider } from "./providers";
import type { AITask, ProviderName, ModelAssignment } from "./ai-config";
import {
  DEFAULT_MODEL_CONFIG,
  PROVIDER_FALLBACK_MODELS,
  MODEL_COSTS,
  TASK_MODEL_CANDIDATES,
} from "./ai-config";
import { AIProviderError, toAIProviderError } from "./errors";
import { aiLogger } from "@/lib/logger";
import { getTraceId } from "@/lib/middleware/trace";
import { insertAuditLog } from "@/lib/database";

/** Per-call metrics for AI usage. */
export interface UsageMetrics {
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_estimate: number;
  model: string;
  provider: ProviderName;
  task: AITask;
}

/** A generated value plus the provider/model that actually produced it. */
export interface RoutedGeneration<T> {
  value: T;
  provider: ProviderName;
  model: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  const inputCost = (tokensIn / 1_000_000) * costs.input;
  const outputCost = (tokensOut / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

// Applied only when DISTIL_DAILY_AI_BUDGET env var is set. In-process only —
// resets at midnight and does not survive server restarts.
const DEFAULT_DAILY_BUDGET = 5;
// Warn in logs when daily spend reaches this fraction of the budget.
const BUDGET_WARN_THRESHOLD = 0.9;

class AIUsageTracker {
  private dailyTotal = 0;
  private dailyResetDate = this.getDateKey();

  private getDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private maybeReset(): void {
    const today = this.getDateKey();
    if (today !== this.dailyResetDate) {
      this.dailyTotal = 0;
      this.dailyResetDate = today;
    }
  }

  record(metrics: UsageMetrics): void {
    this.maybeReset();
    this.dailyTotal += metrics.cost_estimate;
  }

  getDailyTotal(): number {
    this.maybeReset();
    return this.dailyTotal;
  }
}

const globalForRouter = globalThis as typeof globalThis & {
  __distilAIRouter?: AIRouter;
  __distilAIUsageTracker?: AIUsageTracker;
};

function getUsageTrackerInstance(): AIUsageTracker {
  if (!globalForRouter.__distilAIUsageTracker) {
    globalForRouter.__distilAIUsageTracker = new AIUsageTracker();
  }
  return globalForRouter.__distilAIUsageTracker;
}

export class AIRouter {
  private readonly providers: Map<ProviderName, AIProvider>;

  constructor(providers: Map<ProviderName, AIProvider> = createProviders()) {
    this.providers = providers;
  }

  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  // Returns the preferred provider+model for a task, or falls back to the first
  // available provider when the preferred one isn't configured.
  getEffectiveModel(task: AITask): ModelAssignment {
    const preferred = DEFAULT_MODEL_CONFIG[task];
    if (this.providers.has(preferred.provider)) {
      return preferred;
    }
    for (const provider of this.providers.keys()) {
      return {
        provider,
        model: PROVIDER_FALLBACK_MODELS[provider][task],
      };
    }
    throw new Error(
      "No AI providers available. Configure at least one of GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
    );
  }

  private getProvider(name: ProviderName): AIProvider {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(`Provider ${name} is not available`);
    }
    return p;
  }

  private async persistUsage(
    metrics: UsageMetrics,
    action: string,
    traceId: string | undefined
  ): Promise<void> {
    getUsageTrackerInstance().record(metrics);
    try {
      await insertAuditLog({
        id: randomUUID(),
        action,
        model: metrics.model,
        provider: metrics.provider,
        tokensIn: metrics.tokens_in,
        tokensOut: metrics.tokens_out,
        cost: metrics.cost_estimate,
        latencyMs: metrics.latency_ms,
        traceId: traceId ?? undefined,
      });
    } catch (err) {
      aiLogger.warn({ err }, "Failed to persist AI call to audit_log");
    }
  }

  private checkBudget(): void {
    const budgetStr = process.env.DISTIL_DAILY_AI_BUDGET;
    if (!budgetStr) return;
    const budget = parseFloat(budgetStr) || DEFAULT_DAILY_BUDGET;
    if (Number.isNaN(budget) || budget <= 0) return;
    const tracker = getUsageTrackerInstance();
    const dailyTotal = tracker.getDailyTotal();
    if (dailyTotal >= budget) {
      throw new AIProviderError("budget");
    }
    if (dailyTotal >= budget * BUDGET_WARN_THRESHOLD) {
      aiLogger.warn(
        { dailyTotal, budget, threshold: BUDGET_WARN_THRESHOLD },
        "Approaching daily AI budget limit"
      );
    }
  }

  private getModelCandidates(task: AITask, assignment: ModelAssignment): string[] {
    const configured = TASK_MODEL_CANDIDATES[task]?.[assignment.provider];
    if (!configured?.includes(assignment.model)) return [assignment.model];
    return [assignment.model, ...configured.filter((model) => model !== assignment.model)];
  }

  private async runRoutedGeneration<T>(
    prompt: string,
    task: AITask,
    operation: (provider: AIProvider, model: string) => Promise<T>,
    serialize: (value: T) => string
  ): Promise<RoutedGeneration<T>> {
    const assignment = this.getEffectiveModel(task);
    const provider = this.getProvider(assignment.provider);
    const candidates = this.getModelCandidates(task, assignment);
    const traceId = getTraceId();
    const tokensIn = estimateTokens(prompt);

    this.checkBudget();

    for (let index = 0; index < candidates.length; index++) {
      const model = candidates[index];
      const start = Date.now();
      try {
        const value = await operation(provider, model);
        const latencyMs = Date.now() - start;
        const tokensOut = estimateTokens(serialize(value));
        const costEstimate = estimateCost(model, tokensIn, tokensOut);

        await this.persistUsage(
          {
            task,
            provider: assignment.provider,
            model,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            latency_ms: latencyMs,
            cost_estimate: costEstimate,
          },
          `ai:${task}`,
          traceId
        );

        aiLogger.info(
          {
            traceId,
            task,
            provider: assignment.provider,
            model,
            tokensIn,
            tokensOut,
            latencyMs,
            costEstimate: costEstimate.toFixed(6),
          },
          "AI call completed"
        );

        return { value, provider: assignment.provider, model };
      } catch (error) {
        const normalized = toAIProviderError(error, assignment.provider, model);
        const fallbackModel = candidates[index + 1];
        if (normalized.category === "quota" && fallbackModel) {
          aiLogger.warn(
            {
              traceId,
              task,
              provider: assignment.provider,
              model,
              category: normalized.category,
              attempt: index + 1,
              fallbackModel,
            },
            "summary_model_fallback"
          );
          continue;
        }
        throw normalized;
      }
    }

    // The loop always returns or throws, but retain a typed defensive failure.
    throw new AIProviderError("unknown", assignment.provider);
  }

  async generateText(prompt: string, task: AITask, options?: GenerateOptions): Promise<string> {
    const result = await this.runRoutedGeneration(
      prompt,
      task,
      (provider, model) => provider.generateText(prompt, model, options),
      (value) => value
    );
    return result.value;
  }

  async generateJSON<T>(prompt: string, task: AITask, options?: GenerateOptions): Promise<T> {
    const result = await this.generateJSONWithMetadata<T>(prompt, task, options);
    return result.value;
  }

  async generateJSONWithMetadata<T>(
    prompt: string,
    task: AITask,
    options?: GenerateOptions
  ): Promise<RoutedGeneration<T>> {
    return this.runRoutedGeneration(
      prompt,
      task,
      (provider, model) => provider.generateJSON<T>(prompt, model, options),
      (value) => JSON.stringify(value)
    );
  }

  async generateTextWithSearch(prompt: string): Promise<string> {
    const gemini = this.providers.get("gemini");
    if (gemini && "generateTextWithSearch" in gemini) {
      const task: AITask = "research-search";
      const model =
        DEFAULT_MODEL_CONFIG[task].provider === "gemini"
          ? DEFAULT_MODEL_CONFIG[task].model
          : PROVIDER_FALLBACK_MODELS.gemini[task];
      const provider: ProviderName = "gemini";
      const traceId = getTraceId();
      const tokensIn = estimateTokens(prompt);
      const start = Date.now();

      this.checkBudget();

      const result = await (gemini as GeminiProvider).generateTextWithSearch(prompt);

      const latencyMs = Date.now() - start;
      const tokensOut = estimateTokens(result);
      const costEstimate = estimateCost(model, tokensIn, tokensOut);

      await this.persistUsage(
        {
          task,
          provider,
          model,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          latency_ms: latencyMs,
          cost_estimate: costEstimate,
        },
        `ai:${task}`,
        traceId
      );

      aiLogger.info(
        {
          traceId,
          task,
          provider,
          model,
          tokensIn,
          tokensOut,
          latencyMs,
          costEstimate: costEstimate.toFixed(6),
        },
        "AI call completed"
      );

      return result;
    }
    return this.generateText(prompt, "research-search");
  }
}

/**
 * Generate text for a task. Routes to the best available provider.
 */
export async function generateText(
  prompt: string,
  task: AITask,
  options?: GenerateOptions
): Promise<string> {
  return _getRouter().generateText(prompt, task, options);
}

/**
 * Generate JSON for a task. Routes to the best available provider.
 */
export async function generateJSON<T>(
  prompt: string,
  task: AITask,
  options?: GenerateOptions
): Promise<T> {
  return _getRouter().generateJSON<T>(prompt, task, options);
}

/** Generate structured JSON and report the provider/model that actually succeeded. */
export async function generateJSONWithMetadata<T>(
  prompt: string,
  task: AITask,
  options?: GenerateOptions
): Promise<RoutedGeneration<T>> {
  return _getRouter().generateJSONWithMetadata<T>(prompt, task, options);
}

/**
 * Generate text with web search grounding. Uses Gemini when available;
 * otherwise falls back to regular generateText with research-search task.
 */
export async function generateTextWithSearch(prompt: string): Promise<string> {
  return _getRouter().generateTextWithSearch(prompt);
}

/** Get the singleton router instance. */
export function getRouter(): AIRouter {
  return _getRouter();
}

/** List providers that have API keys configured. */
export function getAvailableProviders(): ProviderName[] {
  return _getRouter().getAvailableProviders();
}

/** Get the effective provider + model for a task. */
export function getEffectiveModel(task: AITask): ModelAssignment {
  return _getRouter().getEffectiveModel(task);
}

/** Get the AI usage tracker singleton. */
export function getUsageTracker(): AIUsageTracker {
  return getUsageTrackerInstance();
}

/** Get daily AI usage total (cost in USD). */
export function getDailyUsage(): number {
  return getUsageTrackerInstance().getDailyTotal();
}

function _getRouter(): AIRouter {
  if (!globalForRouter.__distilAIRouter) {
    globalForRouter.__distilAIRouter = new AIRouter();
  }
  return globalForRouter.__distilAIRouter;
}
