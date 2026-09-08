import { getAccountUsage } from "@/lib/lifecycle/usage";

describe("tenant-local account usage", () => {
  it("aggregates provider counters and clamps exhausted AI quota", async () => {
    const lifecycle = {
      getUsage: jest.fn().mockResolvedValue([
        {
          date: "2026-09-01",
          operation: "ai.requests",
          provider: "openai",
          requestCount: 3,
          inputTokens: 100,
          outputTokens: 25,
          costMicrousd: 50,
        },
        {
          date: "2026-09-08",
          operation: "ai.requests",
          provider: "openai",
          requestCount: 4,
          inputTokens: 200,
          outputTokens: 50,
          costMicrousd: 75,
        },
        {
          date: "2026-09-08",
          operation: "ai.requests",
          provider: "local",
          requestCount: 2,
          inputTokens: 0,
          outputTokens: 0,
          costMicrousd: 0,
        },
      ]),
      listQuotas: jest.fn().mockResolvedValue([
        { quotaKey: "ai.requests", period: "month", hardLimit: 8 },
        { quotaKey: "account.exports", period: "month", hardLimit: 2 },
      ]),
    };

    await expect(
      getAccountUsage({ lifecycle } as never, new Date("2026-09-08T12:00:00.000Z"))
    ).resolves.toEqual({
      date: "2026-09-08",
      periodStart: "2026-09-01",
      limits: {
        "ai.requests": { quotaKey: "ai.requests", period: "month", hardLimit: 8 },
        "account.exports": { quotaKey: "account.exports", period: "month", hardLimit: 2 },
      },
      consumed: {
        "ai.requests:openai": {
          requestCount: 7,
          inputTokens: 300,
          outputTokens: 75,
          costMicrousd: 125,
        },
        "ai.requests:local": {
          requestCount: 2,
          inputTokens: 0,
          outputTokens: 0,
          costMicrousd: 0,
        },
      },
      remaining: { "ai.requests": 0 },
      aiAvailable: false,
    });
    expect(lifecycle.getUsage).toHaveBeenCalledWith({
      from: "2026-09-01",
      through: "2026-09-08",
    });
  });

  it("keeps AI available when no explicit quota exists", async () => {
    const lifecycle = {
      getUsage: jest.fn().mockResolvedValue([]),
      listQuotas: jest.fn().mockResolvedValue([]),
    };

    await expect(
      getAccountUsage({ lifecycle } as never, new Date("2026-01-02T00:00:00.000Z"))
    ).resolves.toMatchObject({
      date: "2026-01-02",
      periodStart: "2026-01-01",
      limits: {},
      consumed: {},
      remaining: {},
      aiAvailable: true,
    });
  });
});
