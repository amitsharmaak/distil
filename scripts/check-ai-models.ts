/**
 * Verifies that every model id referenced by src/lib/ai/ai-config.ts is callable with
 * the API keys in the environment. Read-only: it lists models, it never generates.
 *
 *   npx tsx --env-file=.env.local scripts/check-ai-models.ts
 *
 * Providers without a key are skipped and reported; a referenced id missing from a
 * configured provider's catalogue exits non-zero. Never prints key values.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { listConfiguredModels, type ProviderName } from "../src/lib/ai/ai-config";

const keys: Record<ProviderName, string> = {
  gemini: process.env.GEMINI_API_KEY ?? "",
  openai: process.env.OPENAI_API_KEY ?? "",
  anthropic: process.env.ANTHROPIC_API_KEY ?? "",
};

async function listGeminiModels(apiKey: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken = "";
  do {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    if (!response.ok) {
      throw new Error(`Gemini ListModels failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { models?: { name: string }[]; nextPageToken?: string };
    for (const model of body.models ?? []) ids.add(model.name.replace(/^models\//, ""));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return ids;
}

async function listOpenAIModels(apiKey: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for await (const model of new OpenAI({ apiKey }).models.list()) ids.add(model.id);
  return ids;
}

async function listAnthropicModels(apiKey: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for await (const model of new Anthropic({ apiKey }).models.list({ limit: 1000 })) {
    ids.add(model.id);
  }
  return ids;
}

const listers: Record<ProviderName, (apiKey: string) => Promise<Set<string>>> = {
  gemini: listGeminiModels,
  openai: listOpenAIModels,
  anthropic: listAnthropicModels,
};

async function main(): Promise<void> {
  const configured = listConfiguredModels();
  let failures = 0;
  for (const provider of Object.keys(configured) as ProviderName[]) {
    const wanted = configured[provider];
    if (!keys[provider]) {
      console.log(`${provider}: no API key set, skipped (${wanted.join(", ")})`);
      continue;
    }
    let available: Set<string>;
    try {
      available = await listers[provider](keys[provider]);
    } catch (error) {
      failures += 1;
      console.log(`${provider}: could not list models: ${(error as Error).message}`);
      continue;
    }
    for (const model of wanted) {
      const ok = available.has(model);
      if (!ok) failures += 1;
      console.log(`${provider}: ${ok ? "ok     " : "MISSING"} ${model}`);
    }
  }
  if (failures > 0) {
    console.log(`\n${failures} problem(s). Fix src/lib/ai/ai-config.ts before deploying.`);
    process.exit(1);
  }
  console.log("\nAll configured model ids are callable with the available keys.");
}

void main();
