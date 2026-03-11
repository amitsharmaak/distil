/**
 * AI model router — selects the best provider + model for each task.
 * Uses globalThis singleton pattern for hot-reload safety.
 * SERVER-SIDE ONLY.
 */

import type { AIProvider, GenerateOptions } from "./providers";
import { createProviders } from "./providers";
import type { GeminiProvider } from "./providers";
import type { AITask, ProviderName, ModelAssignment } from "./ai-config";
import {
  DEFAULT_MODEL_CONFIG,
  PROVIDER_FALLBACK_MODELS,
} from "./ai-config";
import { aiLogger } from "@/lib/logger";
import { getTraceId } from "@/lib/middleware/trace";

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

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-3-flash-preview": { input: 0.15, output: 0.6 },
  "gemini-2.5-flash-lite": { input: 0.075, output: 0.3 },
  "gemini-3.1-flash-lite-preview": { input: 0.075, output: 0.3 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-3-5": { input: 0.8, output: 4.0 },
};

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

const DEFAULT_DAILY_BUDGET = 5;
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

class AIRouter {
  private readonly providers: Map<ProviderName, AIProvider>;

  constructor() {
    this.providers = createProviders();
  }

  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

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
      "No AI providers available. Configure at least one of GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.",
    );
  }

  private getProvider(name: ProviderName): AIProvider {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(`Provider ${name} is not available`);
    }
    return p;
  }

  private checkBudget(): void {
    const budgetStr = process.env.DISTIL_DAILY_AI_BUDGET;
    if (!budgetStr) return;
    const budget = parseFloat(budgetStr) || DEFAULT_DAILY_BUDGET;
    if (Number.isNaN(budget) || budget <= 0) return;
    const tracker = getUsageTrackerInstance();
    const dailyTotal = tracker.getDailyTotal();
    if (dailyTotal >= budget) {
      throw new Error(
        `Daily AI budget exceeded ($${dailyTotal.toFixed(2)} >= $${budget.toFixed(2)}). Set DISTIL_DAILY_AI_BUDGET to increase or disable.`,
      );
    }
    if (dailyTotal >= budget * BUDGET_WARN_THRESHOLD) {
      aiLogger.warn(
        { dailyTotal, budget, threshold: BUDGET_WARN_THRESHOLD },
        "Approaching daily AI budget limit",
      );
    }
  }

  async generateText(
    prompt: string,
    task: AITask,
    options?: GenerateOptions,
  ): Promise<string> {
    const { provider, model } = this.getEffectiveModel(task);
    const traceId = getTraceId();
    const tokensIn = estimateTokens(prompt);
    const start = Date.now();

    this.checkBudget();

    const p = this.getProvider(provider);
    const result = await p.generateText(prompt, model, options);

    const latencyMs = Date.now() - start;
    const tokensOut = estimateTokens(result);
    const costEstimate = estimateCost(model, tokensIn, tokensOut);

    getUsageTrackerInstance().record({
      task,
      provider,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      latency_ms: latencyMs,
      cost_estimate: costEstimate,
    });

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
      "AI call completed",
    );

    return result;
  }

  async generateJSON<T>(
    prompt: string,
    task: AITask,
    options?: GenerateOptions,
  ): Promise<T> {
    const { provider, model } = this.getEffectiveModel(task);
    const traceId = getTraceId();
    const tokensIn = estimateTokens(prompt);
    const start = Date.now();

    this.checkBudget();

    const p = this.getProvider(provider);
    const result = await p.generateJSON<T>(prompt, model, options);

    const latencyMs = Date.now() - start;
    const resultStr = JSON.stringify(result);
    const tokensOut = estimateTokens(resultStr);
    const costEstimate = estimateCost(model, tokensIn, tokensOut);

    getUsageTrackerInstance().record({
      task,
      provider,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      latency_ms: latencyMs,
      cost_estimate: costEstimate,
    });

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
      "AI call completed",
    );

    return result;
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

      const result = await (gemini as GeminiProvider).generateTextWithSearch(
        prompt,
      );

      const latencyMs = Date.now() - start;
      const tokensOut = estimateTokens(result);
      const costEstimate = estimateCost(model, tokensIn, tokensOut);

      getUsageTrackerInstance().record({
        task,
        provider,
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        latency_ms: latencyMs,
        cost_estimate: costEstimate,
      });

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
        "AI call completed",
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
  options?: GenerateOptions,
): Promise<string> {
  return _getRouter().generateText(prompt, task, options);
}

/**
 * Generate JSON for a task. Routes to the best available provider.
 */
export async function generateJSON<T>(
  prompt: string,
  task: AITask,
  options?: GenerateOptions,
): Promise<T> {
  return _getRouter().generateJSON<T>(prompt, task, options);
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
