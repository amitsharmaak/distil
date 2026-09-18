import { readPhase2FeatureFlags } from "../feature-flags";

describe("Phase 2 server feature flags", () => {
  it("defaults every incomplete Phase 2 feature to disabled", () => {
    expect(readPhase2FeatureFlags({})).toEqual({
      captureSummary: true,
      serverRender: true,
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
        FEATURE_CAPTURE_SUMMARY: " false ",
        FEATURE_SERVER_RENDER: "FALSE",
        FEATURE_KNOWLEDGE_UI: "true",
        FEATURE_SEARCH: "TRUE",
        FEATURE_ANSWERS: "1",
        FEATURE_PERSONALIZATION: " false ",
        FEATURE_DIGESTS: " true ",
      })
    ).toEqual({
      captureSummary: false,
      serverRender: false,
      knowledgeUi: true,
      search: true,
      answers: false,
      personalization: false,
      digests: true,
    });
  });
});
