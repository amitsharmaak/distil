import {
  assertAccountExportPrivacy,
  assertGeneratedCsrfCoverage,
  assertInvitationReplaySafety,
  assertLifecycleRecovery,
  assertLogRedaction,
  assertOAuthStateIsolation,
  assertQueueReplayAndForgery,
  assertSessionAbuseSafety,
  assertTenantQueryPlans,
  assertTwoUserDeletionLifecycle,
  assertCompletePhase3SecurityAdapters,
  assertDeletionQueueRace,
  DeterministicBarrier,
  DeterministicFaultInjector,
  PHASE3_SECURITY_ADAPTER_KEYS,
  type AccountDeletionSnapshot,
  type AccountExportAdapter,
  type ConnectorOAuthStateAdapter,
  type MutationCsrfAdapter,
} from "../support/phase3-security";
import { createTwoTenantFixture } from "../support/phase3-tenancy";

describe("Phase 3 Wave 3 security/privacy harness", () => {
  const fixture = createTwoTenantFixture();

  it("generates hostile and missing-origin checks for every reviewed mutation", async () => {
    const effects: string[] = [];
    const surfaces = ["POST /api/v1/account/export", "POST /api/v1/account/deletion"];
    const adapter: MutationCsrfAdapter = {
      surfaces,
      async invoke({ origin }) {
        if (origin !== "https://distil.example") return { status: 403 };
        effects.push("mutated");
        return { status: 202 };
      },
      async effects() {
        return effects;
      },
    };

    await expect(
      assertGeneratedCsrfCoverage(adapter, surfaces, fixture.alpha.auth.session)
    ).resolves.toBeUndefined();
    expect(effects).toEqual([]);
  });

  it("fails closed when the CSRF adapter or reviewed inventory drifts", async () => {
    const adapter: MutationCsrfAdapter = {
      surfaces: ["POST /api/v1/account/export"],
      async invoke() {
        return { status: 403 };
      },
      async effects() {
        return [];
      },
    };
    await expect(
      assertGeneratedCsrfCoverage(
        adapter,
        ["POST /api/v1/account/export", "POST /api/v1/account/deletion"],
        fixture.alpha.auth.session
      )
    ).rejects.toThrow("missing reviewed surface");
  });

  it("enforces an export allowlist, exclusions, and cross-tenant concealment", async () => {
    const adapter: AccountExportAdapter = {
      allowedTopLevelSections: ["account", "items"],
      unknownExportId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      async seed() {},
      async build() {
        return {
          account: { email: fixture.alpha.user.email },
          items: [
            { title: fixture.alpha.canaries.itemTitle, body: fixture.alpha.canaries.itemBody },
          ],
        };
      },
      async download(context, exportId) {
        if (
          context.userId === fixture.alpha.user.id &&
          exportId === fixture.alpha.resources.exportId
        ) {
          return { status: 200, body: { ok: true } };
        }
        return { status: 404, body: { error: { code: "NOT_FOUND" } } };
      },
    };
    await expect(assertAccountExportPrivacy(adapter, fixture)).resolves.toBeUndefined();
  });

  it("rejects export keys that could expose credentials", async () => {
    const adapter: AccountExportAdapter = {
      allowedTopLevelSections: ["account", "items"],
      unknownExportId: "missing",
      async seed() {},
      async build() {
        return {
          account: { sessionHash: "hashed-provider-session" },
          items: [{ title: fixture.alpha.canaries.itemTitle }],
        };
      },
      async download() {
        return { status: 404, body: { error: { code: "NOT_FOUND" } } };
      },
    };
    await expect(assertAccountExportPrivacy(adapter, fixture)).rejects.toThrow("forbidden key");
  });

  it("exercises two-user deletion ordering and duplicate worker delivery", async () => {
    const snapshots = new Map<string, AccountDeletionSnapshot>();
    const initial = (userId: string): AccountDeletionSnapshot => ({
      accountStatus: "active",
      activeSessionIds: [`session:${userId}`],
      activeCaptureTokenIds: [`token:${userId}`],
      runnableJobIds: [`job:${userId}`],
      connectorIds: [`connector:${userId}`],
      objectRefs: [`object:${userId}`],
      personalRowCount: 10,
      deletionStatus: "none",
      checkpoint: {},
    });
    const adapter = {
      async seed(twoTenantFixture: typeof fixture) {
        snapshots.set(twoTenantFixture.alpha.user.id, initial(twoTenantFixture.alpha.user.id));
        snapshots.set(twoTenantFixture.beta.user.id, initial(twoTenantFixture.beta.user.id));
      },
      async request(context: typeof fixture.alpha.auth.session) {
        const current = snapshots.get(context.userId)!;
        snapshots.set(context.userId, {
          ...current,
          accountStatus: "deletion_pending",
          activeSessionIds: [],
          activeCaptureTokenIds: [],
          deletionStatus: "requested",
        });
        return { status: 202 };
      },
      async cancel() {
        return { status: 409 };
      },
      async run(input: { userId: string }) {
        const current = snapshots.get(input.userId)!;
        if (current.deletionStatus === "completed") return;
        snapshots.set(input.userId, {
          ...current,
          runnableJobIds: [],
          connectorIds: [],
          objectRefs: [],
          personalRowCount: 0,
          deletionStatus: "completed",
          checkpoint: { completed: true },
        });
      },
      async authenticate(context: typeof fixture.alpha.auth.session) {
        return snapshots.get(context.userId)?.accountStatus === "active";
      },
      async snapshot(context: typeof fixture.alpha.auth.session) {
        return structuredClone(snapshots.get(context.userId)!);
      },
    };
    await expect(assertTwoUserDeletionLifecycle(adapter, fixture)).resolves.toBeUndefined();
  });

  it("requires a claimed job to recheck account state before committing", async () => {
    const status = new Map<string, "active" | "deletion_pending">();
    const effects = new Map<string, string[]>();
    await expect(
      assertDeletionQueueRace(
        {
          async seed(twoTenantFixture) {
            for (const tenant of [twoTenantFixture.alpha, twoTenantFixture.beta]) {
              status.set(tenant.user.id, "active");
              effects.set(tenant.user.id, []);
            }
          },
          async beginJob(context) {
            return async () => {
              if (status.get(context.userId) !== "active") return "rejected";
              effects.get(context.userId)!.push("committed");
              return "committed";
            };
          },
          async requestDeletion(context) {
            status.set(context.userId, "deletion_pending");
          },
          async effects(context) {
            return effects.get(context.userId);
          },
        },
        fixture
      )
    ).resolves.toBeUndefined();
  });

  it("prevents cross-user/provider OAuth state burns and replay", async () => {
    const states = new Map<
      string,
      { userId: string; provider: "gmail" | "slack"; returnPath: string }
    >();
    let sequence = 0;
    const adapter: ConnectorOAuthStateAdapter = {
      async issue({ context, provider, returnPath }) {
        const nonce = `nonce-${++sequence}`;
        const normalized = returnPath.includes("\\") ? "/sources" : returnPath;
        states.set(nonce, { userId: context.userId, provider, returnPath: normalized });
        return { nonce, returnPath: normalized };
      },
      async consume({ context, provider, nonce }) {
        const state = states.get(nonce);
        if (!state || state.userId !== context.userId || state.provider !== provider)
          return undefined;
        states.delete(nonce);
        return { userId: state.userId, returnPath: state.returnPath };
      },
    };
    await expect(assertOAuthStateIsolation(adapter, fixture)).resolves.toBeUndefined();
  });

  it("conceals foreign devices and immediately rejects a revoked session", async () => {
    const owners = new Map<string, string>();
    const active = new Set<string>();
    await expect(
      assertSessionAbuseSafety(
        {
          async seed(twoTenantFixture) {
            for (const tenant of [twoTenantFixture.alpha, twoTenantFixture.beta]) {
              owners.set(tenant.resources.sessionId, tenant.user.id);
              owners.set(tenant.resources.otherSessionId, tenant.user.id);
              active.add(tenant.resources.sessionId);
              active.add(tenant.resources.otherSessionId);
            }
          },
          async list(context) {
            return [...owners.entries()]
              .filter(([, userId]) => userId === context.userId)
              .map(([id]) => ({
                id,
                current: id === context.sessionId,
                userAgent: "security-harness",
              }));
          },
          async revoke(context, deviceId) {
            if (owners.get(deviceId) !== context.userId || deviceId === context.sessionId) {
              return { status: 404 };
            }
            active.delete(deviceId);
            return { status: 200 };
          },
          async authenticate(context, sessionId) {
            return owners.get(sessionId) === context.userId && active.has(sessionId);
          },
        },
        fixture
      )
    ).resolves.toBeUndefined();
  });

  it("prevents invitation email bursts and concurrent activation replay", async () => {
    let invitationClaimed = false;
    let activated = false;
    let providerDispatches = 0;
    let activations = 0;
    await expect(
      assertInvitationReplaySafety(
        {
          async requestMagicLink({ origin }) {
            if (origin !== "https://distil.example") return { status: 403 };
            if (invitationClaimed) return { status: 403 };
            invitationClaimed = true;
            providerDispatches += 1;
            return { status: 202 };
          },
          async complete() {
            if (activated) return { status: 307, activated: false };
            activated = true;
            activations += 1;
            return { status: 307, activated: true };
          },
          async providerDispatchCount() {
            return providerDispatches;
          },
          async accountActivationCount() {
            return activations;
          },
        },
        {
          invitationToken: fixture.alpha.canaries.bearerToken,
          invitationState: fixture.alpha.canaries.sessionCookie,
          email: fixture.alpha.user.email,
          providerSessionId: fixture.alpha.resources.sessionId,
        }
      )
    ).resolves.toBeUndefined();
  });

  it("detects a cross-tenant OAuth nonce burn", async () => {
    const states = new Map<string, { userId: string; returnPath: string }>();
    const unsafe: ConnectorOAuthStateAdapter = {
      async issue({ context }) {
        states.set("nonce", { userId: context.userId, returnPath: "/sources" });
        return { nonce: "nonce", returnPath: "/sources" };
      },
      async consume({ context, nonce }) {
        const state = states.get(nonce);
        states.delete(nonce);
        return state?.userId === context.userId ? state : undefined;
      },
    };
    await expect(assertOAuthStateIsolation(unsafe, fixture)).rejects.toThrow(
      "Owner could not consume intact OAuth state"
    );
  });

  it("injects logging canaries and requires only opaque correlation fields", async () => {
    let output = "";
    await assertLogRedaction(
      {
        async write(value) {
          const input = value as { userId: string; requestId: string };
          output = JSON.stringify({
            userId: input.userId,
            requestId: input.requestId,
            authorization: "[REDACTED]",
            cookie: "[REDACTED]",
            url: "[REDACTED]",
            prompt: "[REDACTED]",
            err: { message: "provider failed" },
          });
        },
        async output() {
          return output;
        },
      },
      fixture
    );
  });

  it("rejects log adapters that serialize an error-carried secret", async () => {
    let output = "";
    await expect(
      assertLogRedaction(
        {
          async write(value) {
            const input = value as { err: Error };
            output = JSON.stringify({
              ...(value as Record<string, unknown>),
              err: { message: input.err.message },
            });
          },
          async output() {
            return output;
          },
        },
        fixture
      )
    ).rejects.toThrow("Log output leaked sensitive canary");
  });

  it("requires queue retry/duplicate/forgery paths to be side-effect safe", async () => {
    const processed = new Set<string>();
    const adapter = {
      async consume(message: { id: string; userId: string }) {
        if (message.userId !== fixture.alpha.user.id) return "rejected" as const;
        if (processed.has(message.id)) return "duplicate" as const;
        processed.add(message.id);
        return "processed" as const;
      },
      async effects() {
        return [...processed].sort();
      },
    };
    const valid = { id: "delivery", userId: fixture.alpha.user.id };
    await expect(
      assertQueueReplayAndForgery({
        adapter,
        valid,
        duplicate: { ...valid },
        forged: { ...valid, userId: fixture.beta.user.id },
      })
    ).resolves.toBeUndefined();
  });

  it("requires tenant evidence in every reviewed query plan", async () => {
    await expect(
      assertTenantQueryPlans(
        {
          async explain(context, query) {
            return `Index Scan ${query} Index Cond: (user_id = '${context.userId}')`;
          },
        },
        [fixture.alpha.auth.session, fixture.beta.auth.session]
      )
    ).resolves.toBeUndefined();
  });

  it("provides deterministic one-shot outage injection", async () => {
    const faults = new DeterministicFaultInjector();
    faults.fail("export.upload", 2);
    await expect(faults.hit("export.upload")).rejects.toThrow("Injected outage");
    expect(faults.pending()).toEqual({ "export.upload": 1 });
    await expect(faults.hit("export.upload")).rejects.toThrow("Injected outage");
    await expect(faults.hit("export.upload")).resolves.toBeUndefined();
    expect(faults.pending()).toEqual({});
  });

  it("recovers export and deletion checkpoints without partial or duplicate effects", async () => {
    const operations = new Map<
      string,
      {
        kind: "export" | "deletion";
        status: "pending" | "running" | "ready" | "completed" | "failed";
        effectCount: number;
      }
    >();
    let sequence = 0;
    await expect(
      assertLifecycleRecovery(
        {
          async start(kind) {
            const id = `${kind}-${++sequence}`;
            operations.set(id, { kind, status: "pending", effectCount: 0 });
            return id;
          },
          async run(kind, id, faults) {
            const operation = operations.get(id)!;
            if (operation.status === "ready" || operation.status === "completed") return;
            operation.status = "running";
            await faults.hit(`${kind}.external-effect`);
            operation.effectCount += 1;
            operation.status = kind === "export" ? "ready" : "completed";
          },
          async snapshot(_kind, id) {
            const operation = operations.get(id)!;
            return {
              status: operation.status,
              checkpoint: { effectComplete: operation.effectCount > 0 },
              partialArtifactVisible: false,
              irreversibleEffectCount: operation.effectCount,
            };
          },
        },
        fixture.alpha.auth.session
      )
    ).resolves.toBeUndefined();
  });

  it("fails closed when the Phase 3 adapter bundle is partial or has extras", () => {
    expect(() =>
      assertCompletePhase3SecurityAdapters(
        Object.fromEntries(PHASE3_SECURITY_ADAPTER_KEYS.map((key) => [key, {}]))
      )
    ).not.toThrow();
    expect(() => assertCompletePhase3SecurityAdapters({ csrf: {} })).toThrow("adapters drifted");
    expect(() =>
      assertCompletePhase3SecurityAdapters({
        ...Object.fromEntries(PHASE3_SECURITY_ADAPTER_KEYS.map((key) => [key, {}])),
        optionalSkippedGate: {},
      })
    ).toThrow("adapters drifted");
  });

  it("coordinates a race without sleeps", async () => {
    const barrier = new DeterministicBarrier(2);
    const order: string[] = [];
    const participant = async (name: string) => {
      order.push(`${name}:arrived`);
      await barrier.arrive();
      order.push(`${name}:released`);
    };
    const race = Promise.all([participant("delete"), participant("queue")]);
    await barrier.waitUntilReady();
    expect(order.sort()).toEqual(["delete:arrived", "queue:arrived"]);
    barrier.releaseAll();
    await race;
    expect(order).toHaveLength(4);
  });
});
