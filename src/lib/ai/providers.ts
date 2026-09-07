/**
 * AI provider abstractions for Gemini, OpenAI, and Anthropic.
 * SERVER-SIDE ONLY.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ResponseSchema } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import type { ProviderName } from "./ai-config";
import { GEMINI_SEARCH_MODEL } from "./ai-config";
import { withRetry } from "./retry";
import { AIProviderError, toAIProviderError } from "./errors";

// Complex Flash summaries routinely take 5-8 seconds. Keep enough headroom for
// a useful answer while retaining a hard per-attempt bound for the 60s worker.
const GEMINI_REQUEST_TIMEOUT_MS = 8_000;
const PROVIDER_RETRY_OPTIONS = { maxAttempts: 2, baseDelay: 250, maxDelay: 250 } as const;

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  /** Native structured-output schema. Gemini applies it with application/json. */
  responseSchema?: ResponseSchema;
}

export interface AIProvider {
  readonly name: ProviderName;
  generateText(prompt: string, model: string, options?: GenerateOptions): Promise<string>;
  generateJSON<T>(prompt: string, model: string, options?: GenerateOptions): Promise<T>;
}

/** Gemini provider — supports generateTextWithSearch for web grounding. */
export interface GeminiProvider extends AIProvider {
  generateTextWithSearch(prompt: string): Promise<string>;
}

function parseJSON<T>(text: string): T {
  try {
    const trimmed = text.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new AIProviderError("invalid_output");
  }
}

export class GeminiProviderImpl implements GeminiProvider {
  readonly name = "gemini" as const;
  private readonly genai: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genai = new GoogleGenerativeAI(apiKey);
  }

  async generateText(prompt: string, model: string, options?: GenerateOptions): Promise<string> {
    const m = this.genai.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: options?.maxTokens,
        temperature: options?.temperature,
      },
    });
    try {
      const result = await withRetry(
        () => m.generateContent(prompt, { timeout: GEMINI_REQUEST_TIMEOUT_MS }),
        PROVIDER_RETRY_OPTIONS
      );
      const text = result.response.text();
      if (!text.trim()) throw new AIProviderError("invalid_output", this.name, model);
      return text;
    } catch (error) {
      throw toAIProviderError(error, this.name, model);
    }
  }

  async generateJSON<T>(prompt: string, model: string, options?: GenerateOptions): Promise<T> {
    const m = this.genai.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: options?.maxTokens,
        temperature: options?.temperature,
        responseMimeType: "application/json",
        responseSchema: options?.responseSchema,
      },
    });
    try {
      const result = await withRetry(
        () => m.generateContent(prompt, { timeout: GEMINI_REQUEST_TIMEOUT_MS }),
        PROVIDER_RETRY_OPTIONS
      );
      return parseJSON<T>(result.response.text());
    } catch (error) {
      const normalized = toAIProviderError(error, this.name, model);
      if (normalized.category === "invalid_output") {
        throw new AIProviderError("invalid_output", this.name, model);
      }
      throw normalized;
    }
  }

  async generateTextWithSearch(prompt: string): Promise<string> {
    const m = this.genai.getGenerativeModel({
      model: GEMINI_SEARCH_MODEL,
      // googleSearch grounding is supported by Gemini 2.x but not yet in SDK types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    });
    try {
      const result = await withRetry(
        () => m.generateContent(prompt, { timeout: GEMINI_REQUEST_TIMEOUT_MS }),
        PROVIDER_RETRY_OPTIONS
      );
      const text = result.response.text();
      if (!text.trim()) throw new AIProviderError("invalid_output", this.name, GEMINI_SEARCH_MODEL);
      return text;
    } catch (error) {
      throw toAIProviderError(error, this.name, GEMINI_SEARCH_MODEL);
    }
  }
}

export class OpenAIProviderImpl implements AIProvider {
  readonly name = "openai" as const;
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateText(prompt: string, model: string, options?: GenerateOptions): Promise<string> {
    try {
      const completion = await withRetry(
        () =>
          this.client.chat.completions.create({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: options?.maxTokens ?? 4096,
            temperature: options?.temperature,
          }),
        PROVIDER_RETRY_OPTIONS
      );
      const content = completion.choices[0]?.message?.content;
      if (!content?.trim()) {
        throw new AIProviderError("invalid_output", this.name, model);
      }
      return content;
    } catch (error) {
      throw toAIProviderError(error, this.name, model);
    }
  }

  async generateJSON<T>(prompt: string, model: string, options?: GenerateOptions): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond with valid JSON only, no other text.`;
    const text = await this.generateText(jsonPrompt, model, options);
    return parseJSON<T>(text);
  }
}

export class AnthropicProviderImpl implements AIProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateText(prompt: string, model: string, options?: GenerateOptions): Promise<string> {
    try {
      const message = await withRetry(
        () =>
          this.client.messages.create({
            model,
            max_tokens: options?.maxTokens ?? 4096,
            temperature: options?.temperature,
            messages: [{ role: "user", content: prompt }],
          }),
        PROVIDER_RETRY_OPTIONS
      );
      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock?.text.trim()) {
        throw new AIProviderError("invalid_output", this.name, model);
      }
      return textBlock.text;
    } catch (error) {
      throw toAIProviderError(error, this.name, model);
    }
  }

  async generateJSON<T>(prompt: string, model: string, options?: GenerateOptions): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond with valid JSON only, no other text.`;
    const text = await this.generateText(jsonPrompt, model, options);
    return parseJSON<T>(text);
  }
}

/** Factory: instantiate providers that have API keys configured. */
export function createProviders(): Map<ProviderName, AIProvider> {
  const map = new Map<ProviderName, AIProvider>();

  if (config.geminiApiKey) {
    map.set("gemini", new GeminiProviderImpl(config.geminiApiKey));
  }
  if (config.openaiApiKey) {
    map.set("openai", new OpenAIProviderImpl(config.openaiApiKey));
  }
  if (config.anthropicApiKey) {
    map.set("anthropic", new AnthropicProviderImpl(config.anthropicApiKey));
  }

  return map;
}
