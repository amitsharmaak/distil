import { PostgresDigestStore } from "../postgres-store";
import { createAuthContext } from "@/lib/contracts/tenant-context";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

const tenantStore = (sql: never) => new PostgresDigestStore(sql, context);

type Query = { text: string; values: unknown[] };
type Row = Record<string, unknown>;

const preferences: Row = {
  digest_enabled: true,
  digest_timezone: "Asia/Kolkata",
  personalization_enabled: false,
  updated_at: "2026-09-07T00:00:00.000Z",
};
const run: Row = {
  id: "digest-1",
  local_date: "2026-09-07",
  timezone: "Asia/Kolkata",
  status: "degraded",
  content_mode: "deterministic",
  selection_version: "deterministic-v1",
  selection_metadata: { source: "test" },
  title_text: "Digest",
  summary_text: "Summary",
  created_at: "2026-09-07T00:00:00.000Z",
  completed_at: "2026-09-07T00:00:00.000Z",
  dismissed_at: null,
};
const item: Row = {
  digest_run_id: "digest-1",
  item_id: "item-1",
  category: "resurfaced",
  position: 0,
  reason: "Worth revisiting",
  title_snapshot: "Title",
  summary_snapshot: "Summary",
  selection_metadata: { source: "test" },
  dismissed_at: null,
};
const digestInput = {
  id: "digest-1",
  localDate: "2026-09-07",
  timezone: "Asia/Kolkata",
  status: "degraded" as const,
  contentMode: "deterministic" as const,
  selectionVersion: "deterministic-v1",
  selectionMetadata: {},
  title: "Digest",
  summary: "Summary",
  createdAt: "2026-09-07T00:00:00.000Z",
  completedAt: "2026-09-07T00:00:00.000Z",
  items: [
    {
      ...item,
      digestRunId: "digest-1",
      itemId: "item-1",
      selectionMetadata: {},
      title: "Title",
      summary: "Summary",
    },
  ],
};

function fakeSql(rows: (query: Query) => Row[]) {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = { text: strings.join("?"), values };
    return Promise.resolve(rows(query));
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>;
    begin<T>(callback: (transaction: typeof sql) => Promise<T>): Promise<T>;
    json(value: unknown): unknown;
  };
  sql.begin = async (callback) => callback(sql);
  sql.json = (value) => value;
  return sql;
}

describe("PostgresDigestStore", () => {
  it("maps preferences, hydrated digests, candidates, and the stable enqueue ledger", async () => {
    const sql = fakeSql(({ text }) => {
      if (text.includes("INSERT INTO personal_preferences")) return [];
      if (text.includes("personal_preferences")) return [preferences];
      if (text.includes("FROM digest_items")) return [item];
      if (text.includes("FROM digest_runs")) return [run];
      if (text.includes("INSERT INTO digest_jobs")) {
        return [
          {
            id: "job-1",
            local_date: "2026-09-07",
            idempotency_key: "digest:2026-09-07",
            status: "queued",
            requested_by: "cron",
            created_at: "2026-09-07T00:00:00.000Z",
          },
        ];
      }
      return [];
    });
    const store = tenantStore(sql as never);

    await expect(store.getPreferences()).resolves.toMatchObject({
      digestEnabled: true,
      digestTimezone: "Asia/Kolkata",
      personalizationEnabled: false,
    });
    await expect(store.updatePreferences({ digestEnabled: false })).resolves.toMatchObject({
      digestEnabled: true,
    });
    await expect(
      store.updatePreferences({ digestTimezone: "UTC", personalizationEnabled: true })
    ).resolves.toMatchObject({ digestTimezone: "Asia/Kolkata" });
    await expect(store.resetPreferences()).resolves.toMatchObject({
      digestTimezone: "Asia/Kolkata",
    });
    await expect(store.findDigest("2026-09-07")).resolves.toMatchObject({
      id: "digest-1",
      items: [{ itemId: "item-1", category: "resurfaced" }],
    });
    await expect(store.listDigests(1)).resolves.toHaveLength(1);
    await expect(
      store.enqueue({
        id: "new-job",
        localDate: "2026-09-07",
        idempotencyKey: "digest:2026-09-07",
        status: "queued",
        requestedBy: "cron",
        createdAt: "2026-09-07T00:00:00.000Z",
      })
    ).resolves.toMatchObject({ id: "job-1", requestedBy: "cron" });
  });

  it("maps priority and resurfacing candidates without leaking SQL row names", async () => {
    const candidate = {
      id: "candidate-1",
      title: "Candidate",
      summary: "Candidate summary",
      priority: "medium",
      manual_priority: null,
      created_at: new Date("2026-09-01T00:00:00.000Z"),
    };
    const priorityStore = tenantStore(fakeSql(() => [candidate]) as never);
    const resurfacedStore = tenantStore(fakeSql(() => [candidate]) as never);

    await expect(priorityStore.listPriorityCandidates()).resolves.toEqual([
      expect.objectContaining({
        id: "candidate-1",
        summary: "Candidate summary",
        manualPriority: undefined,
      }),
    ]);
    await expect(resurfacedStore.listResurfacedCandidates()).resolves.toEqual([
      expect.objectContaining({ id: "candidate-1", createdAt: "2026-09-01T00:00:00.000Z" }),
    ]);

    const fallbackStore = tenantStore(
      fakeSql(() => [{ ...candidate, summary: null, manual_priority: "high" }]) as never
    );
    await expect(fallbackStore.listPriorityCandidates()).resolves.toEqual([
      expect.objectContaining({ summary: "", manualPriority: "high" }),
    ]);
  });

  it("creates a new digest or returns the unique local-date winner after a concurrent conflict", async () => {
    const inserted = tenantStore(
      fakeSql(({ text }) =>
        text.includes("INSERT INTO digest_runs") ? [{ id: "digest-1" }] : []
      ) as never
    );
    await expect(inserted.createDigest(digestInput as never)).resolves.toBe(digestInput);
    await expect(
      inserted.createDigest({
        ...digestInput,
        completedAt: undefined,
        dismissedAt: "2026-09-07T02:00:00.000Z",
        items: [{ ...digestInput.items[0], dismissedAt: "2026-09-07T02:00:00.000Z" }],
      } as never)
    ).resolves.toMatchObject({ dismissedAt: "2026-09-07T02:00:00.000Z" });

    const conflict = tenantStore(
      fakeSql(({ text }) => {
        if (text.includes("INSERT INTO digest_runs")) return [];
        if (text.includes("FROM digest_items")) return [item];
        if (text.includes("FROM digest_runs")) return [run];
        return [];
      }) as never
    );
    await expect(conflict.createDigest(digestInput as never)).resolves.toMatchObject({
      id: "digest-1",
    });

    await expect(
      tenantStore(fakeSql(() => []) as never).createDigest(digestInput as never)
    ).rejects.toThrow("Unable to create digest");
  });

  it("maps persisted timestamps and handles a priority-item dismissal without a resurfacing event", async () => {
    const dismissedRun = {
      ...run,
      completed_at: "2026-09-07T01:00:00.000Z",
      dismissed_at: "2026-09-07T02:00:00.000Z",
      selection_metadata: [],
    };
    const dismissedItem = {
      ...item,
      category: "priority",
      dismissed_at: "2026-09-07T02:00:00.000Z",
      selection_metadata: null,
    };
    const store = tenantStore(
      fakeSql(({ text }) => {
        if (text.includes("UPDATE digest_runs")) return [dismissedRun];
        if (text.includes("UPDATE digest_items")) return [dismissedItem];
        if (text.includes("FROM digest_items")) return [dismissedItem];
        return [];
      }) as never
    );

    await expect(
      store.dismissDigest("digest-1", "2026-09-07T02:00:00.000Z")
    ).resolves.toMatchObject({
      dismissedAt: "2026-09-07T02:00:00.000Z",
      selectionMetadata: {},
    });
    await expect(
      store.dismissDigestItem("digest-1", "item-1", "2026-09-07T02:00:00.000Z")
    ).resolves.toMatchObject({ dismissedAt: "2026-09-07T02:00:00.000Z", selectionMetadata: {} });
  });

  it("maps nullable run timestamps and supports the empty hydration default", () => {
    const store = tenantStore(fakeSql(() => []) as never) as unknown as {
      mapRun(
        row: Row,
        items?: never[]
      ): { completedAt?: string; dismissedAt?: string; items: unknown[] };
    };

    expect(store.mapRun({ ...run, completed_at: null, dismissed_at: null })).toEqual(
      expect.objectContaining({ completedAt: undefined, dismissedAt: undefined, items: [] })
    );
  });

  it("writes a durable dismissal and cooldown event only for resurfaced items", async () => {
    const sql = fakeSql(({ text }) => {
      if (text.includes("UPDATE digest_items")) return [item];
      return [];
    });
    const store = tenantStore(sql as never);

    await expect(
      store.dismissDigestItem("digest-1", "item-1", "2026-09-07T01:00:00.000Z")
    ).resolves.toMatchObject({ itemId: "item-1", dismissedAt: undefined });
  });

  it("returns no record for unknown digest dismissal targets", async () => {
    const store = tenantStore(fakeSql(() => []) as never);
    await expect(
      store.dismissDigest("missing", "2026-09-07T01:00:00.000Z")
    ).resolves.toBeUndefined();
    await expect(
      store.dismissDigestItem("missing", "item-1", "2026-09-07T01:00:00.000Z")
    ).resolves.toBeUndefined();
  });
});
