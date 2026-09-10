/**
 * AI provider abstractions for Gemini, OpenAI, and Anthropic.
 * SERVER-SIDE ONLY.
 */

import { GoogleGenerativeAI, type ResponseSchema } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import type { ProviderName } from "./ai-config";
import { GEMINI_SEARCH_MODEL } from "./ai-config";
import { withRetry } from "./retry";
import { AIProviderError, toAIProviderError, isRetryableProviderFailure } from "./errors";

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  responseSchema?: ResponseSchema;
  maxAttempts?: number;
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
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  return JSON.parse(jsonStr) as T;
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
    const result = await m.generateContent(prompt, { timeout: options?.timeoutMs });
    return result.response.text();
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
        () => m.generateContent(prompt, { timeout: options?.timeoutMs ?? 15_000 }),
        {
          maxAttempts: options?.maxAttempts ?? 2,
          baseDelay: 250,
          maxDelay: 250,
          shouldRetry: isRetryableProviderFailure,
        }
      );
      try {
        return parseJSON<T>(result.response.text());
      } catch {
        throw new AIProviderError("invalid_output", this.name, model);
      }
    } catch (error) {
      throw toAIProviderError(error, this.name, model);
    }
  }

  async generateTextWithSearch(prompt: string): Promise<string> {
    const m = this.genai.getGenerativeModel({
      model: GEMINI_SEARCH_MODEL,
      // googleSearch grounding is supported by Gemini 2.x but not yet in SDK types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    });
    const result = await m.generateContent(prompt);
    return result.response.text();
  }
}

export class OpenAIProviderImpl implements AIProvider {
  readonly name = "openai" as const;
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateText(prompt: string, model: string, options?: GenerateOptions): Promise<string> {
    const completion = await this.client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature,
      },
      { timeout: options?.timeoutMs }
    );
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }
    return content;
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
    const message = await this.client.messages.create(
      {
        model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: options?.timeoutMs }
    );
    const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      throw new Error("Anthropic returned empty response");
    }
    return textBlock.text;
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
