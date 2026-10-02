import { readPhase2FeatureFlags } from "../feature-flags";

describe("Phase 2 server feature flags", () => {
  it("defaults every incomplete Phase 2 feature to disabled", () => {
    expect(readPhase2FeatureFlags({})).toEqual({
      captureSummary: true,
      areaClassification: true,
      captureTriage: "on",
      serverRender: true,
      knowledgeUi: false,
      personalization: false,
      digests: false,
    });
  });

  it("only accepts an explicit true value", () => {
    expect(
      readPhase2FeatureFlags({
        FEATURE_CAPTURE_SUMMARY: " false ",
        FEATURE_AREA_CLASSIFICATION: "False",
        FEATURE_SERVER_RENDER: "FALSE",
        FEATURE_KNOWLEDGE_UI: "true",
        FEATURE_PERSONALIZATION: " false ",
        FEATURE_DIGESTS: " true ",
      })
    ).toEqual({
      captureSummary: false,
      areaClassification: false,
      captureTriage: "on",
      serverRender: false,
      knowledgeUi: true,
      personalization: false,
      digests: true,
    });
  });

  it.each([
    [undefined, "on"],
    ["shadow", "shadow"],
    ["SHADOW ", "shadow"],
    ["false", "off"],
    [" False ", "off"],
    ["true", "on"],
    ["anything", "on"],
  ])("reads FEATURE_CAPTURE_TRIAGE=%p as %p", (value, mode) => {
    expect(readPhase2FeatureFlags({ FEATURE_CAPTURE_TRIAGE: value }).captureTriage).toBe(mode);
  });
});
