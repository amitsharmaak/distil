import type { AuthContext, TwoTenantFixture } from "./phase3-tenancy";

export interface SecurityResponse {
  readonly status: number;
  readonly body?: unknown;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stable(value: unknown): string {
  const canonical = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(canonical);
    if (!record(candidate)) return candidate;
    return Object.fromEntries(
      Object.entries(candidate)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  };
  return JSON.stringify(canonical(value));
}

function responseBodyEqual(left: SecurityResponse, right: SecurityResponse): boolean {
  return stable(left.body) === stable(right.body);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (record(value)) {
    for (const [key, entry] of Object.entries(value)) {
      keys.push(key);
      collectKeys(entry, keys);
    }
  }
  return keys;
}

export interface MutationCsrfAdapter {
  /** Every cookie-authenticated, tenant-mutating route, in matrix surface form. */
  readonly surfaces: readonly string[];
  invoke(input: {
    surface: string;
    context: AuthContext;
    origin?: string;
  }): Promise<SecurityResponse>;
  effects(): Promise<unknown>;
}

/**
 * Generated CSRF gate. Adapter and reviewed matrix surfaces must match in both
 * directions so a new mutation cannot silently miss the hostile-origin case.
 */
export async function assertGeneratedCsrfCoverage(
  adapter: MutationCsrfAdapter,
  reviewedSurfaces: readonly string[],
  context: AuthContext
): Promise<void> {
  const implemented = new Set(adapter.surfaces);
  const reviewed = new Set(reviewedSurfaces);
  invariant(
    implemented.size === adapter.surfaces.length,
    "CSRF adapter contains duplicate surfaces"
  );
  for (const surface of reviewed) {
    invariant(implemented.has(surface), `CSRF adapter is missing reviewed surface: ${surface}`);
  }
  for (const surface of implemented) {
    invariant(reviewed.has(surface), `CSRF adapter has an unreviewed surface: ${surface}`);
  }

  for (const surface of [...reviewed].sort()) {
    for (const origin of [undefined, "https://hostile.example"] as const) {
      const before = stable(await adapter.effects());
      const response = await adapter.invoke({ surface, context, origin });
      invariant(response.status === 403, `${surface} accepted ${origin ?? "a missing Origin"}`);
      invariant(
        stable(await adapter.effects()) === before,
        `${surface} changed state before rejecting ${origin ?? "a missing Origin"}`
      );
    }
  }
}

export const EXPORT_FORBIDDEN_KEY_PATTERN =
  /(?:password|secret|token(?:Hash|Salt)?|accessToken|refreshToken|sessionHash|cookie|oauthCode|objectRef|encryptionKey)/i;

export interface AccountExportAdapter {
  readonly allowedTopLevelSections: readonly string[];
  seed(fixture: TwoTenantFixture): Promise<void>;
  build(context: AuthContext): Promise<unknown>;
  download(context: AuthContext, exportId: string): Promise<SecurityResponse>;
  readonly unknownExportId: string;
}

/** P3-EXPORT-001/002: allowlisted export with cross-tenant download concealment. */
export async function assertAccountExportPrivacy(
  adapter: AccountExportAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  await adapter.seed(fixture);
  const exported = await adapter.build(fixture.alpha.auth.session);
  invariant(record(exported), "Account export must be a JSON object");
  const expected = [...adapter.allowedTopLevelSections].sort();
  invariant(expected.length > 0, "Account export must declare a non-empty section allowlist");
  invariant(
    new Set(expected).size === expected.length,
    "Account export allowlist contains duplicates"
  );
  invariant(
    JSON.stringify(Object.keys(exported).sort()) === JSON.stringify(expected),
    "Account export contains a missing or non-allowlisted top-level section"
  );
  const forbiddenKey = collectKeys(exported).find((key) => EXPORT_FORBIDDEN_KEY_PATTERN.test(key));
  invariant(!forbiddenKey, `Account export contains forbidden key: ${forbiddenKey}`);

  const serialized = JSON.stringify(exported);
  invariant(serialized.includes(fixture.alpha.canaries.itemTitle), "Export omitted alpha content");
  for (const forbidden of [
    fixture.alpha.canaries.bearerToken,
    fixture.alpha.canaries.sessionCookie,
    fixture.alpha.canaries.oauthCode,
    ...Object.values(fixture.beta.canaries),
  ]) {
    invariant(
      !serialized.includes(forbidden),
      `Account export leaked forbidden canary: ${forbidden}`
    );
  }

  const guessed = await adapter.download(
    fixture.beta.auth.session,
    fixture.alpha.resources.exportId
  );
  const absent = await adapter.download(fixture.beta.auth.session, adapter.unknownExportId);
  invariant(guessed.status === 404 && absent.status === 404, "Foreign exports must return 404");
  invariant(
    responseBodyEqual(guessed, absent),
    "Foreign and missing export responses must be indistinguishable"
  );
}

export interface AccountDeletionSnapshot {
  readonly accountStatus: string;
  readonly activeSessionIds: readonly string[];
  readonly activeCaptureTokenIds: readonly string[];
  readonly runnableJobIds: readonly string[];
  readonly connectorIds: readonly string[];
  readonly objectRefs: readonly string[];
  readonly personalRowCount: number;
  readonly deletionStatus: string;
  readonly checkpoint: Readonly<Record<string, unknown>>;
}

export interface AccountDeletionAdapter {
  seed(fixture: TwoTenantFixture): Promise<void>;
  request(context: AuthContext): Promise<SecurityResponse>;
  cancel(context: AuthContext): Promise<SecurityResponse>;
  run(input: { userId: string; deletionId: string; traceId: string }): Promise<void>;
  authenticate(context: AuthContext): Promise<boolean>;
  snapshot(context: AuthContext): Promise<AccountDeletionSnapshot>;
}

export interface DeletionQueueRaceAdapter {
  seed(fixture: TwoTenantFixture): Promise<void>;
  beginJob(context: AuthContext): Promise<() => Promise<"committed" | "rejected">>;
  requestDeletion(context: AuthContext): Promise<void>;
  effects(context: AuthContext): Promise<unknown>;
}

/** A job claimed before deletion must recheck account state before committing. */
export async function assertDeletionQueueRace(
  adapter: DeletionQueueRaceAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  await adapter.seed(fixture);
  const alphaCommit = await adapter.beginJob(fixture.alpha.auth.system);
  await adapter.requestDeletion(fixture.alpha.auth.session);
  const alphaBefore = stable(await adapter.effects(fixture.alpha.auth.system));
  invariant((await alphaCommit()) === "rejected", "Claimed job committed after account disable");
  invariant(
    stable(await adapter.effects(fixture.alpha.auth.system)) === alphaBefore,
    "Rejected post-deletion job caused tenant side effects"
  );

  const betaCommit = await adapter.beginJob(fixture.beta.auth.system);
  invariant((await betaCommit()) === "committed", "Unrelated tenant job was blocked by deletion");
}

/**
 * P3-DELETE-001/002: request revokes access first; duplicate workers are
 * idempotent; another user remains usable and unchanged.
 */
export async function assertTwoUserDeletionLifecycle(
  adapter: AccountDeletionAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  await adapter.seed(fixture);
  const betaBefore = await adapter.snapshot(fixture.beta.auth.session);
  const response = await adapter.request(fixture.alpha.auth.session);
  invariant(response.status === 202, "Deletion request must be durably accepted");

  const afterRequest = await adapter.snapshot(fixture.alpha.auth.session);
  invariant(
    afterRequest.accountStatus === "deletion_pending",
    "Deletion must disable the account before purge work"
  );
  invariant(afterRequest.activeSessionIds.length === 0, "Deletion must revoke sessions first");
  invariant(
    afterRequest.activeCaptureTokenIds.length === 0,
    "Deletion must revoke capture tokens first"
  );
  invariant(
    !(await adapter.authenticate(fixture.alpha.auth.session)),
    "Deleted account still authenticates"
  );

  const envelope = {
    userId: fixture.alpha.user.id,
    deletionId: fixture.alpha.resources.deletionId,
    traceId: fixture.alpha.auth.system.requestId,
  };
  await Promise.all([adapter.run(envelope), adapter.run(envelope)]);
  const complete = await adapter.snapshot(fixture.alpha.auth.session);
  invariant(complete.deletionStatus === "completed", "Deletion did not reach completed");
  invariant(complete.personalRowCount === 0, "Deletion left personal database rows");
  invariant(complete.runnableJobIds.length === 0, "Deletion left runnable jobs");
  invariant(complete.connectorIds.length === 0, "Deletion left connector credentials");
  invariant(complete.objectRefs.length === 0, "Deletion left object-store artifacts");
  invariant(
    JSON.stringify(await adapter.snapshot(fixture.beta.auth.session)) ===
      JSON.stringify(betaBefore),
    "Alpha deletion changed beta lifecycle state"
  );
}

export interface ConnectorOAuthStateAdapter {
  issue(input: {
    context: AuthContext;
    provider: "gmail" | "slack";
    returnPath: string;
  }): Promise<{ nonce: string; returnPath: string }>;
  consume(input: {
    context: AuthContext;
    provider: "gmail" | "slack";
    nonce: string;
  }): Promise<{ userId: string; returnPath: string } | undefined>;
}

export interface SessionDevice {
  readonly id: string;
  readonly current: boolean;
  readonly [key: string]: unknown;
}

export interface SessionAbuseAdapter {
  seed(fixture: TwoTenantFixture): Promise<void>;
  list(context: AuthContext): Promise<readonly SessionDevice[]>;
  revoke(context: AuthContext, deviceId: string): Promise<SecurityResponse>;
  authenticate(context: AuthContext, sessionId: string): Promise<boolean>;
}

/** P3-SESSION-001: device metadata is safe and revocation stays owner-bound and immediate. */
export async function assertSessionAbuseSafety(
  adapter: SessionAbuseAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  await adapter.seed(fixture);
  const alphaDevices = await adapter.list(fixture.alpha.auth.session);
  invariant(
    alphaDevices.some(({ id, current }) => id === fixture.alpha.resources.sessionId && current),
    "Current session is not identified in its device list"
  );
  invariant(
    alphaDevices.some(
      ({ id, current }) => id === fixture.alpha.resources.otherSessionId && !current
    ),
    "Another owned session is missing from the device list"
  );
  invariant(
    !alphaDevices.some(({ id }) => id === fixture.beta.resources.sessionId),
    "Device list exposed another tenant's session"
  );
  const serialized = stable(alphaDevices);
  for (const forbidden of [
    fixture.alpha.canaries.sessionCookie,
    fixture.beta.canaries.sessionCookie,
    fixture.alpha.canaries.bearerToken,
    fixture.beta.canaries.bearerToken,
  ]) {
    invariant(
      !serialized.includes(forbidden),
      "Device list exposed provider or bearer credentials"
    );
  }

  const foreign = await adapter.revoke(
    fixture.alpha.auth.session,
    fixture.beta.resources.sessionId
  );
  invariant(foreign.status === 404, "Foreign device revocation was not concealed");
  invariant(
    await adapter.authenticate(fixture.beta.auth.session, fixture.beta.resources.sessionId),
    "Foreign device guess revoked another tenant's session"
  );
  const current = await adapter.revoke(
    fixture.alpha.auth.session,
    fixture.alpha.resources.sessionId
  );
  invariant(current.status === 404, "Targeted revoke accepted the current session");
  invariant(
    await adapter.authenticate(fixture.alpha.auth.session, fixture.alpha.resources.sessionId),
    "Rejected current-device revocation changed authentication state"
  );
  const owned = await adapter.revoke(
    fixture.alpha.auth.session,
    fixture.alpha.resources.otherSessionId
  );
  invariant(owned.status === 200, "Owned non-current session was not revoked");
  invariant(
    !(await adapter.authenticate(
      fixture.alpha.auth.session,
      fixture.alpha.resources.otherSessionId
    )),
    "Revoked session remained authenticated"
  );
}

export interface InvitationAbuseAdapter {
  requestMagicLink(input: {
    invitationToken: string;
    email: string;
    origin: string;
  }): Promise<SecurityResponse>;
  complete(input: {
    invitationState: string;
    providerSessionId: string;
  }): Promise<SecurityResponse & { activated: boolean }>;
  providerDispatchCount(): Promise<number>;
  accountActivationCount(): Promise<number>;
}

/**
 * One invitation cannot be replayed into an email burst or concurrent account
 * activations. Denials stay generic and have no provider/account side effects.
 */
export async function assertInvitationReplaySafety(
  adapter: InvitationAbuseAdapter,
  input: {
    invitationToken: string;
    invitationState: string;
    email: string;
    providerSessionId: string;
  }
): Promise<void> {
  const dispatchBefore = await adapter.providerDispatchCount();
  const [first, replay] = await Promise.all([
    adapter.requestMagicLink({
      invitationToken: input.invitationToken,
      email: input.email,
      origin: "https://distil.example",
    }),
    adapter.requestMagicLink({
      invitationToken: input.invitationToken,
      email: input.email,
      origin: "https://distil.example",
    }),
  ]);
  invariant(
    [first.status, replay.status].every((status) => status === 202 || status === 403),
    "Invitation request returned an unexpected disclosure-prone response"
  );
  invariant(
    (await adapter.providerDispatchCount()) - dispatchBefore === 1,
    "Invitation replay reached the provider more than once"
  );

  const hostile = await adapter.requestMagicLink({
    invitationToken: input.invitationToken,
    email: input.email,
    origin: "https://hostile.example",
  });
  invariant(hostile.status === 403, "Hostile-origin magic-link request was accepted");

  const activationBefore = await adapter.accountActivationCount();
  const completions = await Promise.all([
    adapter.complete({
      invitationState: input.invitationState,
      providerSessionId: input.providerSessionId,
    }),
    adapter.complete({
      invitationState: input.invitationState,
      providerSessionId: input.providerSessionId,
    }),
  ]);
  invariant(
    completions.filter(({ activated }) => activated).length === 1,
    "Concurrent invitation completion did not have exactly one winner"
  );
  invariant(
    (await adapter.accountActivationCount()) - activationBefore === 1,
    "Concurrent invitation completion activated more than one account"
  );
}

/** OAuth state is owner/session/provider bound, single use, and not burnable cross-tenant. */
export async function assertOAuthStateIsolation(
  adapter: ConnectorOAuthStateAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  const state = await adapter.issue({
    context: fixture.alpha.auth.session,
    provider: "gmail",
    returnPath: "/\\hostile.example",
  });
  invariant(state.returnPath === "/sources", "OAuth return path can escape the application origin");
  invariant(
    (await adapter.consume({
      context: fixture.beta.auth.session,
      provider: "gmail",
      nonce: state.nonce,
    })) === undefined,
    "Another user consumed OAuth state"
  );
  invariant(
    (await adapter.consume({
      context: fixture.alpha.auth.session,
      provider: "slack",
      nonce: state.nonce,
    })) === undefined,
    "OAuth state accepted the wrong provider"
  );
  const consumed = await adapter.consume({
    context: fixture.alpha.auth.session,
    provider: "gmail",
    nonce: state.nonce,
  });
  invariant(
    consumed?.userId === fixture.alpha.user.id,
    "Owner could not consume intact OAuth state"
  );
  invariant(
    (await adapter.consume({
      context: fixture.alpha.auth.session,
      provider: "gmail",
      nonce: state.nonce,
    })) === undefined,
    "OAuth state replay succeeded"
  );
}

export interface LogRedactionAdapter {
  write(value: unknown): Promise<void>;
  output(): Promise<string>;
}

function encodedForms(value: string): string[] {
  return [
    value,
    encodeURIComponent(value),
    Buffer.from(value, "utf8").toString("base64"),
    Buffer.from(value, "utf8").toString("base64url"),
  ];
}

/** P3-LOG-001: secrets and user content stay out of serialized logs, including errors. */
export async function assertLogRedaction(
  adapter: LogRedactionAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  const canaries = Object.values(fixture.alpha.canaries);
  await adapter.write({
    authorization: `Bearer ${fixture.alpha.canaries.bearerToken}`,
    cookie: `session=${fixture.alpha.canaries.sessionCookie}`,
    url: `https://distil.example/callback?code=${fixture.alpha.canaries.oauthCode}`,
    prompt: fixture.alpha.canaries.itemBody,
    err: new Error(`provider failed: ${fixture.alpha.canaries.oauthCode}`),
    userId: fixture.alpha.user.id,
    requestId: fixture.alpha.auth.session.requestId,
  });
  const output = await adapter.output();
  for (const canary of canaries.flatMap(encodedForms)) {
    invariant(!output.includes(canary), `Log output leaked sensitive canary: ${canary}`);
  }
  invariant(output.includes(fixture.alpha.user.id), "Log output omitted opaque tenant id");
  invariant(output.includes(fixture.alpha.auth.session.requestId), "Log output omitted request id");
}

export interface RetryQueueAdapter<TMessage> {
  consume(message: TMessage): Promise<"processed" | "duplicate" | "rejected">;
  effects(): Promise<unknown>;
}

/** Duplicate/retry delivery is idempotent and a forged owner has no effect. */
export async function assertQueueReplayAndForgery<TMessage>(input: {
  adapter: RetryQueueAdapter<TMessage>;
  valid: TMessage;
  duplicate: TMessage;
  forged: TMessage;
}): Promise<void> {
  invariant(
    (await input.adapter.consume(input.valid)) === "processed",
    "First delivery was not processed"
  );
  const once = stable(await input.adapter.effects());
  invariant(
    (await input.adapter.consume(input.duplicate)) === "duplicate",
    "Duplicate was not identified"
  );
  invariant(
    stable(await input.adapter.effects()) === once,
    "Duplicate delivery repeated side effects"
  );
  invariant(
    (await input.adapter.consume(input.forged)) === "rejected",
    "Forged delivery was accepted"
  );
  invariant(stable(await input.adapter.effects()) === once, "Forged delivery caused side effects");
}

export interface QueryPlanAdapter {
  explain(context: AuthContext, query: "feed" | "search" | "export" | "deletion"): Promise<string>;
}

/** Early Wave 4 guard: every reviewed plan must visibly constrain the tenant before scanning. */
export async function assertTenantQueryPlans(
  adapter: QueryPlanAdapter,
  contexts: readonly AuthContext[]
): Promise<void> {
  for (const context of contexts) {
    for (const query of ["feed", "search", "export", "deletion"] as const) {
      const plan = (await adapter.explain(context, query)).toLowerCase();
      invariant(plan.includes("user_id"), `${query} query plan has no tenant predicate`);
      invariant(
        !plan.includes("filter: (true)"),
        `${query} query plan contains an unscoped filter`
      );
    }
  }
}

export interface FaultInjector {
  hit(point: string): Promise<void>;
}

export interface RecoverySnapshot {
  readonly status: "pending" | "running" | "ready" | "completed" | "failed";
  readonly checkpoint: Readonly<Record<string, unknown>>;
  readonly partialArtifactVisible: boolean;
  readonly irreversibleEffectCount: number;
}

export interface LifecycleRecoveryAdapter {
  start(kind: "export" | "deletion", context: AuthContext): Promise<string>;
  run(kind: "export" | "deletion", operationId: string, faults: FaultInjector): Promise<void>;
  snapshot(kind: "export" | "deletion", operationId: string): Promise<RecoverySnapshot>;
}

/** P3-RECOVERY-001: checkpointed lifecycle work survives an outage and replay. */
export async function assertLifecycleRecovery(
  adapter: LifecycleRecoveryAdapter,
  context: AuthContext
): Promise<void> {
  for (const kind of ["export", "deletion"] as const) {
    const operationId = await adapter.start(kind, context);
    const failurePoint = `${kind}.external-effect`;
    const faults = new DeterministicFaultInjector();
    faults.fail(failurePoint);
    let failed = false;
    try {
      await adapter.run(kind, operationId, faults);
    } catch {
      failed = true;
    }
    invariant(failed, `${kind} ignored injected outage`);
    const interrupted = await adapter.snapshot(kind, operationId);
    invariant(!interrupted.partialArtifactVisible, `${kind} exposed a partial artifact`);

    await adapter.run(kind, operationId, faults);
    const recovered = await adapter.snapshot(kind, operationId);
    invariant(
      recovered.status === (kind === "export" ? "ready" : "completed"),
      `${kind} did not recover to its terminal state`
    );
    invariant(recovered.irreversibleEffectCount === 1, `${kind} repeated its external effect`);
    await adapter.run(kind, operationId, faults);
    const replayed = await adapter.snapshot(kind, operationId);
    invariant(
      replayed.irreversibleEffectCount === 1,
      `${kind} repeated its external effect after terminal replay`
    );
  }
}

export const PHASE3_SECURITY_ADAPTER_KEYS = [
  "csrf",
  "export",
  "deletion",
  "deletionQueueRace",
  "session",
  "invitation",
  "oauthState",
  "logging",
  "queue",
  "queryPlans",
  "recovery",
] as const;

/** Explicit adapter inventory: missing, renamed, or extra gates fail at startup. */
export function assertCompletePhase3SecurityAdapters(
  adapters: Readonly<Record<string, unknown>>
): void {
  const expected = [...PHASE3_SECURITY_ADAPTER_KEYS].sort();
  const actual = Object.keys(adapters).sort();
  invariant(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Phase 3 security adapters drifted: expected ${expected.join(", ")}; got ${actual.join(", ")}`
  );
  for (const key of expected)
    invariant(adapters[key] !== undefined, `Missing Phase 3 adapter: ${key}`);
}

/** Deterministic, one-shot outage seam for retry/recovery tests. */
export class DeterministicFaultInjector implements FaultInjector {
  private readonly remaining = new Map<string, number>();

  fail(point: string, times = 1): void {
    invariant(Number.isInteger(times) && times > 0, "Fault count must be a positive integer");
    this.remaining.set(point, times);
  }

  async hit(point: string): Promise<void> {
    const remaining = this.remaining.get(point) ?? 0;
    if (remaining === 0) return;
    if (remaining === 1) this.remaining.delete(point);
    else this.remaining.set(point, remaining - 1);
    throw new Error(`Injected outage at ${point}`);
  }

  pending(): Readonly<Record<string, number>> {
    return Object.fromEntries(
      [...this.remaining.entries()].sort(([left], [right]) => left.localeCompare(right))
    );
  }
}

/** A barrier that makes races deterministic without sleeps or wall-clock timing. */
export class DeterministicBarrier {
  private waiting = 0;
  private release: (() => void) | undefined;
  private readonly readyPromise: Promise<void>;
  private ready: (() => void) | undefined;

  constructor(private readonly parties: number) {
    invariant(Number.isInteger(parties) && parties > 0, "Barrier parties must be positive");
    this.readyPromise = new Promise((resolve) => {
      this.ready = resolve;
    });
  }

  async arrive(): Promise<void> {
    this.waiting += 1;
    if (this.waiting === this.parties) this.ready?.();
    await new Promise<void>((resolve) => {
      const prior = this.release;
      this.release = () => {
        prior?.();
        resolve();
      };
    });
  }

  async waitUntilReady(): Promise<void> {
    await this.readyPromise;
  }

  releaseAll(): void {
    invariant(this.waiting === this.parties, "Barrier released before every party arrived");
    this.release?.();
  }
}
