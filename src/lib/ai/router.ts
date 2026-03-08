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

const globalForRouter = globalThis as typeof globalThis & {
  __piaAIRouter?: AIRouter;
};

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

  async generateText(
    prompt: string,
    task: AITask,
    options?: GenerateOptions,
  ): Promise<string> {
    const { provider, model } = this.getEffectiveModel(task);
    const p = this.getProvider(provider);
    return p.generateText(prompt, model, options);
  }

  async generateJSON<T>(
    prompt: string,
    task: AITask,
    options?: GenerateOptions,
  ): Promise<T> {
    const { provider, model } = this.getEffectiveModel(task);
    const p = this.getProvider(provider);
    return p.generateJSON<T>(prompt, model, options);
  }

  async generateTextWithSearch(prompt: string): Promise<string> {
    const gemini = this.providers.get("gemini");
    if (gemini && "generateTextWithSearch" in gemini) {
      return (gemini as GeminiProvider).generateTextWithSearch(prompt);
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

function _getRouter(): AIRouter {
  if (!globalForRouter.__piaAIRouter) {
    globalForRouter.__piaAIRouter = new AIRouter();
  }
  return globalForRouter.__piaAIRouter;
}
