import {
  createCaptureQueueMessageV2,
  createResearchRunMessageV1,
  createTenantJobEnvelopeV1,
  parseCaptureQueueMessageV2,
  parseResearchRunMessageV1,
  parseTenantJobEnvelopeV1,
  RESEARCH_RUN_STEPS,
  researchRunIdempotencyKey,
  type CaptureQueueMessageV2,
  type CreateCaptureQueueMessageV2Input,
  type CreateTenantJobEnvelopeV1Input,
  type TenantJobEnvelopeV1,
} from "@/lib/contracts/tenant-jobs";

const USER_ID = "20000000-0000-4000-8000-000000000002";
const CAPTURE_ID = "60000000-0000-4000-8000-000000000006";
const JOB_ID = "70000000-0000-4000-8000-000000000007";
const TRACE_ID = "90000000-0000-4000-8000-000000000009";

type Expect<T extends true> = T;
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false;
type IsRequired<T, TKey extends keyof T> = T extends Required<Pick<T, TKey>> ? true : false;
type CaptureKeysAreExact = Expect<
  Equal<keyof CaptureQueueMessageV2, "version" | "userId" | "captureId" | "traceId">
>;
type JobKeysAreExact = Expect<
  Equal<keyof TenantJobEnvelopeV1, "version" | "userId" | "jobId" | "jobType" | "traceId">
>;
type CaptureConstructorUserIdIsRequired = Expect<
  IsRequired<CreateCaptureQueueMessageV2Input, "userId">
>;
type JobConstructorUserIdIsRequired = Expect<IsRequired<CreateTenantJobEnvelopeV1Input, "userId">>;

const compileTimeContract: [
  CaptureKeysAreExact,
  JobKeysAreExact,
  CaptureConstructorUserIdIsRequired,
  JobConstructorUserIdIsRequired,
] = [true, true, true, true];

describe("tenant job contracts", () => {
  it("locks the public top-level fields at compile time", () => {
    expect(compileTimeContract).toEqual([true, true, true, true]);
  });

  it("creates a strict, immutable capture queue v2 message", () => {
    const message = createCaptureQueueMessageV2({
      userId: USER_ID,
      captureId: CAPTURE_ID,
      traceId: TRACE_ID,
    });

    expect(message).toEqual({
      version: 2,
      userId: USER_ID,
      captureId: CAPTURE_ID,
      traceId: TRACE_ID,
    });
    expect(Object.isFrozen(message)).toBe(true);
  });

  it.each(["userId", "captureId", "traceId"])(
    "rejects a capture message missing %s",
    (missingField) => {
      const incomplete: Record<string, unknown> = {
        version: 2,
        userId: USER_ID,
        captureId: CAPTURE_ID,
        traceId: TRACE_ID,
      };
      delete incomplete[missingField];

      expect(() => parseCaptureQueueMessageV2(incomplete)).toThrow();
    }
  );

  it.each([
    ["legacy version", { version: 1, userId: USER_ID, captureId: CAPTURE_ID, traceId: TRACE_ID }],
    [
      "malformed user UUID",
      { version: 2, userId: "user-1", captureId: CAPTURE_ID, traceId: TRACE_ID },
    ],
    [
      "malformed capture UUID",
      { version: 2, userId: USER_ID, captureId: "capture-1", traceId: TRACE_ID },
    ],
    [
      "malformed trace UUID",
      { version: 2, userId: USER_ID, captureId: CAPTURE_ID, traceId: "trace-1" },
    ],
    [
      "forged auth context",
      {
        version: 2,
        userId: USER_ID,
        captureId: CAPTURE_ID,
        traceId: TRACE_ID,
        authContext: { userId: USER_ID },
      },
    ],
    [
      "forged tenantId",
      {
        version: 2,
        userId: USER_ID,
        captureId: CAPTURE_ID,
        traceId: TRACE_ID,
        tenantId: USER_ID,
      },
    ],
  ])("rejects a capture message with %s", (_case, message) => {
    expect(() => parseCaptureQueueMessageV2(message)).toThrow();
  });

  it("creates a strict, immutable tenant job envelope", () => {
    const envelope = createTenantJobEnvelopeV1({
      userId: USER_ID,
      jobId: JOB_ID,
      jobType: "capture.extract",
      traceId: TRACE_ID,
    });

    expect(envelope).toEqual({
      version: 1,
      userId: USER_ID,
      jobId: JOB_ID,
      jobType: "capture.extract",
      traceId: TRACE_ID,
    });
    expect(Object.isFrozen(envelope)).toBe(true);
  });

  it.each(["userId", "jobId", "jobType", "traceId"])(
    "rejects a job envelope missing %s",
    (missingField) => {
      const incomplete: Record<string, unknown> = {
        version: 1,
        userId: USER_ID,
        jobId: JOB_ID,
        jobType: "capture.extract",
        traceId: TRACE_ID,
      };
      delete incomplete[missingField];

      expect(() => parseTenantJobEnvelopeV1(incomplete)).toThrow();
    }
  );

  it.each([
    [
      "wrong version",
      { version: 2, userId: USER_ID, jobId: JOB_ID, jobType: "capture.extract", traceId: TRACE_ID },
    ],
    [
      "malformed user UUID",
      {
        version: 1,
        userId: "user-1",
        jobId: JOB_ID,
        jobType: "capture.extract",
        traceId: TRACE_ID,
      },
    ],
    [
      "malformed job UUID",
      {
        version: 1,
        userId: USER_ID,
        jobId: "job-1",
        jobType: "capture.extract",
        traceId: TRACE_ID,
      },
    ],
    [
      "malformed job type",
      { version: 1, userId: USER_ID, jobId: JOB_ID, jobType: "Capture Extract", traceId: TRACE_ID },
    ],
    [
      "malformed trace UUID",
      {
        version: 1,
        userId: USER_ID,
        jobId: JOB_ID,
        jobType: "capture.extract",
        traceId: "trace-1",
      },
    ],
    [
      "forged payload",
      {
        version: 1,
        userId: USER_ID,
        jobId: JOB_ID,
        jobType: "capture.extract",
        traceId: TRACE_ID,
        payload: { captureId: CAPTURE_ID },
      },
    ],
    [
      "mismatched capture-message fields",
      { version: 1, userId: USER_ID, captureId: CAPTURE_ID, traceId: TRACE_ID },
    ],
  ])("rejects a job envelope with %s", (_case, envelope) => {
    expect(() => parseTenantJobEnvelopeV1(envelope)).toThrow();
  });
});

describe("research run message", () => {
  const REPORT_ID = "a0000000-0000-4000-8000-00000000000a";
  const base = { version: 1, userId: USER_ID, reportId: REPORT_ID, traceId: TRACE_ID };

  it("accepts every stage kind, including the R3 outline and write stages", () => {
    expect(RESEARCH_RUN_STEPS).toEqual([
      "plan",
      "search",
      "gaps",
      "deepen",
      "synthesize",
      "outline",
      "write",
    ]);
    const outline = createResearchRunMessageV1({ ...base, step: "outline" });
    expect(outline).toEqual({ ...base, step: "outline" });
    expect(researchRunIdempotencyKey(outline)).toBe(`research:${REPORT_ID}:outline:0`);
    const write = createResearchRunMessageV1({ ...base, step: "write", index: 2 });
    expect(researchRunIdempotencyKey(write)).toBe(`research:${REPORT_ID}:write:2`);
    expect(Object.isFrozen(write)).toBe(true);
  });

  it("keeps accepting a synthesize message published before the upgrade", () => {
    expect(parseResearchRunMessageV1({ ...base, step: "synthesize" })).toEqual({
      ...base,
      step: "synthesize",
    });
  });

  it.each([
    ["a write stage without its section index", { ...base, step: "write" }],
    ["an unknown stage", { ...base, step: "assemble" }],
    ["a negative index", { ...base, step: "write", index: -1 }],
    ["an extra field", { ...base, step: "outline", outline: {} }],
  ])("rejects %s", (_case, message) => {
    expect(() => parseResearchRunMessageV1(message)).toThrow();
  });
});
