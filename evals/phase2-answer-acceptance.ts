import assert from "node:assert/strict";

import { parseAuthContext } from "../src/lib/contracts/tenant-context";
import { createRouterGroundedAnswerGenerator } from "../src/lib/knowledge/answer-generator";
import { createRouterStructuredSummaryGenerator } from "../src/lib/knowledge/intelligence-runtime";
import type { PassageSearchResult, PassageSearchStore } from "../src/lib/knowledge/retrieval";
import { answerFromKnowledge, type AnswerRequest } from "../src/lib/knowledge/service";
import type { RepositorySet } from "../src/lib/repositories/ports";

const context = parseAuthContext({
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
});

function passage(id: string, excerpt: string): PassageSearchResult {
  return {
    itemId: `item-${id}`,
    chunkId: `chunk-${id}`,
    contentVersionId: `version-${id}`,
    title: "Distil release contract",
    url: `https://distil.example/release-contract#${id}`,
    sourceType: "document",
    excerpt,
    excerptStart: 0,
    excerptEnd: excerpt.length,
    score: 1,
    reasons: ["keyword:chunk_text"],
    retrievalMode: "keyword",
    degradation: [],
  };
}

const providerDisabled = passage(
  "provider-disabled",
  "With every AI provider disabled, capture, reader, notes, collections, archive, manual priority, source navigation, and keyword search must remain usable with visible degraded states."
);
const rollback = passage(
  "rollback",
  "Roll back with flags or application deployment while retaining additive migrations and resumable backfill state; do not use destructive down migrations."
);
const rollout = passage(
  "rollout",
  "Every rollout flag remains false until all gates are accepted together at one immutable SHA."
);

function store(results: PassageSearchResult[]): PassageSearchStore {
  return {
    searchKeyword: async () => results,
    listRecent: async () => results,
  };
}

const audits: Array<Record<string, unknown>> = [];
const repositories = {
  lifecycle: {
    consumeUsage: async () => ({ allowed: true }),
  },
  agent: {
    insertAuditLog: async (entry: Record<string, unknown>) => {
      audits.push(entry);
    },
  },
} as unknown as RepositorySet;

const liveCases: Array<{
  id: string;
  request: AnswerRequest;
  passages: PassageSearchResult[];
  requiredTerms: string[];
}> = [
  {
    id: "provider-disabled",
    request: {
      query: "Which capabilities must remain usable when AI providers are disabled?",
      messages: [],
      intent: "specific",
    },
    passages: [providerDisabled],
    requiredTerms: ["capture", "keyword search"],
  },
  {
    id: "rollout-summary",
    request: {
      query: "Briefly summarize the safe rollout and rollback approach.",
      messages: [],
      intent: "general",
    },
    passages: [rollback, rollout],
    requiredTerms: ["flag", "migration"],
  },
];

async function main() {
  assert.ok(process.env.GEMINI_API_KEY, "GEMINI_API_KEY is required for live acceptance");
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DISTIL_DAILY_AI_BUDGET;
  delete process.env.DISTIL_ROLLING_30D_AI_BUDGET;

  const generator = createRouterGroundedAnswerGenerator(context, repositories);
  const results = [];
  for (const testCase of liveCases) {
    const started = performance.now();
    const answer = await answerFromKnowledge({
      context,
      request: testCase.request,
      store: store(testCase.passages),
      generator,
    });
    const latencyMs = Math.round(performance.now() - started);
    assert.equal(answer.status, "ready", `${testCase.id} did not return a generated answer`);
    assert.ok(answer.citations.length > 0, `${testCase.id} returned no validated citation`);
    for (const term of testCase.requiredTerms) {
      assert.match(answer.answer, new RegExp(term, "i"), `${testCase.id} omitted ${term}`);
    }
    assert.ok(latencyMs <= 15_000, `${testCase.id} exceeded the 15-second answer budget`);
    results.push({
      id: testCase.id,
      status: answer.status,
      validatedCitations: answer.citations.length,
      latencyMs,
      requiredTermsPresent: true,
    });
  }

  const abstained = await answerFromKnowledge({
    context,
    request: { query: "What is Amit's favorite restaurant?", messages: [], intent: "specific" },
    store: store([]),
    generator,
  });
  assert.equal(abstained.status, "abstained");
  assert.equal(abstained.citations.length, 0);

  const degraded = await answerFromKnowledge({
    context,
    request: liveCases[0].request,
    store: store([providerDisabled]),
    generator: async () => {
      throw new Error("injected provider outage");
    },
  });
  assert.equal(degraded.status, "degraded");
  assert.ok(degraded.citations.length > 0);

  const summarySource =
    "Distil keeps additive migrations during rollback and resumes bounded backfills from durable checkpoints.";
  const summaryStarted = performance.now();
  const summary = await createRouterStructuredSummaryGenerator(context, repositories).generate(`
Summarize the supplied saved passage using only its text. Return exactly this JSON shape:
{"summary":"string","claims":[{"claim":"string","confidence":0.0,"evidence":[{"chunkId":"summary-chunk","startOffset":0,"endOffset":1,"exactExcerpt":"string"}]}]}
Every evidence span must use JavaScript UTF-16 offsets into the passage and copy exactExcerpt verbatim.
For this acceptance case, cite the complete passage with startOffset 0 and endOffset ${summarySource.length}.

CHUNK summary-chunk (UTF-16 length ${summarySource.length}; valid offsets 0-${summarySource.length})
${summarySource}`);
  const summaryLatencyMs = Math.round(performance.now() - summaryStarted);
  const summaryOutput = summary.output as {
    summary?: unknown;
    claims?: Array<{
      claim?: unknown;
      evidence?: Array<{
        chunkId?: unknown;
        startOffset?: unknown;
        endOffset?: unknown;
        exactExcerpt?: unknown;
      }>;
    }>;
  };
  assert.equal(summary.provider, "gemini");
  assert.equal(summary.model, "gemini-3.5-flash-lite");
  assert.equal(typeof summaryOutput.summary, "string");
  assert.match(String(summaryOutput.summary), /migration|backfill/i);
  assert.ok(Array.isArray(summaryOutput.claims) && summaryOutput.claims.length > 0);
  for (const claim of summaryOutput.claims) {
    assert.ok(Array.isArray(claim.evidence) && claim.evidence.length > 0);
    for (const evidence of claim.evidence) {
      assert.equal(evidence.chunkId, "summary-chunk");
      assert.equal(typeof evidence.startOffset, "number");
      assert.equal(typeof evidence.endOffset, "number");
      assert.equal(typeof evidence.exactExcerpt, "string");
      assert.equal(
        summarySource.slice(Number(evidence.startOffset), Number(evidence.endOffset)),
        evidence.exactExcerpt
      );
    }
  }
  assert.ok(summaryLatencyMs <= 15_000, "grounded summary exceeded the 15-second budget");

  assert.equal(audits.length, liveCases.length + 1);
  const costs = audits.map((audit) => Number(audit.cost));
  assert.ok(costs.every((cost) => Number.isFinite(cost) && cost <= 0.05));
  assert.ok(audits.every((audit) => audit.provider === "gemini"));

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        provider: "gemini",
        cases: results,
        abstention: { status: abstained.status, citations: abstained.citations.length },
        providerOutage: { status: degraded.status, validatedCitations: degraded.citations.length },
        summary: {
          status: "ready",
          validatedClaims: summaryOutput.claims.length,
          latencyMs: summaryLatencyMs,
        },
        cost: {
          maxUsd: Math.max(...costs),
          underPerAnswerLimit: true,
        },
        passed: true,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
