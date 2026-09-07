/**
 * Opt-in live connection tests.
 *
 * Verifies that every external service key in .env.test.local is valid,
 * has sufficient permissions, and can return data.
 *
 * Run with:
 *   npx jest connections.live.test.ts --testTimeout=30000 --verbose
 *
 * Keys that are commented-out in .env.test.local are automatically skipped.
 */

import * as fs from "fs";
import * as path from "path";
import { DEFAULT_MODEL_CONFIG } from "@/lib/ai/ai-config";

// ---------------------------------------------------------------------------
// Load .env.test.local before any SDK is imported
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    // Don't override values already set in the real environment
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.test.local"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function skip(name: string, reason: string) {
  test.skip(`${name} — SKIPPED: ${reason}`, () => {});
}

// ---------------------------------------------------------------------------
// 1. Slack
// ---------------------------------------------------------------------------
describe("Slack", () => {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelsEnv = process.env.SLACK_CHANNELS ?? "";
  const channels = channelsEnv
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (!token) {
    skip("auth.test()", "SLACK_BOT_TOKEN not set");
    skip("conversations.history", "SLACK_BOT_TOKEN not set");
    return;
  }

  // Lazy import so the SDK is only loaded when the key exists
  let client: import("@slack/web-api").WebClient;
  beforeAll(async () => {
    const { WebClient } = await import("@slack/web-api");
    client = new WebClient(token);
  });

  test("auth.test() — token is valid and bot identity is returned", async () => {
    const res = await client.auth.test();
    expect(res.ok).toBe(true);
    expect(res.team).toBeDefined();
    expect(res.user).toBeDefined();
    console.log(`  ✓ Connected as @${res.user} in workspace "${res.team}"`);
  });

  if (channels.length === 0) {
    skip("conversations.history — fetch messages", "SLACK_CHANNELS not configured");
  } else {
    test.each(channels)("conversations.history — channel %s returns messages", async (channel) => {
      const res = await client.conversations.history({
        channel,
        limit: 5,
      });
      expect(res.ok).toBe(true);
      // messages array exists (may be empty if channel is quiet)
      expect(Array.isArray(res.messages)).toBe(true);
      console.log(`  ✓ Channel ${channel}: fetched ${res.messages!.length} message(s)`);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Gemini
// ---------------------------------------------------------------------------
describe("Gemini", () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const summaryAssignment = DEFAULT_MODEL_CONFIG.summarize;

  if (!apiKey) {
    skip("structured summary generation", "GEMINI_API_KEY not set");
    return;
  }

  test("configured summary model returns native structured JSON", async () => {
    expect(summaryAssignment.provider).toBe("gemini");

    const { GoogleGenerativeAI, SchemaType } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: summaryAssignment.model,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            overview: { type: SchemaType.STRING },
            keyPoints: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              minItems: 3,
              maxItems: 5,
            },
          },
          required: ["overview", "keyPoints"],
        },
      },
    });

    const result = await model.generateContent(
      "Summarize this source in two sentences and give exactly three key points: " +
        "Distil saves articles for later reading. It creates concise summaries so readers can " +
        "decide what deserves their attention. Return only the requested structured response."
    );
    const parsed: unknown = JSON.parse(result.response.text());

    expect(parsed).toEqual({
      overview: expect.any(String),
      keyPoints: expect.any(Array),
    });

    const summary = parsed as { overview: string; keyPoints: string[] };
    expect(summary.overview.trim().length).toBeGreaterThan(0);
    expect(summary.keyPoints).toHaveLength(3);
    expect(
      summary.keyPoints.every((point) => typeof point === "string" && point.trim().length > 0)
    ).toBe(true);
    console.log(`  ✓ Gemini structured JSON validated for ${summaryAssignment.model}`);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 3. OpenAI
// ---------------------------------------------------------------------------
describe("OpenAI", () => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    skip("chat.completions.create", "OPENAI_API_KEY not set or commented out");
    return;
  }

  test("chat.completions.create — model responds to a simple prompt", async () => {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: 'Reply with exactly "pong".' }],
      max_tokens: 10,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    expect(text.length).toBeGreaterThan(0);
    console.log(`  ✓ OpenAI response: "${text}"`);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 4. Anthropic
// ---------------------------------------------------------------------------
describe("Anthropic", () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    skip("messages.create", "ANTHROPIC_API_KEY not set or commented out");
    return;
  }

  test("messages.create — model responds to a simple prompt", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16,
      messages: [{ role: "user", content: 'Reply with exactly "pong".' }],
    });

    const text = (message.content[0] as { text: string })?.text?.trim() ?? "";
    expect(text.length).toBeGreaterThan(0);
    console.log(`  ✓ Anthropic response: "${text}"`);
  }, 30_000);
});
