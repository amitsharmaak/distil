import {
  JUNK_REJECT_MAX_READABLE_CHARS,
  JUNK_REJECT_MIN_CONFIDENCE,
  TRIAGE_JUNK_KINDS,
  junkRejectionMessage,
  shouldRejectAsJunk,
  storedTriageOf,
  type CaptureTriageVerdict,
  type JunkRejectionGuards,
} from "../capture-triage";

const verdict = (patch: Partial<CaptureTriageVerdict> = {}): CaptureTriageVerdict => ({
  kind: "login_wall",
  readable: false,
  confidence: 0.95,
  priorityScore: 5,
  reason: "Sign-in page.",
  model: "gemini-test",
  promptVersion: "triage-v1",
  ...patch,
});

const guards = (patch: Partial<JunkRejectionGuards> = {}): JunkRejectionGuards => ({
  readableChars: 400,
  hasUserNotes: false,
  explicitHighPriority: false,
  ...patch,
});

describe("shouldRejectAsJunk", () => {
  it("rejects a confident junk verdict on a short page with no user signal", () => {
    expect(shouldRejectAsJunk(verdict(), guards())).toBe(true);
  });

  it.each(TRIAGE_JUNK_KINDS)("rejects junk kind %s", (kind) => {
    expect(shouldRejectAsJunk(verdict({ kind }), guards())).toBe(true);
  });

  it("never rejects content", () => {
    expect(shouldRejectAsJunk(verdict({ kind: "content" }), guards())).toBe(false);
  });

  it("never rejects a readable verdict", () => {
    expect(shouldRejectAsJunk(verdict({ readable: true }), guards())).toBe(false);
  });

  it("requires confidence of at least 0.9", () => {
    expect(JUNK_REJECT_MIN_CONFIDENCE).toBe(0.9);
    expect(shouldRejectAsJunk(verdict({ confidence: 0.89 }), guards())).toBe(false);
    expect(shouldRejectAsJunk(verdict({ confidence: 0.9 }), guards())).toBe(true);
  });

  it("requires fewer than 3,000 readable characters", () => {
    expect(JUNK_REJECT_MAX_READABLE_CHARS).toBe(3_000);
    expect(shouldRejectAsJunk(verdict(), guards({ readableChars: 2_999 }))).toBe(true);
    expect(shouldRejectAsJunk(verdict(), guards({ readableChars: 3_000 }))).toBe(false);
  });

  it("never rejects when the user added notes", () => {
    expect(shouldRejectAsJunk(verdict(), guards({ hasUserNotes: true }))).toBe(false);
  });

  it("never rejects an explicit high-priority save", () => {
    expect(shouldRejectAsJunk(verdict(), guards({ explicitHighPriority: true }))).toBe(false);
  });
});

describe("junkRejectionMessage", () => {
  it.each([
    ["login_wall", "a sign-in page"],
    ["paywall_stub", "a paywall preview"],
    ["consent_wall", "a cookie or consent page"],
    ["error_page", "an error page"],
    ["bot_check", "a bot check"],
    ["empty_shell", "an empty page"],
  ] as const)("describes %s", (kind, description) => {
    expect(junkRejectionMessage(kind)).toBe(
      `This looked like ${description}, not an article. Save it again to keep it anyway.`
    );
  });

  it("covers every junk kind", () => {
    for (const kind of TRIAGE_JUNK_KINDS) {
      expect(junkRejectionMessage(kind)).not.toContain("undefined");
    }
  });
});

describe("storedTriageOf", () => {
  const stored = {
    kind: "content",
    readable: true,
    confidence: 0.8,
    priorityScore: 64,
    reason: "Useful.",
    model: "gemini-test",
    promptVersion: "triage-v1",
    triagedAt: "2026-10-01T10:00:00.000Z",
    enforced: true,
  };

  it.each([
    [undefined],
    [null],
    ["triage"],
    [42],
    [{}],
    [{ triage: null }],
    [{ triage: "x" }],
    [{ triage: { ...stored, priorityScore: "64" } }],
    [{ triage: { ...stored, priorityScore: Number.NaN } }],
    [{ triage: { ...stored, confidence: undefined } }],
    [{ triage: { ...stored, confidence: Number.POSITIVE_INFINITY } }],
    [{ triage: { ...stored, kind: "spam" } }],
    [{ triage: { ...stored, kind: 3 } }],
  ])("returns undefined for garbage %j", (value) => {
    expect(storedTriageOf(value)).toBeUndefined();
  });

  it("reads a valid triage", () => {
    expect(storedTriageOf({ area: "work", triage: stored })).toEqual(stored);
  });

  it("fills defaults for a partial triage", () => {
    expect(
      storedTriageOf({ triage: { kind: "paywall_stub", confidence: 0.7, priorityScore: 20 } })
    ).toEqual({
      kind: "paywall_stub",
      readable: false,
      confidence: 0.7,
      priorityScore: 20,
      reason: "",
      model: "",
      promptVersion: "",
      triagedAt: "",
      enforced: false,
    });
  });

  it("clamps confidence and score and rounds the score", () => {
    expect(
      storedTriageOf({ triage: { ...stored, confidence: 1.4, priorityScore: 130 } })
    ).toMatchObject({ confidence: 1, priorityScore: 100 });
    expect(
      storedTriageOf({ triage: { ...stored, confidence: -0.2, priorityScore: -3 } })
    ).toMatchObject({ confidence: 0, priorityScore: 0 });
    expect(storedTriageOf({ triage: { ...stored, priorityScore: 41.6 } })?.priorityScore).toBe(42);
  });

  it("treats a non-boolean readable or enforced as false", () => {
    expect(storedTriageOf({ triage: { ...stored, readable: "yes", enforced: 1 } })).toMatchObject({
      readable: false,
      enforced: false,
    });
  });
});
