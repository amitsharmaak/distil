import {
  captureQueueMessageV2,
  createTwoTenantFixture,
  forgedQueueEnvelopeFixtures,
  tenantJobEnvelopeV1,
} from "../support/phase3-tenancy";

describe("Phase 3 two-tenant fixtures", () => {
  it("creates unrelated tenants with consistent AuthContext ownership", () => {
    const { alpha, beta } = createTwoTenantFixture();

    expect(alpha.user.id).not.toBe(beta.user.id);
    expect(alpha.workspace.id).not.toBe(beta.workspace.id);
    expect(Object.values(alpha.auth).every((context) => context.userId === alpha.user.id)).toBe(
      true
    );
    expect(alpha.auth.session).toMatchObject({
      actorKind: "user",
      sessionId: expect.any(String),
      requestId: expect.any(String),
    });
    expect(alpha.auth.captureToken.actorKind).toBe("capture-token");
    expect(alpha.auth.system.actorKind).toBe("system");
  });

  it("returns fresh fixtures so mutations cannot leak between tests", () => {
    const first = createTwoTenantFixture();
    const second = createTwoTenantFixture();

    first.alpha.user.email = "mutated@example.test";
    expect(second.alpha.user.email).toBe("alpha@tenant.example.test");
  });

  it("builds the locked queue envelope contracts", () => {
    const { alpha } = createTwoTenantFixture();

    expect(captureQueueMessageV2(alpha)).toEqual({
      version: 2,
      userId: alpha.user.id,
      captureId: alpha.resources.captureId,
      traceId: alpha.auth.session.requestId,
    });
    expect(tenantJobEnvelopeV1(alpha)).toEqual({
      version: 1,
      userId: alpha.user.id,
      jobId: alpha.resources.jobId,
      jobType: "distil-test-job",
      traceId: alpha.auth.system.requestId,
    });
  });

  it("includes malformed and syntactically valid cross-tenant forgeries", () => {
    const fixture = createTwoTenantFixture();
    const cases = forgedQueueEnvelopeFixtures(fixture);

    expect(new Set(cases.map(({ id }) => id)).size).toBe(cases.length);
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "capture-cross-tenant-resource",
          input: expect.objectContaining({
            userId: fixture.beta.user.id,
            captureId: fixture.alpha.resources.captureId,
          }),
          expectedFailure: "tenant-resource-mismatch",
        }),
        expect.objectContaining({
          id: "job-cross-tenant-resource",
          input: expect.objectContaining({
            userId: fixture.beta.user.id,
            jobId: fixture.alpha.resources.jobId,
          }),
          expectedFailure: "tenant-resource-mismatch",
        }),
      ])
    );
  });
});
