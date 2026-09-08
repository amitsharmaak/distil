import {
  DigestError,
  dismissDigest,
  dismissDigestItem,
  enqueueDigest,
  localDateFor,
  runDigest,
  selectDigestItems,
} from "../service";
import type { DigestStore, PersonalPreferences } from "../types";
import { createAuthContext } from "@/lib/contracts/tenant-context";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

const preferences: PersonalPreferences = {
  digestEnabled: true,
  digestTimezone: "Asia/Kolkata",
  personalizationEnabled: true,
  updatedAt: "2026-09-07T00:00:00.000Z",
};

function store(overrides: Partial<DigestStore> = {}): DigestStore {
  return {
    getPreferences: jest.fn().mockResolvedValue(preferences),
    updatePreferences: jest.fn(),
    resetPreferences: jest.fn(),
    findDigest: jest.fn().mockResolvedValue(undefined),
    listDigests: jest.fn(),
    createDigest: jest.fn().mockImplementation(async (digest) => digest),
    dismissDigest: jest.fn(),
    dismissDigestItem: jest.fn(),
    listPriorityCandidates: jest.fn().mockResolvedValue([
      {
        id: "p1",
        title: "P1",
        summary: "",
        priority: "high",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "p2",
        title: "P2",
        summary: "two",
        priority: "medium",
        createdAt: "2026-08-02T00:00:00.000Z",
      },
      {
        id: "p3",
        title: "P3",
        summary: "three",
        priority: "low",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
      {
        id: "p4",
        title: "P4",
        summary: "four",
        priority: "low",
        createdAt: "2026-08-04T00:00:00.000Z",
      },
    ]),
    listResurfacedCandidates: jest.fn().mockResolvedValue([
      {
        id: "r1",
        title: "R1",
        summary: "one",
        priority: "low",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "r2",
        title: "R2",
        summary: "two",
        priority: "low",
        createdAt: "2026-07-02T00:00:00.000Z",
      },
    ]),
    enqueue: jest.fn().mockImplementation(async (job) => job),
    ...overrides,
  };
}

describe("digest selection", () => {
  it("selects at most three priority and two resurfaced items, then fills deterministically", () => {
    const items = selectDigestItems(
      [
        {
          id: "p1",
          title: "P1",
          summary: "",
          priority: "high",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "p2",
          title: "P2",
          summary: "",
          priority: "medium",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "p3",
          title: "P3",
          summary: "",
          priority: "low",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "p4",
          title: "P4",
          summary: "",
          priority: "low",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      [
        {
          id: "r1",
          title: "R1",
          summary: "",
          priority: "low",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ]
    );
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.category)).toEqual([
      "priority",
      "priority",
      "priority",
      "resurfaced",
      "priority",
    ]);
    expect(items[0].summary).toBe("Saved 2026-08-01.");
  });

  it("is opt-in and idempotent for a local date", async () => {
    const disabled = store({
      getPreferences: jest.fn().mockResolvedValue({ ...preferences, digestEnabled: false }),
    });
    await expect(runDigest(context, disabled, { idempotencyKey: "one" })).rejects.toMatchObject({
      code: "DIGEST_DISABLED",
    });
    const existing = { id: "old", localDate: "2026-09-07" };
    const existingStore = store({ findDigest: jest.fn().mockResolvedValue(existing) });
    await expect(
      runDigest(context, existingStore, { idempotencyKey: "one", localDate: "2026-09-07" })
    ).resolves.toBe(existing);
  });

  it("stores deterministic degraded results and only enqueues opted-in cron work", async () => {
    const repository = store();
    const digest = await runDigest(
      context,
      repository,
      { idempotencyKey: "one", localDate: "2026-09-07" },
      new Date("2026-09-07T01:00:00.000Z")
    );
    expect(digest.contentMode).toBe("deterministic");
    expect(digest.status).toBe("degraded");
    expect(digest.title).toBe("Your digest for 2026-09-07");
    expect(digest.items).toHaveLength(5);
    await expect(
      enqueueDigest(context, repository, preferences, "cron", new Date("2026-09-07T01:00:00.000Z"))
    ).resolves.toMatchObject({ requestedBy: "cron" });
    await expect(
      enqueueDigest(context, repository, { ...preferences, digestEnabled: false }, "cron")
    ).resolves.toBeUndefined();
  });

  it("validates timezone names without silently changing a local date", () => {
    expect(localDateFor("Asia/Kolkata", new Date("2026-09-06T20:00:00.000Z"))).toBe("2026-09-07");
    expect(() => localDateFor("not-a-timezone")).toThrow(DigestError);
  });

  it("persists item dismissal and makes missing digest items explicit", async () => {
    const repository = store({
      dismissDigestItem: jest
        .fn()
        .mockResolvedValue({ itemId: "r1", dismissedAt: "2026-09-07T01:00:00.000Z" }),
    });
    await expect(dismissDigestItem(context, repository, "digest-1", "r1")).resolves.toMatchObject({
      itemId: "r1",
    });
    expect(repository.dismissDigestItem).toHaveBeenCalledWith("digest-1", "r1", expect.any(String));
    await expect(dismissDigestItem(context, store(), "digest-1", "missing")).rejects.toMatchObject({
      code: "DIGEST_ITEM_NOT_FOUND",
    });
  });

  it("fills priority gaps from resurfacing and preserves the selected category metadata", () => {
    const items = selectDigestItems(
      [],
      [
        {
          id: "r1",
          title: "R1",
          summary: "",
          priority: "low",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ]
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: "resurfaced",
      position: 0,
      summary: "Saved 2026-07-01.",
      selectionMetadata: { deterministicSummary: true, category: "resurfaced" },
    });
  });

  it("keeps a manual priority in the deterministic reason and singular digest copy", async () => {
    const manual = {
      id: "manual",
      title: "Manual",
      summary: "",
      priority: "low" as const,
      manualPriority: "high" as const,
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    expect(selectDigestItems([manual], [])).toEqual([
      expect.objectContaining({
        reason: "Unread high priority item.",
        selectionMetadata: expect.objectContaining({ effectivePriority: "high" }),
      }),
    ]);

    const repository = store({
      listPriorityCandidates: jest.fn().mockResolvedValue([manual]),
      listResurfacedCandidates: jest.fn().mockResolvedValue([]),
    });
    await expect(
      runDigest(context, repository, { idempotencyKey: "one", localDate: "2026-09-07" })
    ).resolves.toMatchObject({ summary: "A deterministic selection of 1 item for today." });
  });

  it("uses the preference-local date and treats digest dismissal as idempotent", async () => {
    const repository = store({
      dismissDigest: jest.fn().mockResolvedValue({ id: "digest-1", dismissedAt: "already" }),
    });
    const digest = await runDigest(
      context,
      repository,
      { idempotencyKey: "one" },
      new Date("2026-09-06T20:00:00.000Z")
    );

    expect(digest.localDate).toBe("2026-09-07");
    await expect(dismissDigest(context, repository, "digest-1")).resolves.toMatchObject({
      id: "digest-1",
    });
    await expect(dismissDigest(context, store(), "missing")).rejects.toMatchObject({
      code: "DIGEST_NOT_FOUND",
    });
  });

  it("produces a stable empty deterministic digest message", async () => {
    const repository = store({
      listPriorityCandidates: jest.fn().mockResolvedValue([]),
      listResurfacedCandidates: jest.fn().mockResolvedValue([]),
    });
    await expect(
      runDigest(
        context,
        repository,
        { idempotencyKey: "empty", localDate: "2026-09-07" },
        new Date("2026-09-07T00:00:00.000Z")
      )
    ).resolves.toMatchObject({ summary: "No eligible unread or resurfaced items today." });
  });
});
