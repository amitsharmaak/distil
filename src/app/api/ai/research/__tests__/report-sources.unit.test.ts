const requireTenantRoute = jest.fn();
jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: (...args: unknown[]) => requireTenantRoute(...args),
  tenantRouteFailureResponse: () => Response.json({ error: "auth" }, { status: 401 }),
}));

import { GET as getReport } from "../[id]/route";
import { GET as listReports } from "../list/route";
import { GET as listSuggestions } from "../suggestions/route";

const citedSources = [
  { id: 1, url: "https://who.int/r", title: "WHO report", domain: "who.int", grounded: true },
  { id: 2, url: "https://nih.gov/a", title: "nih.gov", domain: "nih.gov", grounded: false },
];

function record(id: string, sources: unknown) {
  return {
    id,
    query: "q",
    report: "Claim [1][2].",
    sources: JSON.stringify(sources),
    model: "m",
    status: "completed",
    createdAt: "2026-09-30T10:00:00.000Z",
    completedAt: "2026-09-30T10:05:00.000Z",
    progress: null,
  };
}

const repositories = {
  research: {
    findReport: jest.fn(),
    listReportSummaries: jest.fn(),
    listPendingSuggestions: jest.fn(),
    updateReport: jest.fn(),
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  requireTenantRoute.mockResolvedValue({ context: {}, repositories });
});

it("passes stored source objects through the report route unchanged", async () => {
  repositories.research.findReport.mockResolvedValue(record("r1", citedSources));
  const response = await getReport(new Request("http://localhost/api/ai/research/r1"), {
    params: Promise.resolve({ id: "r1" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.report.sources).toEqual(citedSources);
  expect(body.report.report).toBe("Claim [1][2].");
  expect(response.headers.get("server-timing")).toMatch(/^total;dur=\d+\.\d$/);
});

it("returns only bounded card metadata from the report list", async () => {
  const largeBody = "x".repeat(20_000);
  repositories.research.listReportSummaries.mockResolvedValue(
    Array.from({ length: 5 }, (_, index) => ({
      ...record(`r${index}`, citedSources),
      query: `Representative research question ${index} ${"q".repeat(120)}`,
      report: largeBody,
    }))
  );

  const response = await listReports(new Request("http://localhost/api/ai/research/list"));
  const body = await response.json();
  expect(repositories.research.listReportSummaries).toHaveBeenCalledWith(50);
  expect(body.reports).toHaveLength(5);
  expect(Object.keys(body.reports[0])).toEqual([
    "id",
    "query",
    "status",
    "createdAt",
    "completedAt",
  ]);
  for (const report of body.reports) {
    expect(report).not.toHaveProperty("report");
    expect(report).not.toHaveProperty("sources");
    expect(report).not.toHaveProperty("model");
    expect(report).not.toHaveProperty("progress");
  }
  expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeLessThan(5_000);
  expect(response.headers.get("server-timing")).toMatch(/^total;dur=\d+\.\d$/);
});

it("repairs a stale list projection but still exposes card fields only", async () => {
  const stale = {
    id: "stale",
    query: "abandoned research",
    status: "researching",
    createdAt: "2020-01-01T00:00:00.000Z",
    progress: null,
  };
  repositories.research.listReportSummaries.mockResolvedValue([stale]);
  repositories.research.updateReport.mockResolvedValue({
    ...record("stale", []),
    query: stale.query,
    status: "failed",
    createdAt: stale.createdAt,
    completedAt: "2026-10-01T00:00:00.000Z",
  });

  const response = await listReports(new Request("http://localhost/api/ai/research/list"));
  const body = await response.json();

  expect(repositories.research.updateReport).toHaveBeenCalledWith(
    "stale",
    expect.objectContaining({ status: "failed", progress: null })
  );
  expect(body.reports[0]).toEqual({
    id: "stale",
    query: "abandoned research",
    status: "failed",
    createdAt: "2020-01-01T00:00:00.000Z",
    completedAt: "2026-10-01T00:00:00.000Z",
  });
});

it("keeps list authorization required", async () => {
  requireTenantRoute.mockRejectedValueOnce(new Error("auth rejected"));

  const response = await listReports(new Request("http://localhost/api/ai/research/list"));

  expect(response.status).toBe(401);
  expect(repositories.research.listReportSummaries).not.toHaveBeenCalled();
});

it("keeps detail authorization required", async () => {
  requireTenantRoute.mockRejectedValueOnce(new Error("auth rejected"));

  const response = await getReport(new Request("http://localhost/api/ai/research/r1"), {
    params: Promise.resolve({ id: "r1" }),
  });

  expect(response.status).toBe(401);
  expect(repositories.research.findReport).not.toHaveBeenCalled();
});

it("keeps suggestions authorization required", async () => {
  requireTenantRoute.mockRejectedValueOnce(new Error("auth rejected"));

  const response = await listSuggestions(
    new Request("http://localhost/api/ai/research/suggestions")
  );

  expect(response.status).toBe(401);
  expect(repositories.research.listPendingSuggestions).not.toHaveBeenCalled();
});

it("adds request timing to the existing suggestions projection", async () => {
  repositories.research.listPendingSuggestions.mockResolvedValue([
    {
      id: "suggestion-1",
      topicKey: "performance",
      topic: "Performance",
      reason: "Several saved items cover it",
      suggestedQuery: "What changed?",
      sourceItemIds: ["item-1"],
      status: "pending",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ]);

  const response = await listSuggestions(
    new Request("http://localhost/api/ai/research/suggestions")
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("server-timing")).toMatch(/^total;dur=\d+\.\d$/);
  await expect(response.json()).resolves.toEqual({
    suggestions: [
      {
        id: "suggestion-1",
        topic: "Performance",
        reason: "Several saved items cover it",
        suggestedQuery: "What changed?",
        sourceItemIds: ["item-1"],
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ],
  });
});
