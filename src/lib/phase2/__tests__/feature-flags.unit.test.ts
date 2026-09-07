import { readPhase2FeatureFlags } from "../feature-flags";

describe("Phase 2 server feature flags", () => {
  it("defaults every incomplete Phase 2 feature to disabled", () => {
    expect(readPhase2FeatureFlags({})).toEqual({
      knowledgeUi: false,
      search: false,
      answers: false,
      personalization: false,
      digests: false,
    });
  });

  it("only accepts an explicit true value", () => {
    expect(
      readPhase2FeatureFlags({
        FEATURE_KNOWLEDGE_UI: "true",
        FEATURE_SEARCH: "TRUE",
        FEATURE_ANSWERS: "1",
        FEATURE_PERSONALIZATION: " false ",
        FEATURE_DIGESTS: " true ",
      })
    ).toEqual({
      knowledgeUi: true,
      search: true,
      answers: false,
      personalization: false,
      digests: true,
    });
  });
});
