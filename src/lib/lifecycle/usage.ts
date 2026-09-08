import type { RepositorySet } from "@/lib/repositories/ports";

export async function getAccountUsage(repositories: RepositorySet, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const from = `${date.slice(0, 7)}-01`;
  const [counters, quotas] = await Promise.all([
    repositories.lifecycle.getUsage({ from, through: date }),
    repositories.lifecycle.listQuotas(),
  ]);
  const consumed = counters.reduce<
    Record<
      string,
      { requestCount: number; inputTokens: number; outputTokens: number; costMicrousd: number }
    >
  >((totals, counter) => {
    const key = `${counter.operation}:${counter.provider}`;
    const existing = totals[key] ?? {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      costMicrousd: 0,
    };
    totals[key] = {
      requestCount: existing.requestCount + counter.requestCount,
      inputTokens: existing.inputTokens + counter.inputTokens,
      outputTokens: existing.outputTokens + counter.outputTokens,
      costMicrousd: existing.costMicrousd + counter.costMicrousd,
    };
    return totals;
  }, {});
  const limits = Object.fromEntries(quotas.map((quota) => [quota.quotaKey, quota]));
  const aiQuota = quotas.find(({ quotaKey }) => quotaKey === "ai.requests");
  const aiRequests = counters
    .filter(({ operation }) => operation === "ai.requests")
    .reduce((sum, counter) => sum + counter.requestCount, 0);
  return {
    date,
    periodStart: from,
    limits,
    consumed,
    remaining: aiQuota ? { "ai.requests": Math.max(0, aiQuota.hardLimit - aiRequests) } : {},
    aiAvailable: !aiQuota || aiRequests < aiQuota.hardLimit,
  };
}
