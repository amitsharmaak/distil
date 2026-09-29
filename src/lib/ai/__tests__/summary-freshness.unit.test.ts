import { detailedBriefId, isDetailedCurrent } from "../summary-freshness";

const brief = { id: "brief-1", createdAt: "2026-09-29T10:00:00Z" };

describe("isDetailedCurrent", () => {
  it("matches a summary-v2 detailed summary to the brief it was built from", () => {
    const detailed = { createdAt: "2026-09-29T09:00:00Z", structured: { briefId: "brief-1" } };
    expect(isDetailedCurrent(brief, detailed)).toBe(true);
    expect(isDetailedCurrent({ ...brief, id: "brief-2" }, detailed)).toBe(false);
    expect(isDetailedCurrent(undefined, detailed)).toBe(false);
  });

  it("keeps a pre-S2 detailed summary until the brief is regenerated after it", () => {
    expect(isDetailedCurrent(brief, { createdAt: "2026-09-29T11:00:00Z" })).toBe(true);
    expect(isDetailedCurrent(brief, { createdAt: "2026-09-29T09:00:00Z" })).toBe(false);
    expect(isDetailedCurrent(undefined, { createdAt: "2026-09-29T09:00:00Z" })).toBe(true);
  });

  it("reads the brief id only from a structured object", () => {
    expect(detailedBriefId({ briefId: "b" })).toBe("b");
    expect(detailedBriefId({ briefId: "" })).toBeUndefined();
    expect(detailedBriefId({ overview: "v1" })).toBeUndefined();
    expect(detailedBriefId(null)).toBeUndefined();
    expect(detailedBriefId("b")).toBeUndefined();
  });
});
