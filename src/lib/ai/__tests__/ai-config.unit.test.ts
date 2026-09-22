import {
  DEFAULT_MODEL_CONFIG,
  GEMINI_SEARCH_MODEL,
  GEMINI_SUMMARY_FALLBACK_MODEL,
  MODEL_COSTS,
  PROVIDER_FALLBACK_MODELS,
  listConfiguredModels,
  type AITask,
} from "../ai-config";

const tasks = Object.keys(DEFAULT_MODEL_CONFIG) as AITask[];

describe("ai-config invariants", () => {
  it("assigns every task to Gemini except the two optional Anthropic upgrades", () => {
    const anthropicTasks = tasks.filter((t) => DEFAULT_MODEL_CONFIG[t].provider === "anthropic");
    expect(anthropicTasks.sort()).toEqual(["research-synthesize", "summarize-complex"]);
    expect(tasks.some((t) => DEFAULT_MODEL_CONFIG[t].provider === "openai")).toBe(false);
  });

  it("has a Gemini fallback for every task so a Gemini-only deployment works", () => {
    for (const task of tasks) {
      expect(PROVIDER_FALLBACK_MODELS.gemini[task]).toMatch(/^gemini-/);
    }
  });

  it("prices every referenced model id", () => {
    const configured = listConfiguredModels();
    for (const ids of Object.values(configured)) {
      for (const id of ids) expect(MODEL_COSTS[id]).toBeDefined();
    }
  });

  it("keeps the summary retry model distinct from the summary assignments", () => {
    expect(DEFAULT_MODEL_CONFIG.summarize.model).not.toBe(GEMINI_SUMMARY_FALLBACK_MODEL);
    expect(PROVIDER_FALLBACK_MODELS.gemini["summarize-complex"]).not.toBe(
      GEMINI_SUMMARY_FALLBACK_MODEL
    );
    expect(listConfiguredModels().gemini).toEqual(
      expect.arrayContaining([GEMINI_SEARCH_MODEL, GEMINI_SUMMARY_FALLBACK_MODEL])
    );
  });
});
