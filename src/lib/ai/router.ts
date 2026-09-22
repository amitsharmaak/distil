/**
 * AI model router — selects the best provider + model for each task.
 * Uses globalThis singleton pattern for hot-reload safety.
 * SERVER-SIDE ONLY.
 */

import { randomUUID } from "crypto";
import { toAIProviderError } from "./errors";
import type { AIProvider, GenerateOptions, ProviderResult, ProviderUsage } from "./providers";
import { createProviders } from "./providers";
import type { GeminiProvider } from "./providers";
import type { AITask, ProviderName, ModelAssignment } from "./ai-config";
import {
  DEFAULT_MODEL_CONFIG,
  GEMINI_SEARCH_MODEL,
  GEMINI_SUMMARY_FALLBACK_MODEL,
  PROVIDER_FALLBACK_MODELS,
  MODEL_COSTS,
} from "./ai-config";
import { aiLogger } from "@/lib/logger";
import { getTraceId } from "@/lib/middleware/trace";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";
import { scheduleAIAfterResponse } from "./after-response";

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

function measuredUsage(usage: ProviderUsage, prompt: string, output: string): ProviderUsage {
  return {
    inputTokens: usage.inputTokens || estimateTokens(prompt),
    outputTokens: usage.outputTokens || estimateTokens(output),
  };
}

// Applied only when DISTIL_DAILY_AI_BUDGET env var is set. In-process only —
// resets at midnight and does not survive server restarts.
const DEFAULT_DAILY_BUDGET = 5;
// Warn in logs when daily spend reaches this fraction of the budget.
const BUDGET_WARN_THRESHOLD = 0.9;
const ROLLING_WINDOW_DAYS = 30;

export class AIQuotaExceededError extends Error {
  readonly code = "AI_BUDGET";
  constructor(readonly window: "daily" | "rolling") {
    super(`The ${window} AI budget is exhausted`);
    this.name = "AIQuotaExceededError";
  }
}

function configuredBudget(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function assertTenantAIBudget(
  repositories: RepositorySet,
  now = new Date()
): Promise<void> {
  const reservation = await repositories.lifecycle.consumeUsage({
    date: now.toISOString().slice(0, 10),
    operation: "ai.requests",
    requestCount: 1,
  });
  if (!reservation.allowed) throw new AIQuotaExceededError("daily");
  const dailyBudget = configuredBudget("DISTIL_DAILY_AI_BUDGET");
  const rollingBudget = configuredBudget("DISTIL_ROLLING_30D_AI_BUDGET");
  const [daily, rolling] = await Promise.all([
    dailyBudget ? repositories.agent.getDailyAuditStats() : undefined,
    rollingBudget
      ? repositories.agent.getAuditStatsSince(
          new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000).toISOString()
        )
      : undefined,
  ]);
  if (dailyBudget && daily && daily.totalCost >= dailyBudget) {
    throw new AIQuotaExceededError("daily");
  }
  if (rollingBudget && rolling && rolling.totalCost >= rollingBudget) {
    throw new AIQuotaExceededError("rolling");
  }
}

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
    // Unscoped callers deliberately receive in-memory accounting only. Durable
    // audit records are written exclusively by the tenant-bound facade below.
    aiLogger.debug({ action, traceId }, "Skipped unscoped AI audit persistence");
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
        `Daily AI budget exceeded ($${dailyTotal.toFixed(2)} >= $${budget.toFixed(2)}). Set DISTIL_DAILY_AI_BUDGET to increase or disable.`
      );
    }
    if (dailyTotal >= budget * BUDGET_WARN_THRESHOLD) {
      aiLogger.warn(
        { dailyTotal, budget, threshold: BUDGET_WARN_THRESHOLD },
        "Approaching daily AI budget limit"
      );
    }
  }

  async generateText(prompt: string, task: AITask, options?: GenerateOptions): Promise<string> {
    const { provider, model } = this.getEffectiveModel(task);
    const traceId = getTraceId();
    const start = Date.now();

    this.checkBudget();

    const p = this.getProvider(provider);
    const result = await p.generateText(prompt, model, options);

    const latencyMs = Date.now() - start;
    const { inputTokens: tokensIn, outputTokens: tokensOut } = measuredUsage(
      result.usage,
      prompt,
      result.value
    );
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

    return result.value;
  }

  async generateTenantText(
    context: AuthContext,
    repositories: RepositorySet,
    prompt: string,
    task: AITask,
    options?: GenerateOptions
  ): Promise<string> {
    const tenant = parseAuthContext(context);
    await assertTenantAIBudget(repositories);
    const { provider, model } = this.getEffectiveModel(task);
    const start = Date.now();
    const result = await this.getProvider(provider).generateText(prompt, model, options);
    this.accountTenantText(tenant, repositories, { task, provider, model, prompt, result, start });
    return result.value;
  }

  /**
   * Search-grounded text for the research stages. Mirrors `generateTenantText`
   * (tenant admission, deferred audit and usage accounting) but calls the
   * Gemini grounded path on `GEMINI_SEARCH_MODEL`; without a Gemini provider it
   * degrades to the plain `research-search` routing so research still runs.
   */
  async generateTenantTextWithSearch(
    context: AuthContext,
    repositories: RepositorySet,
    prompt: string,
    options?: GenerateOptions
  ): Promise<string> {
    const task: AITask = "research-search";
    const gemini = this.providers.get("gemini");
    if (!gemini || !("generateTextWithSearch" in gemini)) {
      return this.generateTenantText(context, repositories, prompt, task, options);
    }
    const tenant = parseAuthContext(context);
    await assertTenantAIBudget(repositories);
    const provider: ProviderName = "gemini";
    const model = GEMINI_SEARCH_MODEL;
    const start = Date.now();
    let result: ProviderResult<string>;
    try {
      result = await (gemini as GeminiProvider).generateTextWithSearch(prompt, options);
    } catch (error) {
      const failure = toAIProviderError(error, provider, model);
      // Google Search grounding is a separately entitled quota; a key whose
      // project lacks it is refused with 429 on every grounded call. Keep the
      // research usable from model memory rather than failing every search
      // stage. Timeouts and server errors propagate so the stage is retried.
      if (failure.category !== "quota") throw failure;
      aiLogger.warn(
        {
          event: "research_search_grounding_fallback",
          provider,
          model,
          errorCode: failure.code,
          traceId: tenant.requestId,
        },
        "Search grounding refused; using plain research-search routing"
      );
      return this.generateTenantText(context, repositories, prompt, task, options);
    }
    this.accountTenantText(tenant, repositories, { task, provider, model, prompt, result, start });
    return result.value;
  }

  private accountTenantText(
    tenant: AuthContext,
    repositories: RepositorySet,
    call: {
      task: AITask;
      provider: ProviderName;
      model: string;
      prompt: string;
      result: ProviderResult<string>;
      start: number;
    }
  ): void {
    const { task, provider, model, prompt, result, start } = call;
    const usage = measuredUsage(result.usage, prompt, result.value);
    const metrics: UsageMetrics = {
      task,
      provider,
      model,
      tokens_in: usage.inputTokens,
      tokens_out: usage.outputTokens,
      latency_ms: Date.now() - start,
      cost_estimate: estimateCost(model, usage.inputTokens, usage.outputTokens),
    };
    scheduleAIAfterResponse(async () => {
      await Promise.all([
        repositories.agent.insertAuditLog({
          id: randomUUID(),
          action: `ai:${task}`,
          model,
          provider,
          tokensIn: metrics.tokens_in,
          tokensOut: metrics.tokens_out,
          cost: metrics.cost_estimate,
          latencyMs: metrics.latency_ms,
          traceId: tenant.requestId,
        }),
        repositories.lifecycle.consumeUsage({
          date: new Date().toISOString().slice(0, 10),
          operation: "ai.usage",
          provider,
          inputTokens: metrics.tokens_in,
          outputTokens: metrics.tokens_out,
          costMicrousd: Math.round(metrics.cost_estimate * 1_000_000),
        }),
      ]);
    });
  }

  async generateJSON<T>(prompt: string, task: AITask, options?: GenerateOptions): Promise<T> {
    const { provider, model } = this.getEffectiveModel(task);
    const traceId = getTraceId();
    const start = Date.now();

    this.checkBudget();

    const p = this.getProvider(provider);
    const result = await p.generateJSON<T>(prompt, model, options);

    const latencyMs = Date.now() - start;
    const resultStr = JSON.stringify(result.value);
    const { inputTokens: tokensIn, outputTokens: tokensOut } = measuredUsage(
      result.usage,
      prompt,
      resultStr
    );
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

    return result.value;
  }

  async generateTenantJSON<T>(
    context: AuthContext,
    repositories: RepositorySet,
    prompt: string,
    task: AITask,
    options?: GenerateOptions
  ): Promise<T> {
    return (
      await this.generateTenantJSONWithMetadata<T>(context, repositories, prompt, task, options)
    ).value;
  }

  async generateTenantJSONWithMetadata<T>(
    context: AuthContext,
    repositories: RepositorySet,
    prompt: string,
    task: AITask,
    options?: GenerateOptions
  ): Promise<{ value: T; model: string; provider: ProviderName }> {
    const tenant = parseAuthContext(context);
    await assertTenantAIBudget(repositories);
    const assignment = this.getEffectiveModel(task);
    const provider = assignment.provider;
    let model = assignment.model;
    const start = Date.now();
    let result: ProviderResult<T>;
    try {
      result = await this.getProvider(provider).generateJSON<T>(prompt, model, options);
    } catch (error) {
      const failure = toAIProviderError(error, provider, model);
      // Recover from model-specific availability failures without switching provider accounts.
      if (
        !["quota", "timeout", "server"].includes(failure.category) ||
        provider !== "gemini" ||
        !["summarize", "summarize-complex"].includes(task) ||
        model === GEMINI_SUMMARY_FALLBACK_MODEL
      ) {
        throw failure;
      }
      aiLogger.warn(
        {
          event: "summary_model_fallback",
          provider,
          model,
          errorCode: failure.code,
          traceId: tenant.requestId,
        },
        "Summary model quota fallback"
      );
      // The fallback must pass tenant admission independently.
      await assertTenantAIBudget(repositories);
      model = GEMINI_SUMMARY_FALLBACK_MODEL;
      try {
        result = await this.getProvider(provider).generateJSON<T>(prompt, model, options);
      } catch (fallbackError) {
        throw toAIProviderError(fallbackError, provider, model);
      }
    }
    const output = JSON.stringify(result.value);
    const usage = measuredUsage(result.usage, prompt, output);
    const cost = estimateCost(model, usage.inputTokens, usage.outputTokens);
    const latencyMs = Date.now() - start;
    scheduleAIAfterResponse(async () => {
      await Promise.all([
        repositories.agent.insertAuditLog({
          id: randomUUID(),
          action: `ai:${task}`,
          model,
          provider,
          tokensIn: usage.inputTokens,
          tokensOut: usage.outputTokens,
          cost,
          latencyMs,
          traceId: tenant.requestId,
        }),
        repositories.lifecycle.consumeUsage({
          date: new Date().toISOString().slice(0, 10),
          operation: "ai.usage",
          provider,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costMicrousd: Math.round(cost * 1_000_000),
        }),
      ]);
    });
    return { value: result.value, model, provider };
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
      const start = Date.now();

      this.checkBudget();

      const result = await (gemini as GeminiProvider).generateTextWithSearch(prompt);

      const latencyMs = Date.now() - start;
      const usage = measuredUsage(result.usage, prompt, result.value);
      const tokensOut = usage.outputTokens;
      const measuredTokensIn = usage.inputTokens;
      const costEstimate = estimateCost(model, measuredTokensIn, tokensOut);

      await this.persistUsage(
        {
          task,
          provider,
          model,
          tokens_in: measuredTokensIn,
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
          tokensIn: measuredTokensIn,
          tokensOut,
          latencyMs,
          costEstimate: costEstimate.toFixed(6),
        },
        "AI call completed"
      );

      return result.value;
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

/** Tenant-bound provider facade. It carries no user content in global state. */
export function createTenantAIRouter(context: AuthContext, repositories: RepositorySet) {
  const tenant = parseAuthContext(context);
  return Object.freeze({
    generateText(prompt: string, task: AITask, options?: GenerateOptions) {
      return _getRouter().generateTenantText(tenant, repositories, prompt, task, options);
    },
    generateJSON<T>(prompt: string, task: AITask, options?: GenerateOptions) {
      return _getRouter().generateTenantJSON<T>(tenant, repositories, prompt, task, options);
    },
    generateTextWithSearch(prompt: string, options?: GenerateOptions) {
      return _getRouter().generateTenantTextWithSearch(tenant, repositories, prompt, options);
    },
    generateJSONWithMetadata<T>(prompt: string, task: AITask, options?: GenerateOptions) {
      return _getRouter().generateTenantJSONWithMetadata<T>(
        tenant,
        repositories,
        prompt,
        task,
        options
      );
    },
  });
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
