import { z } from "zod";

import { createAuthContext, createSystemContext } from "@/lib/contracts/tenant-context";
import {
  createCaptureQueueMessageV2,
  createTenantJobEnvelopeV1,
  parseCaptureQueueMessageV2,
  parseTenantJobEnvelopeV1,
} from "@/lib/contracts/tenant-jobs";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const REQUEST_ID = "50000000-0000-4000-8000-000000000005";
const CAPTURE_ID = "60000000-0000-4000-8000-000000000006";
const JOB_ID = "70000000-0000-4000-8000-000000000007";

const authContext = createAuthContext({
  tenantId: TENANT_ID,
  userId: USER_ID,
  actorKind: "user",
  actorId: USER_ID,
  requestId: REQUEST_ID,
});

const payloadSchema = z
  .object({
    captureId: z.string().uuid(),
  })
  .strict()
  .readonly();

describe("tenant job contracts", () => {
  it("creates a strict, immutable capture queue v2 message", () => {
    const message = createCaptureQueueMessageV2({ captureId: CAPTURE_ID, authContext });

    expect(message).toEqual({ version: 2, captureId: CAPTURE_ID, authContext });
    expect(Object.isFrozen(message)).toBe(true);
    expect(Object.isFrozen(message.authContext)).toBe(true);
  });

  it.each([
    ["legacy version", { version: 1, captureId: CAPTURE_ID, authContext }],
    ["missing tenant context", { version: 2, captureId: CAPTURE_ID }],
    ["malformed capture UUID", { version: 2, captureId: "capture-1", authContext }],
    ["unknown fields", { version: 2, captureId: CAPTURE_ID, authContext, tenantId: TENANT_ID }],
  ])("rejects capture messages with %s", (_case, message) => {
    expect(() => parseCaptureQueueMessageV2(message)).toThrow();
  });

  it("rejects forged nested authorization in a capture message", () => {
    expect(() =>
      parseCaptureQueueMessageV2({
        version: 2,
        captureId: CAPTURE_ID,
        authContext: { ...authContext, actorId: JOB_ID },
      })
    ).toThrow("A user actorId must match userId");
  });

  it("does not accept a control-plane system context as tenant authorization", () => {
    const systemContext = createSystemContext({
      actorKind: "system",
      actorId: JOB_ID,
      requestId: REQUEST_ID,
    });

    expect(() =>
      parseCaptureQueueMessageV2({
        version: 2,
        captureId: CAPTURE_ID,
        authContext: systemContext,
      })
    ).toThrow();
  });

  it("creates and freezes an envelope plus its strict payload", () => {
    const envelope = createTenantJobEnvelopeV1(
      {
        jobId: JOB_ID,
        jobType: "capture.extract",
        authContext,
        payload: { captureId: CAPTURE_ID },
      },
      payloadSchema
    );

    expect(envelope).toEqual({
      version: 1,
      jobId: JOB_ID,
      jobType: "capture.extract",
      authContext,
      payload: { captureId: CAPTURE_ID },
    });
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.payload)).toBe(true);
  });

  it.each([
    [
      "missing authorization",
      { version: 1, jobId: JOB_ID, jobType: "capture.extract", payload: { captureId: CAPTURE_ID } },
    ],
    [
      "malformed job UUID",
      {
        version: 1,
        jobId: "job-1",
        jobType: "capture.extract",
        authContext,
        payload: { captureId: CAPTURE_ID },
      },
    ],
    [
      "malformed job type",
      {
        version: 1,
        jobId: JOB_ID,
        jobType: "Capture Extract",
        authContext,
        payload: { captureId: CAPTURE_ID },
      },
    ],
    [
      "an unknown envelope field",
      {
        version: 1,
        jobId: JOB_ID,
        jobType: "capture.extract",
        authContext,
        payload: { captureId: CAPTURE_ID },
        elevated: true,
      },
    ],
    [
      "an unknown payload field",
      {
        version: 1,
        jobId: JOB_ID,
        jobType: "capture.extract",
        authContext,
        payload: { captureId: CAPTURE_ID, tenantId: TENANT_ID },
      },
    ],
  ])("rejects an envelope with %s", (_case, envelope) => {
    expect(() => parseTenantJobEnvelopeV1(envelope, payloadSchema)).toThrow();
  });
});
