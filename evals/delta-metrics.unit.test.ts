import fs from "fs";
import path from "path";
import {
  evaluateDelta,
  evaluateDeltaCase,
  extractSpecifics,
  type DeltaCase,
} from "./delta-metrics";

const recorded: DeltaCase[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "recorded-delta.json"), "utf-8")
);

describe("delta metrics", () => {
  it("passes a delta that adds grounded specifics and fails one that restates the brief", () => {
    const metrics = evaluateDelta(recorded);
    const [good, restates] = metrics.perCase;

    expect(good.pass).toBe(true);
    expect(good.restatement).toBeLessThan(0.05);
    expect(good.novelSpecifics).toEqual(expect.arrayContaining(["1200", "800", "4%", "leeds"]));
    expect(good.ungroundedSpecifics).toEqual([]);
    expect(good.openQuestionsAddressed).toBe(1);

    expect(restates.pass).toBe(false);
    expect(restates.restatement).toBeGreaterThan(0.5);
    expect(restates.novelSpecifics).toEqual([]);
    expect(metrics.passRate).toBe(0.5);
  });

  it("counts specifics missing from the source as ungrounded", () => {
    const [base] = recorded;
    const result = evaluateDeltaCase({
      ...base,
      detailed: [{ heading: "Extra", items: ["It ships to Brazil for 9,999 dollars."] }],
    });
    expect(result.ungroundedSpecifics).toEqual(expect.arrayContaining(["9999", "brazil"]));
    expect(result.novelSpecifics).toEqual([]);
  });

  it("does not read Title Case heading words as names", () => {
    const [base] = recorded;
    const result = evaluateDeltaCase({
      ...base,
      detailed: [{ heading: "Execution Details And Backlash", items: ["Nair ran it in Leeds."] }],
    });
    expect(result.ungroundedSpecifics).toEqual([]);
    expect(result.novelSpecifics).toEqual(["leeds"]);
  });

  it("accepts one short section when the brief already covers a short source", () => {
    const result = evaluateDeltaCase({
      id: "short",
      source: "A two-line note about lunch.",
      brief: { overview: "A note about lunch.", sections: [], openQuestions: [] },
      detailed: [{ heading: "Nothing more", items: ["The brief covers this note."] }],
    });
    expect(result.pass).toBe(true);
  });

  it("extracts numbers and mid-sentence names, not sentence-initial words", () => {
    const specifics = extractSpecifics("The team at Acme shipped 1,200 units. Then Priya left.");
    expect(specifics).toEqual(new Set(["1200", "acme", "priya"]));
  });
});
