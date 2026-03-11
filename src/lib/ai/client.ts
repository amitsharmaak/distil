/**
 * Google Gemini SDK singleton — shared AI client.
 *
 * Uses the same globalThis pattern as db.ts for hot-reload safety.
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "@/lib/config";

const globalForGenAI = globalThis as typeof globalThis & {
  __distilGenAI?: GoogleGenerativeAI;
};

const genai: GoogleGenerativeAI =
  globalForGenAI.__distilGenAI ?? new GoogleGenerativeAI(config.geminiApiKey);

if (config.env !== "production") {
  globalForGenAI.__distilGenAI = genai;
}

/** Primary model for summaries, research, and prioritization. */
export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Cheap/fast model for lightweight tasks like preference analysis. */
export const FAST_MODEL = "gemini-2.5-flash-lite";

/**
 * Generate text from a prompt using Gemini.
 * No web search — for summarization, prioritization, and preference analysis.
 */
export async function generateText(
  prompt: string,
  model = DEFAULT_MODEL,
): Promise<string> {
  const m = genai.getGenerativeModel({ model });
  const result = await m.generateContent(prompt);
  return result.response.text();
}

/**
 * Generate text with Google Search grounding enabled.
 * Used for deep research — the model automatically searches the web.
 */
export async function generateTextWithSearch(prompt: string): Promise<string> {
  const m = genai.getGenerativeModel({
    model: DEFAULT_MODEL,
    // googleSearch grounding is supported by Gemini 2.x but not yet in SDK types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ googleSearch: {} } as any],
  });
  const result = await m.generateContent(prompt);
  return result.response.text();
}
