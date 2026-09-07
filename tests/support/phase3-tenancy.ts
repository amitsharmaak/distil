/**
 * Test-only Phase 3 contracts. Production code must define compatible shapes;
 * this module intentionally imports no application adapters.
 */
export interface AuthContext {
  userId: string;
  actorKind: "user" | "capture-token" | "system";
  actorId: string;
  sessionId?: string;
  requestId: string;
}

export interface CaptureQueueMessageV2 {
  version: 2;
  userId: string;
  captureId: string;
  traceId: string;
}

export interface TenantJobEnvelopeV1 {
  version: 1;
  userId: string;
  jobId: string;
  jobType: string;
  traceId: string;
}

export interface TenantFixture {
  user: {
    id: string;
    email: string;
  };
  workspace: {
    id: string;
  };
  auth: {
    session: AuthContext;
    captureToken: AuthContext;
    system: AuthContext;
  };
  resources: {
    itemId: string;
    captureId: string;
    collectionId: string;
    jobId: string;
  };
}

export interface TwoTenantFixture {
  alpha: TenantFixture;
  beta: TenantFixture;
}

const tenant = (sequence: number, name: string): TenantFixture => {
  const suffix = String(sequence).padStart(12, "0");
  const userId = `10000000-0000-4000-8000-${suffix}`;
  const actorId = `20000000-0000-4000-8000-${suffix}`;
  const requestId = `30000000-0000-4000-8000-${suffix}`;

  return {
    user: {
      id: userId,
      email: `${name}@tenant.example.test`,
    },
    workspace: {
      id: `40000000-0000-4000-8000-${suffix}`,
    },
    auth: {
      session: {
        userId,
        actorKind: "user",
        actorId,
        sessionId: `50000000-0000-4000-8000-${suffix}`,
        requestId,
      },
      captureToken: {
        userId,
        actorKind: "capture-token",
        actorId: `60000000-0000-4000-8000-${suffix}`,
        requestId: `70000000-0000-4000-8000-${suffix}`,
      },
      system: {
        userId,
        actorKind: "system",
        actorId: "phase3-test-worker",
        requestId: `80000000-0000-4000-8000-${suffix}`,
      },
    },
    resources: {
      itemId: `item-${name}`,
      captureId: `90000000-0000-4000-8000-${suffix}`,
      collectionId: `collection-${name}`,
      jobId: `a0000000-0000-4000-8000-${suffix}`,
    },
  };
};

/** Return fresh, deterministic records for two unrelated tenants. */
export function createTwoTenantFixture(): TwoTenantFixture {
  return structuredClone({
    alpha: tenant(1, "alpha"),
    beta: tenant(2, "beta"),
  });
}

export function captureQueueMessageV2(
  tenantFixture: TenantFixture,
  overrides: Partial<CaptureQueueMessageV2> = {}
): CaptureQueueMessageV2 {
  return {
    version: 2,
    userId: tenantFixture.user.id,
    captureId: tenantFixture.resources.captureId,
    traceId: tenantFixture.auth.session.requestId,
    ...overrides,
  };
}

export function tenantJobEnvelopeV1(
  tenantFixture: TenantFixture,
  overrides: Partial<TenantJobEnvelopeV1> = {}
): TenantJobEnvelopeV1 {
  return {
    version: 1,
    userId: tenantFixture.user.id,
    jobId: tenantFixture.resources.jobId,
    jobType: "distil-test-job",
    traceId: tenantFixture.auth.system.requestId,
    ...overrides,
  };
}

export type ForgedEnvelopeFailure =
  | "invalid-envelope"
  | "tenant-resource-mismatch"
  | "unknown-tenant";

export interface ForgedQueueEnvelopeFixture {
  id: string;
  envelopeKind: "capture" | "job";
  input: unknown;
  expectedFailure: ForgedEnvelopeFailure;
}

/**
 * Inputs every queue decoder/consumer should reject before doing tenant work.
 * The cross-tenant cases are syntactically valid on purpose: the consumer must
 * bind the resource lookup to both the envelope user and resource id.
 */
export function forgedQueueEnvelopeFixtures(
  fixture: TwoTenantFixture = createTwoTenantFixture()
): ForgedQueueEnvelopeFixture[] {
  const validCapture = captureQueueMessageV2(fixture.alpha);
  const validJob = tenantJobEnvelopeV1(fixture.alpha);

  return [
    {
      id: "capture-legacy-version",
      envelopeKind: "capture",
      input: { ...validCapture, version: 1 },
      expectedFailure: "invalid-envelope",
    },
    {
      id: "capture-missing-user",
      envelopeKind: "capture",
      input: { version: 2, captureId: validCapture.captureId, traceId: validCapture.traceId },
      expectedFailure: "invalid-envelope",
    },
    {
      id: "capture-cross-tenant-resource",
      envelopeKind: "capture",
      input: { ...validCapture, userId: fixture.beta.user.id },
      expectedFailure: "tenant-resource-mismatch",
    },
    {
      id: "capture-unknown-tenant",
      envelopeKind: "capture",
      input: { ...validCapture, userId: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
      expectedFailure: "unknown-tenant",
    },
    {
      id: "job-missing-trace",
      envelopeKind: "job",
      input: {
        version: validJob.version,
        userId: validJob.userId,
        jobId: validJob.jobId,
        jobType: validJob.jobType,
      },
      expectedFailure: "invalid-envelope",
    },
    {
      id: "job-cross-tenant-resource",
      envelopeKind: "job",
      input: { ...validJob, userId: fixture.beta.user.id },
      expectedFailure: "tenant-resource-mismatch",
    },
  ];
}
